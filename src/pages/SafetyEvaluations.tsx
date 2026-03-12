import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ShieldCheck, FileSpreadsheet, Download } from "lucide-react";
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
  entwurf: "Entwurf",
  ausgefuellt: "Ausgefüllt",
  diskutiert: "Diskutiert",
  abgeschlossen: "Abgeschlossen",
};

const STATUS_COLORS: Record<string, string> = {
  entwurf: "bg-gray-100 text-gray-700",
  ausgefuellt: "bg-blue-100 text-blue-700",
  diskutiert: "bg-yellow-100 text-yellow-700",
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

  // Filters
  const [filterProject, setFilterProject] = useState("alle");
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

  // Signature counts per evaluation
  const [signatureCounts, setSignatureCounts] = useState<Record<string, { signed: number; total: number }>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);

    const [{ data: evalData }, { data: projData }] = await Promise.all([
      supabase.from("safety_evaluations").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
    ]);

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
    if (!form.titel.trim() || !form.project_id) {
      toast({ variant: "destructive", title: "Fehler", description: "Titel und Projekt sind erforderlich" });
      return;
    }
    setSaving(true);

    const { data, error } = await supabase
      .from("safety_evaluations")
      .insert({
        titel: form.titel.trim(),
        typ: form.typ,
        kategorie: form.kategorie.trim() || null,
        project_id: form.project_id,
        created_by: userId,
        checklist_items: checklistItems,
      })
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
          url: "/my-safety",
        },
      });
    }

    toast({ title: "Evaluierung erstellt" });
    setShowCreate(false);
    resetForm();
    fetchData();

    if (data) navigate(`/safety-evaluations/${data.id}`);
    setSaving(false);
  };

  const resetForm = () => {
    setForm({ titel: "", typ: "sicherheitsunterweisung", kategorie: "", project_id: "" });
    setChecklistItems([]);
    setSelectedEmployees([]);
  };

  const filtered = evaluations.filter((e) => {
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
      <PageHeader title="Evaluierungen & Unterweisungen" backPath="/" />

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
            <DialogTitle>Neue Evaluierung / Unterweisung</DialogTitle>
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
            <div>
              <Label>Projekt *</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Checklist Import */}
            <div>
              <Label>Checkliste</Label>
              <div className="mt-1.5">
                {checklistItems.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-muted-foreground">
                      {checklistItems.length} Prüfpunkte importiert
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowExcelImport(true)}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      Erneut importieren
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExcelImport(true)}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-1" />
                    Aus Excel importieren
                  </Button>
                )}
              </div>
            </div>

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
