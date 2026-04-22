import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SignaturePad } from "@/components/SignaturePad";
import { FileText, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type ChecklistItem = {
  id: string;
  category?: string;
  question: string;
};

type Evaluation = {
  id: string;
  titel: string;
  modul: string;
  pdf_urls: string[] | null;
  fragen: Array<{ id: string; frage: string; optionen: string[]; korrekt: number }> | null;
  checklist_items: any;
  project_id: string;
};

export default function SafetyCompletion() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [step, setStep] = useState<"intro" | "pdfs" | "checkliste" | "fragen" | "bestaetigung" | "unterschrift" | "fertig">("intro");
  const [pdfIdx, setPdfIdx] = useState(0);
  const [antworten, setAntworten] = useState<Record<string, number>>({}); // frage_id -> gewaehlte option
  const [checklistTicks, setChecklistTicks] = useState<Record<string, boolean>>({}); // item_id -> abgehakt
  const [bestaetigt, setBestaetigt] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      setUserId(user.id);

      // Vorname/Nachname fuer Signatur
      const { data: emp } = await supabase.from("employees").select("vorname, nachname").eq("user_id", user.id).maybeSingle();
      if (emp) setSignatureName(`${emp.vorname || ""} ${emp.nachname || ""}`.trim());

      // Evaluation laden
      const { data: ev } = await supabase.from("safety_evaluations").select("*").eq("id", id).maybeSingle();
      if (!ev) {
        toast({ variant: "destructive", title: "Unterweisung nicht gefunden" });
        navigate("/safety/nachweise");
        return;
      }
      setEvaluation(ev as Evaluation);

      // Schon unterschrieben?
      const { data: sig } = await supabase
        .from("safety_evaluation_signatures")
        .select("id")
        .eq("evaluation_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (sig) {
        setStep("fertig");
      }
      setLoading(false);
    })();
  }, [id, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!evaluation) return null;

  const pdfs = evaluation.pdf_urls || [];
  const fragen = evaluation.fragen || [];
  const checklist: ChecklistItem[] = Array.isArray(evaluation.checklist_items) ? evaluation.checklist_items : [];
  const allQuestionsAnswered = fragen.every(f => antworten[f.id] != null);
  const allChecklistTicked = checklist.every(it => checklistTicks[it.id]);
  const richtige = fragen.filter(f => antworten[f.id] === f.korrekt).length;
  const checklistCategories = [...new Set(checklist.map(it => it.category || ""))];

  const steps: typeof step[] = ["intro"];
  if (pdfs.length > 0) steps.push("pdfs");
  if (checklist.length > 0) steps.push("checkliste");
  if (fragen.length > 0) steps.push("fragen");
  steps.push("bestaetigung", "unterschrift");
  const stepIdx = steps.indexOf(step);

  const next = () => {
    if (stepIdx < steps.length - 1) setStep(steps[stepIdx + 1]);
  };
  const prev = () => {
    if (stepIdx > 0) setStep(steps[stepIdx - 1]);
  };

  const handleFinish = async () => {
    if (!signatureData || !signatureName.trim()) {
      toast({ variant: "destructive", title: "Unterschrift erforderlich" });
      return;
    }
    setSaving(true);
    const fragen_antworten = fragen.map(f => ({
      frage_id: f.id,
      frage: f.frage,
      gewaehlt: antworten[f.id],
      korrekt: f.korrekt,
      ist_richtig: antworten[f.id] === f.korrekt,
    }));
    // Checklist-Ticks in personal_answers speichern (kompatibel zu altem Schema)
    const personal_answers = checklist.map(it => ({
      item_id: it.id,
      category: it.category || null,
      question: it.question,
      checked: !!checklistTicks[it.id],
    }));
    const { error } = await (supabase.from("safety_evaluation_signatures") as any).insert({
      evaluation_id: evaluation.id,
      user_id: userId,
      unterschrift: signatureData,
      unterschrift_name: signatureName.trim(),
      unterschrieben_am: new Date().toISOString(),
      fragen_antworten,
      inhalte_bestaetigt: bestaetigt,
      personal_answers,
    });
    if (error) {
      setSaving(false);
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }

    // Status der Unterweisung aktualisieren: wenn alle zugewiesenen MA unterschrieben haben
    // -> safety_evaluations.status = "abgeschlossen"
    try {
      const [{ count: empCount }, { count: sigCount }] = await Promise.all([
        supabase
          .from("safety_evaluation_employees")
          .select("*", { count: "exact", head: true })
          .eq("evaluation_id", evaluation.id),
        supabase
          .from("safety_evaluation_signatures")
          .select("*", { count: "exact", head: true })
          .eq("evaluation_id", evaluation.id),
      ]);
      if (empCount !== null && sigCount !== null && empCount > 0 && sigCount >= empCount) {
        await supabase
          .from("safety_evaluations")
          .update({ status: "abgeschlossen" })
          .eq("id", evaluation.id);
      }
    } catch (e) {
      // Status-Update ist best-effort, blockiert den Mitarbeiter nicht
      console.warn("Status-Update fehlgeschlagen:", e);
    }

    setSaving(false);
    setStep("fertig");
    toast({ title: "Bestätigung gespeichert" });
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Unterweisung bestätigen" backPath="/safety/nachweise" />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">{evaluation.titel}</CardTitle>
            <CardDescription>
              <Badge variant="outline">
                {evaluation.modul === "jahresunterweisung" ? "Jahresunterweisung"
                 : evaluation.modul === "geraeteunterweisung" ? "Geräteunterweisung"
                 : "Baustellenunterweisung"}
              </Badge>
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Schritt-Indikator */}
        {step !== "fertig" && (
          <div className="flex items-center gap-2 mb-4 text-xs">
            <span className="text-muted-foreground">Schritt {stepIdx + 1} von {steps.length}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }} />
            </div>
          </div>
        )}

        {step === "intro" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm">
                Willkommen bei der Unterweisung. Durchlaufe folgende Schritte:
              </p>
              <ul className="text-sm space-y-1.5 list-inside">
                {pdfs.length > 0 && <li>📄 {pdfs.length} PDF-Dokument{pdfs.length === 1 ? "" : "e"} lesen</li>}
                {checklist.length > 0 && <li>☑️ {checklist.length} Prüfpunkt{checklist.length === 1 ? "" : "e"} abhaken</li>}
                {fragen.length > 0 && <li>❓ {fragen.length} Frage{fragen.length === 1 ? "" : "n"} beantworten</li>}
                <li>✅ Inhalte bestätigen</li>
                <li>✍️ Digital unterschreiben</li>
              </ul>
              <Button className="w-full" onClick={next}>
                Starten <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "pdfs" && pdfs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">PDF-Dokument {pdfIdx + 1} / {pdfs.length}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <iframe src={pdfs[pdfIdx] + "#toolbar=1"} className="w-full h-[500px] rounded border" title={`PDF ${pdfIdx + 1}`} />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={pdfIdx === 0} onClick={() => setPdfIdx(pdfIdx - 1)}>
                  ← Vorheriges
                </Button>
                <Button variant="outline" className="flex-1" disabled={pdfIdx >= pdfs.length - 1} onClick={() => setPdfIdx(pdfIdx + 1)}>
                  Nächstes →
                </Button>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={prev}><ChevronLeft className="w-4 h-4 mr-1" /> Zurück</Button>
                <Button className="flex-1" onClick={next}>Gelesen — weiter <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "checkliste" && checklist.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checkliste ({Object.values(checklistTicks).filter(Boolean).length}/{checklist.length} abgehakt)</CardTitle>
              <CardDescription>Bitte alle Punkte bestätigen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {checklistCategories.map((cat) => (
                <div key={cat}>
                  {cat && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 border-b pb-1">
                      {cat}
                    </p>
                  )}
                  <div className="space-y-2">
                    {checklist.filter(it => (it.category || "") === cat).map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                          checklistTicks[item.id] ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={checklistTicks[item.id] ?? false}
                          onCheckedChange={(val) =>
                            setChecklistTicks(prev => ({ ...prev, [item.id]: !!val }))
                          }
                          className="mt-0.5 shrink-0"
                        />
                        <span className="text-sm leading-snug">{item.question}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={prev}><ChevronLeft className="w-4 h-4 mr-1" /> Zurück</Button>
                <Button className="flex-1" onClick={next} disabled={!allChecklistTicked}>
                  Weiter <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              {!allChecklistTicked && (
                <p className="text-xs text-muted-foreground text-center">Bitte alle Punkte abhaken</p>
              )}
            </CardContent>
          </Card>
        )}

        {step === "fragen" && fragen.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fragen zum Inhalt</CardTitle>
              <CardDescription>Wähle die richtige Antwort aus</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {fragen.map((f, i) => (
                <div key={f.id} className="space-y-2">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground mr-2">#{i + 1}</span>
                    {f.frage}
                  </p>
                  <div className="space-y-1.5">
                    {f.optionen.map((opt, oi) => (
                      <label
                        key={oi}
                        className={`flex items-center gap-3 p-2 rounded border-2 cursor-pointer transition-colors ${
                          antworten[f.id] === oi ? "border-primary bg-primary/5" : "border-muted hover:border-primary/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name={f.id}
                          checked={antworten[f.id] === oi}
                          onChange={() => setAntworten(prev => ({ ...prev, [f.id]: oi }))}
                        />
                        <span className="text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={prev}><ChevronLeft className="w-4 h-4 mr-1" /> Zurück</Button>
                <Button className="flex-1" onClick={next} disabled={!allQuestionsAnswered}>
                  Weiter <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              {!allQuestionsAnswered && (
                <p className="text-xs text-muted-foreground text-center">Bitte alle Fragen beantworten</p>
              )}
            </CardContent>
          </Card>
        )}

        {step === "bestaetigung" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bestätigung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {fragen.length > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  {richtige === fragen.length ? (
                    <><CheckCircle2 className="inline w-4 h-4 text-green-600 mr-1" /> Alle Fragen richtig beantwortet</>
                  ) : (
                    <><AlertCircle className="inline w-4 h-4 text-yellow-600 mr-1" /> {richtige} von {fragen.length} Fragen richtig</>
                  )}
                </div>
              )}
              <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer hover:border-primary/50">
                <Checkbox
                  checked={bestaetigt}
                  onCheckedChange={(v) => setBestaetigt(!!v)}
                />
                <span className="text-sm">
                  Ich bestätige, dass ich die Inhalte gelesen und verstanden habe
                  {pdfs.length > 0 && ` (${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"})`}
                  {checklist.length > 0 && `, die ${checklist.length} Prüfpunkt${checklist.length === 1 ? "" : "e"} abgehakt`}
                  {fragen.length > 0 && ` und die Fragen bearbeitet`}.
                </span>
              </label>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={prev}><ChevronLeft className="w-4 h-4 mr-1" /> Zurück</Button>
                <Button className="flex-1" onClick={next} disabled={!bestaetigt}>
                  Weiter <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "unterschrift" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unterschrift</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Vor- & Nachname" />
              </div>
              <div>
                <Label>Unterschrift *</Label>
                <div className="border rounded-lg overflow-hidden mt-1">
                  <SignaturePad onSignatureChange={setSignatureData} width={400} height={150} />
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={prev}><ChevronLeft className="w-4 h-4 mr-1" /> Zurück</Button>
                <Button className="flex-1" onClick={handleFinish} disabled={saving || !signatureData || !signatureName.trim()}>
                  {saving ? "Speichert..." : "Abschließen"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "fertig" && (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
              <h3 className="font-semibold">Unterweisung abgeschlossen</h3>
              <p className="text-sm text-muted-foreground">
                Deine Bestätigung wurde gespeichert und als PDF-Nachweis abgelegt.
              </p>
              <div className="flex gap-2 justify-center pt-2">
                <Button variant="outline" onClick={() => navigate("/safety/nachweise")}>
                  Meine Nachweise
                </Button>
                <Button onClick={() => navigate("/safety")}>
                  Zurück zur Sicherheit
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
