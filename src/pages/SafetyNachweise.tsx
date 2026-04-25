import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileCheck, CheckCircle2, AlertCircle, XCircle, Download, ChevronRight, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import { format, parseISO, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";

type Employee = { user_id: string; name: string };
type Row = {
  kind: "unterweisung" | "schulung";
  label: string;
  modul?: string;
  status: "ok" | "ablauf" | "fehlt" | "offen";
  datum?: string;
  bis?: string;
  id?: string;
};

export default function SafetyNachweise() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const admin = role?.role === "administrator";
      setIsAdmin(admin);

      if (admin) {
        const { data: emps } = await supabase.from("employees").select("user_id, vorname, nachname").not("user_id", "is", null).order("nachname");
        const mapped = (emps || []).map((e: any) => ({
          user_id: e.user_id,
          name: `${e.vorname || ""} ${e.nachname || ""}`.trim(),
        }));
        setEmployees(mapped);
        setSelectedUserId(user.id);
      } else {
        setSelectedUserId(user.id);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    (async () => {
      setLoading(true);
      // Unterweisungen des MA
      const { data: evals } = await supabase
        .from("safety_evaluation_signatures")
        .select("evaluation_id, unterschrieben_am")
        .eq("user_id", selectedUserId);

      const { data: allEvals } = await supabase
        .from("safety_evaluations")
        .select("id, titel, modul, jahr, status")
        .in("id", (evals || []).map((e: any) => e.evaluation_id).filter(Boolean).concat(["00000000-0000-0000-0000-000000000000"]));

      // MA-Evaluations-Zuweisungen (auch ohne Unterschrift = offen)
      const { data: assigned } = await supabase
        .from("safety_evaluation_employees")
        .select("evaluation_id")
        .eq("user_id", selectedUserId);

      const { data: assignedEvals } = await supabase
        .from("safety_evaluations")
        .select("id, titel, modul, jahr, status")
        .in("id", (assigned || []).map((e: any) => e.evaluation_id));

      // Zertifikate
      const { data: certs } = await supabase
        .from("schulung_zertifikate")
        .select("id, schulung_id, gueltig_ab, gueltig_bis, zertifikat_url")
        .eq("user_id", selectedUserId);

      const { data: schulungen } = await supabase.from("schulungen").select("id, name, ist_pflicht");

      const result: Row[] = [];

      // Unterweisungen
      const seen = new Set<string>();
      for (const ae of assignedEvals || []) {
        const sig = (evals || []).find((s: any) => s.evaluation_id === ae.id);
        result.push({
          kind: "unterweisung",
          label: ae.titel,
          modul: ae.modul,
          status: sig ? "ok" : "offen",
          datum: sig?.unterschrieben_am,
          id: ae.id,
        });
        seen.add(ae.id);
      }
      // Auch unterzeichnete ohne explizite Zuweisung (edge case)
      for (const e of allEvals || []) {
        if (!seen.has(e.id)) {
          const sig = (evals || []).find((s: any) => s.evaluation_id === e.id);
          if (sig) {
            result.push({ kind: "unterweisung", label: e.titel, modul: e.modul, status: "ok", datum: sig.unterschrieben_am, id: e.id });
          }
        }
      }

      // Schulungen: pro Schulung das aktuellste Zertifikat
      const latestCertPerSchulung = new Map<string, any>();
      for (const c of certs || []) {
        const existing = latestCertPerSchulung.get(c.schulung_id);
        if (!existing || (c.gueltig_ab > existing.gueltig_ab)) {
          latestCertPerSchulung.set(c.schulung_id, c);
        }
      }
      for (const s of schulungen || []) {
        const cert = latestCertPerSchulung.get(s.id);
        if (cert) {
          let status: Row["status"] = "ok";
          if (cert.gueltig_bis) {
            const days = differenceInDays(parseISO(cert.gueltig_bis), new Date());
            if (days < 0) status = "fehlt";
            else if (days < 60) status = "ablauf";
          }
          result.push({
            kind: "schulung",
            label: s.name,
            status,
            datum: cert.gueltig_ab,
            bis: cert.gueltig_bis,
          });
        } else if (s.ist_pflicht) {
          result.push({ kind: "schulung", label: s.name, status: "fehlt" });
        }
      }

      setRows(result);
      setLoading(false);
    })();
  }, [selectedUserId]);

  const selectedName = employees.find(e => e.user_id === selectedUserId)?.name || "Mein Nachweis";
  const offenCount = rows.filter(r => r.status === "offen" || r.status === "fehlt").length;
  const ablaufCount = rows.filter(r => r.status === "ablauf").length;

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let y = 20;
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("SCHAFFERHOFER BAU", 20, y);
    y += 7;
    doc.setDrawColor(61, 63, 71);
    doc.line(20, y, 190, y);
    y += 6;
    doc.setFontSize(14);
    doc.text("Sicherheits-Nachweise", 20, y);
    y += 6;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Mitarbeiter: ${selectedName}`, 20, y);
    y += 5;
    doc.text(`Erstellt: ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: de })}`, 20, y);
    y += 8;

    const writeRow = (r: Row) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const statusText =
        r.status === "ok" ? "OK"
        : r.status === "ablauf" ? "LAEUFT AB"
        : r.status === "fehlt" ? "FEHLT"
        : "OFFEN";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`[${statusText}]`, 20, y);
      doc.setFont("helvetica", "normal");
      const labelLines = doc.splitTextToSize(r.label, 120);
      doc.text(labelLines, 50, y);
      y += labelLines.length * 5;
      const kindLabel = r.kind === "unterweisung"
        ? (r.modul === "jahresunterweisung" ? "Jahresunterweisung" : r.modul === "geraeteunterweisung" ? "Geräteunterweisung" : "Baustellenunterweisung")
        : "Schulung";
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(kindLabel, 50, y);
      y += 4;
      if (r.datum) { doc.text(`Erfasst: ${format(parseISO(r.datum), "dd.MM.yyyy", { locale: de })}`, 50, y); y += 4; }
      if (r.bis) { doc.text(`Gültig bis: ${format(parseISO(r.bis), "dd.MM.yyyy", { locale: de })}`, 50, y); y += 4; }
      doc.setTextColor(0);
      y += 3;
    };

    const ok = rows.filter(r => r.status === "ok");
    const ablauf = rows.filter(r => r.status === "ablauf");
    const fehlt = rows.filter(r => r.status === "fehlt" || r.status === "offen");

    if (ok.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(34, 139, 34);
      doc.text("Gültige Nachweise", 20, y);
      y += 5;
      doc.setTextColor(0);
      for (const r of ok) writeRow(r);
      y += 4;
    }
    if (ablauf.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(200, 140, 0);
      doc.text("Laufen bald ab", 20, y);
      y += 5;
      doc.setTextColor(0);
      for (const r of ablauf) writeRow(r);
      y += 4;
    }
    if (fehlt.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(200, 0, 0);
      doc.text("Fehlt / Offen", 20, y);
      y += 5;
      doc.setTextColor(0);
      for (const r of fehlt) writeRow(r);
    }

    const fileName = `Nachweise_${selectedName.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`;
    doc.save(fileName);
    toast({ title: "PDF heruntergeladen" });
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Nachweise" backPath="/safety" />
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {isAdmin && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <FileCheck className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">Mitarbeiter:</span>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>{selectedName}</CardTitle>
              <div className="flex gap-2 items-center flex-wrap">
                {offenCount > 0 && <Badge className="bg-red-100 text-red-800">{offenCount} offen/fehlt</Badge>}
                {ablaufCount > 0 && <Badge className="bg-yellow-100 text-yellow-800">{ablaufCount} läuft bald ab</Badge>}
                {offenCount === 0 && ablaufCount === 0 && rows.length > 0 && <Badge className="bg-green-100 text-green-800">Alles aktuell</Badge>}
                {rows.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => exportPDF()}>
                    <FileText className="w-3.5 h-3.5 mr-1" /> PDF
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Lädt...</p> : rows.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Keine Einträge</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                    r.status === "ok" ? "bg-green-50 border-green-200 dark:bg-green-950/20"
                    : r.status === "ablauf" ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20"
                    : r.status === "fehlt" ? "bg-red-50 border-red-200 dark:bg-red-950/20"
                    : "bg-orange-50 border-orange-200 dark:bg-orange-950/20"
                  }`}>
                    {r.status === "ok" && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                    {r.status === "ablauf" && <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />}
                    {r.status === "fehlt" && <XCircle className="h-5 w-5 text-red-600 shrink-0" />}
                    {r.status === "offen" && <AlertCircle className="h-5 w-5 text-orange-600 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{r.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {r.kind === "unterweisung" ? (r.modul === "jahresunterweisung" ? "Jahr" : r.modul === "geraeteunterweisung" ? "Gerät" : "Baustelle") : "Schulung"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.datum && `Erfasst: ${format(parseISO(r.datum), "dd.MM.yyyy", { locale: de })}`}
                        {r.bis && ` · Gültig bis: ${format(parseISO(r.bis), "dd.MM.yyyy", { locale: de })}`}
                        {r.status === "offen" && "Noch nicht bestätigt"}
                        {r.status === "fehlt" && !r.bis && "Noch kein Nachweis vorhanden"}
                      </p>
                    </div>
                    {r.status === "offen" && r.kind === "unterweisung" && r.id && selectedUserId === currentUserId && (
                      <Button size="sm" onClick={() => navigate(`/safety/bestaetigen/${r.id}`)}>
                        Jetzt bestätigen <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
