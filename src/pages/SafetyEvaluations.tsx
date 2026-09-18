import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Plus, ShieldCheck, FileSpreadsheet, Download, X } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { SafetyExcelImportDialog, type ChecklistItem } from "@/components/safety/SafetyExcelImportDialog";
import { SafetyEmployeeSelector } from "@/components/safety/SafetyEmployeeSelector";

type Project = { id: string; name: string };

type Evaluation = {
  id: string;
  titel: string;
  typ: string;
  kategorie: string | null;
  status: string;
  project_id: string;
  created_at: string;
  created_by: string;
};

const STATUS_LABELS: Record<string, string> = {
  warte_auf_unterschrift: "Zur Unterschrift",
  abgeschlossen: "Unterschrieben",
};

const STATUS_COLORS: Record<string, string> = {
  warte_auf_unterschrift: "bg-orange-100 text-orange-700",
  abgeschlossen: "bg-green-100 text-green-700",
};

const TYP_LABELS: Record<string, string> = {
  evaluierung: "Evaluierung",
  sicherheitsunterweisung: "Sicherheitsunterweisung",
};

export default function SafetyEvaluations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Filters
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Modul aus URL-Pfad ableiten
  const pathModul =
    location.pathname.includes("jahresunterweisungen") ? "jahresunterweisung"
    : location.pathname.includes("geraeteunterweisungen") ? "geraeteunterweisung"
    : location.pathname.includes("baustellenunterweisungen") ? "baustellenunterweisung"
    : null;
  const [filterProject, setFilterProject] = useState(() => searchParams.get("project") || "alle");
  const [filterTyp, setFilterTyp] = useState("alle");
  const [filterStatus, setFilterStatus] = useState("alle");

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    titel: "",
    typ: "sicherheitsunterweisung" as string,
    kategorie: "",
    project_id: "",
  });
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [newKategorie, setNewKategorie] = useState("");
  const [newFrage, setNewFrage] = useState("");

  // PDFs
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);

  // Multi-Choice-Fragen (fuer Jahresunterweisung)
  type MCFrage = { id: string; frage: string; optionen: string[]; korrekt: number };
  const [mcFragen, setMcFragen] = useState<MCFrage[]>([]);
  const [neueFrage, setNeueFrage] = useState({ frage: "", optionen: ["", "", "", ""], korrekt: 0 });

  // Geraet-Auswahl fuer Geraeteunterweisung
  const [equipmentId, setEquipmentId] = useState("");
  const [equipmentList, setEquipmentList] = useState<{ id: string; name: string }[]>([]);

  // Vorlagen fuer Baustellenunterweisung
  const [vorlagen, setVorlagen] = useState<any[]>([]);
  const [alsVorlageSpeichern, setAlsVorlageSpeichern] = useState(false);
  const [vorlageAnwenden, setVorlageAnwenden] = useState("");

  // Signature counts per evaluation
  const [signatureCounts, setSignatureCounts] = useState<Record<string, { signed: number; total: number }>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (roleData?.role !== "administrator") {
      navigate("/safety/nachweise");
      return;
    }
    setIsAdmin(true);

    const [{ data: evalData }, { data: projData }, { data: equipData }, { data: vorlData }] = await Promise.all([
      supabase.from("safety_evaluations").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
      // Archivierte Geraete gehoeren nicht mehr in die Auswahl
      supabase.from("equipment").select("id, name").is("archiviert_am", null).order("name"),
      supabase.from("safety_evaluations").select("*").eq("ist_vorlage", true).order("titel"),
    ]);
    if (equipData) setEquipmentList(equipData);
    if (vorlData) setVorlagen(vorlData);

    if (evalData) {
      setEvaluations(evalData as Evaluation[]);

      // Fetch signature counts
      const evalIds = evalData.map((e: any) => e.id);
      if (evalIds.length > 0) {
        const [{ data: empData }, { data: sigData }] = await Promise.all([
          supabase.from("safety_evaluation_employees").select("evaluation_id, user_id").in("evaluation_id", evalIds),
          supabase.from("safety_evaluation_signatures").select("evaluation_id, user_id").in("evaluation_id", evalIds),
        ]);

        const counts: Record<string, { signed: number; total: number }> = {};
        for (const e of evalData) {
          const total = (empData || []).filter((x: any) => x.evaluation_id === e.id).length;
          const signed = (sigData || []).filter((x: any) => x.evaluation_id === e.id).length;
          counts[e.id] = { signed, total };
        }
        setSignatureCounts(counts);
      }
    }
    if (projData) setProjects(projData);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const handleCreate = async () => {
    // Fuer Vorlage: kein Projekt noetig
    if (!form.titel.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Titel ist erforderlich" });
      return;
    }
    if (!alsVorlageSpeichern && !form.project_id) {
      toast({ variant: "destructive", title: "Fehler", description: "Projekt ist erforderlich" });
      return;
    }
    setSaving(true);

    // PDFs hochladen
    const pdfUrls: string[] = [];
    for (const f of pdfFiles) {
      const ext = f.name.split(".").pop() || "pdf";
      const path = `unterweisungen/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("safety-materials").upload(path, f);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("safety-materials").getPublicUrl(path);
        pdfUrls.push(urlData.publicUrl);
      }
    }

    const { data, error } = await supabase
      .from("safety_evaluations")
      .insert({
        titel: form.titel.trim(),
        typ: form.typ,
        kategorie: form.kategorie.trim() || null,
        project_id: alsVorlageSpeichern ? null : form.project_id,
        created_by: userId,
        checklist_items: checklistItems,
        status: alsVorlageSpeichern ? "entwurf" : "warte_auf_unterschrift",
        modul: pathModul || "baustellenunterweisung",
        jahr: pathModul === "jahresunterweisung" ? new Date().getFullYear() : null,
        pdf_urls: pdfUrls,
        fragen: mcFragen,
        equipment_id: pathModul === "geraeteunterweisung" ? (equipmentId || null) : null,
        ist_vorlage: alsVorlageSpeichern,
      } as any)
      .select("id")
      .single();

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      setSaving(false);
      return;
    }

    // Add employees
    if (data && selectedEmployees.length > 0) {
      const empInserts = selectedEmployees.map((uid) => ({
        evaluation_id: data.id,
        user_id: uid,
      }));
      await supabase.from("safety_evaluation_employees").insert(empInserts);

      // Notify employees
      const notifs = selectedEmployees.map((uid) => ({
        user_id: uid,
        type: "safety_evaluation",
        title: "Neue Sicherheitsunterweisung",
        message: `${TYP_LABELS[form.typ]}: ${form.titel.trim()} — bitte unterschreiben`,
        metadata: { evaluation_id: data.id },
      }));
      await supabase.from("notifications").insert(notifs);

      // Push-Benachrichtigung senden
      supabase.functions.invoke("send-push", {
        body: {
          user_ids: selectedEmployees,
          title: "Neue Sicherheitsunterweisung",
          body: `${TYP_LABELS[form.typ]}: ${form.titel.trim()} — bitte unterschreiben`,
          url: "/safety/nachweise",
        },
      });
    }

    toast({ title: "Evaluierung erstellt", description: "Die Mitarbeiter wurden benachrichtigt." });
    setShowCreate(false);
    resetForm();
    fetchData();
    setSaving(false);
  };

  const resetForm = () => {
    setForm({ titel: "", typ: "sicherheitsunterweisung", kategorie: "", project_id: "" });
    setChecklistItems([]);
    setSelectedEmployees([]);
    setNewKategorie("");
    setNewFrage("");
    setPdfFiles([]);
    setMcFragen([]);
    setNeueFrage({ frage: "", optionen: ["", "", "", ""], korrekt: 0 });
    setEquipmentId("");
    setAlsVorlageSpeichern(false);
    setVorlageAnwenden("");
  };

  const addManualItem = () => {
    if (!newFrage.trim()) return;
    setChecklistItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        category: newKategorie.trim() || "Allgemein",
        question: newFrage.trim(),
      },
    ]);
    setNewFrage("");
    setNewKategorie("");
  };

  const filtered = evaluations.filter((e) => {
    if (pathModul && (e as any).modul !== pathModul) return false;
    if (filterProject !== "alle" && e.project_id !== filterProject) return false;
    if (filterTyp !== "alle" && e.typ !== filterTyp) return false;
    if (filterStatus !== "alle" && e.status !== filterStatus) return false;
    return true;
  });

  const exportToExcel = () => {
    const data = filtered.map((ev) => {
      const counts = signatureCounts[ev.id];
      return {
        Titel: ev.titel,
        Typ: TYP_LABELS[ev.typ] || ev.typ,
        Kategorie: ev.kategorie || "",
        Projekt: projectMap[ev.project_id] || "",
        Status: STATUS_LABELS[ev.status] || ev.status,
        "Erstellt am": new Date(ev.created_at).toLocaleDateString("de-AT"),
        Unterschriften: counts ? `${counts.signed}/${counts.total}` : "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } };
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = headerStyle;
    }
    ws["!cols"] = [{ wch: 35 }, { wch: 22 }, { wch: 15 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Evaluierungen");
    XLSX.writeFile(wb, `Evaluierungen_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <PageHeader
        title={
          pathModul === "jahresunterweisung" ? "Jahresunterweisungen"
          : pathModul === "geraeteunterweisung" ? "Geräteunterweisungen"
          : pathModul === "baustellenunterweisung" ? "Baustellenunterweisungen"
          : "Evaluierungen & Unterweisungen"
        }
        backPath={pathModul ? "/safety" : "/"}
      />

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">
          {evaluations.length} Dokumente gesamt
        </p>
        <div className="flex gap-2">
          {evaluations.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportToExcel}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
          )}
          <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Neue Evaluierung
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Projekte</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTyp} onValueChange={setFilterTyp}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Typen</SelectItem>
            <SelectItem value="evaluierung">Evaluierung</SelectItem>
            <SelectItem value="sicherheitsunterweisung">Sicherheitsunterweisung</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center py-8 text-muted-foreground">Lade...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4" />
            <p>Keine Evaluierungen gefunden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((ev) => {
            const counts = signatureCounts[ev.id];
            return (
              <Card
                key={ev.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/safety-evaluations/${ev.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{ev.titel}</span>
                        <Badge variant="outline" className="text-xs">{TYP_LABELS[ev.typ]}</Badge>
                        <Badge className={`text-xs ${STATUS_COLORS[ev.status] || ""}`}>
                          {STATUS_LABELS[ev.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {projectMap[ev.project_id] || "–"}
                        {ev.kategorie && ` · ${ev.kategorie}`}
                        {counts && ` · ${counts.signed}/${counts.total} Unterschriften`}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleDateString("de-AT")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(v) => { if (!v) resetForm(); setShowCreate(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {pathModul === "jahresunterweisung" ? "Neue Jahresunterweisung"
              : pathModul === "geraeteunterweisung" ? "Neue Geräteunterweisung"
              : pathModul === "baustellenunterweisung" ? "Neue Baustellenunterweisung"
              : "Neue Unterweisung"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titel *</Label>
              <Input
                value={form.titel}
                onChange={(e) => setForm({ ...form, titel: e.target.value })}
                placeholder="z.B. Sicherheitsunterweisung Hochbau Q1/2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Typ *</Label>
                <Select value={form.typ} onValueChange={(v) => setForm({ ...form, typ: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evaluierung">Evaluierung</SelectItem>
                    <SelectItem value="sicherheitsunterweisung">Sicherheitsunterweisung</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kategorie</Label>
                <Input
                  value={form.kategorie}
                  onChange={(e) => setForm({ ...form, kategorie: e.target.value })}
                  placeholder="z.B. Hochbau"
                />
              </div>
            </div>
            {!alsVorlageSpeichern && (
              <div>
                <Label>Projekt *</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Checklist */}
            <div>
              <Label>Checkliste ({checklistItems.length} Prüfpunkte)</Label>
              <div className="mt-1.5 space-y-2">
                {/* Existing items */}
                {checklistItems.length > 0 && (
                  <div className="border rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
                    {checklistItems.map((item, i) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        {item.category && item.category !== "Allgemein" && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{item.category}</span>
                        )}
                        <span className="flex-1 truncate">{item.question}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => setChecklistItems((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Manual add */}
                <div className="flex gap-2">
                  <Input
                    value={newKategorie}
                    onChange={(e) => setNewKategorie(e.target.value)}
                    placeholder="Kategorie"
                    className="w-28 text-sm"
                  />
                  <Input
                    value={newFrage}
                    onChange={(e) => setNewFrage(e.target.value)}
                    placeholder="Prüfpunkt hinzufügen…"
                    className="flex-1 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && addManualItem()}
                  />
                  <Button size="sm" variant="outline" onClick={addManualItem} disabled={!newFrage.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {/* Excel import */}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowExcelImport(true)}>
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Aus Excel importieren (KI)
                </Button>
              </div>
            </div>

            {/* Aus Vorlage anwenden (nur Baustelle) */}
            {pathModul === "baustellenunterweisung" && vorlagen.length > 0 && (
              <div>
                <Label>Aus Vorlage erstellen (optional)</Label>
                <Select value={vorlageAnwenden} onValueChange={(v) => {
                  setVorlageAnwenden(v);
                  const vorlage = vorlagen.find(x => x.id === v);
                  if (vorlage) {
                    setForm(f => ({ ...f, titel: vorlage.titel, kategorie: vorlage.kategorie || "", typ: vorlage.typ }));
                    setChecklistItems(vorlage.checklist_items || []);
                    setMcFragen(vorlage.fragen || []);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Keine Vorlage" /></SelectTrigger>
                  <SelectContent>
                    {vorlagen.map(v => <SelectItem key={v.id} value={v.id}>{v.titel}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Geraet-Auswahl (nur Geraeteunterweisung) */}
            {pathModul === "geraeteunterweisung" && (
              <div>
                <Label>Gerät *</Label>
                <Select value={equipmentId} onValueChange={setEquipmentId}>
                  <SelectTrigger><SelectValue placeholder="Gerät wählen..." /></SelectTrigger>
                  <SelectContent>
                    {equipmentList.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* PDFs hochladen */}
            <div>
              <Label>PDF-Dokumente (z.B. Unterweisungsunterlagen)</Label>
              <div className="mt-1.5 space-y-1.5">
                {pdfFiles.length > 0 && (
                  <div className="space-y-1">
                    {pdfFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 bg-muted/50 rounded text-xs">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <button type="button" className="text-destructive" onClick={() => setPdfFiles(pdfFiles.filter((_, idx) => idx !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Input
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) setPdfFiles(prev => [...prev, ...files]);
                    e.target.value = "";
                  }}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Multi-Choice-Fragen */}
            <div>
              <Label>Fragenkatalog ({mcFragen.length} Fragen)</Label>
              <div className="mt-1.5 space-y-2">
                {mcFragen.length > 0 && (
                  <div className="border rounded-md p-2 space-y-2 max-h-60 overflow-y-auto">
                    {mcFragen.map((q, i) => (
                      <div key={q.id} className="text-sm border-b pb-2 last:border-0">
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                          <span className="flex-1 font-medium">{q.frage}</span>
                          <button type="button" className="text-destructive" onClick={() => setMcFragen(prev => prev.filter(x => x.id !== q.id))}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="pl-5 text-xs text-muted-foreground">
                          {q.optionen.map((opt, oi) => (
                            <div key={oi}>
                              {oi === q.korrekt ? "✓" : "○"} {opt}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border rounded-md p-2 space-y-1.5 bg-muted/30">
                  <Input
                    placeholder="Frage..."
                    value={neueFrage.frage}
                    onChange={(e) => setNeueFrage({ ...neueFrage, frage: e.target.value })}
                    className="text-sm"
                  />
                  {neueFrage.optionen.map((opt, oi) => (
                    <div key={oi} className="flex gap-2 items-center">
                      <button
                        type="button"
                        className={`w-6 h-6 rounded-full border-2 shrink-0 ${neueFrage.korrekt === oi ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground"}`}
                        onClick={() => setNeueFrage({ ...neueFrage, korrekt: oi })}
                      >
                        {neueFrage.korrekt === oi && "✓"}
                      </button>
                      <Input
                        placeholder={`Antwort ${oi + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const opts = [...neueFrage.optionen];
                          opts[oi] = e.target.value;
                          setNeueFrage({ ...neueFrage, optionen: opts });
                        }}
                        className="text-sm h-8"
                      />
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!neueFrage.frage.trim() || neueFrage.optionen.filter(o => o.trim()).length < 2}
                    onClick={() => {
                      setMcFragen(prev => [...prev, {
                        id: crypto.randomUUID(),
                        frage: neueFrage.frage.trim(),
                        optionen: neueFrage.optionen.filter(o => o.trim()),
                        korrekt: neueFrage.korrekt,
                      }]);
                      setNeueFrage({ frage: "", optionen: ["", "", "", ""], korrekt: 0 });
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Frage hinzufügen
                  </Button>
                </div>
              </div>
            </div>

            {/* Als Vorlage speichern (nur Baustelle) */}
            {pathModul === "baustellenunterweisung" && (
              <label className="flex items-center gap-2 p-2 bg-muted/30 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsVorlageSpeichern}
                  onChange={(e) => setAlsVorlageSpeichern(e.target.checked)}
                />
                <span className="text-sm">Als Vorlage speichern (keine MA-Zuordnung, wiederverwendbar)</span>
              </label>
            )}

            {/* Employee Selection */}
            <div>
              <Label>Beteiligte Mitarbeiter</Label>
              <div className="mt-1.5">
                <SafetyEmployeeSelector
                  selectedIds={selectedEmployees}
                  onChange={setSelectedEmployees}
                />
              </div>
              {selectedEmployees.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedEmployees.length} Mitarbeiter ausgewählt
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setShowCreate(false); }}>
                Abbrechen
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Erstellt..." : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Excel Import */}
      <SafetyExcelImportDialog
        open={showExcelImport}
        onOpenChange={setShowExcelImport}
        onImport={setChecklistItems}
      />
    </div>
  );
}
