import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, FileSpreadsheet, MessageSquare, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SafetyChecklistEditor, type ChecklistAnswer } from "@/components/safety/SafetyChecklistEditor";
import { SafetySignatureCollector } from "@/components/safety/SafetySignatureCollector";
import { SafetyExcelImportDialog, type ChecklistItem } from "@/components/safety/SafetyExcelImportDialog";
import { SafetyEmployeeSelector } from "@/components/safety/SafetyEmployeeSelector";
import { generateSafetyEvaluationPDF } from "@/lib/generateSafetyEvaluationPDF";

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

type Employee = { id: string; vorname: string; nachname: string };
type Signature = {
  id: string;
  user_id: string;
  unterschrift: string;
  unterschrift_name: string;
  unterschrieben_am: string;
};

export default function SafetyEvaluationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [evaluation, setEvaluation] = useState<any>(null);
  const [projectName, setProjectName] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Editable state
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [answers, setAnswers] = useState<ChecklistAnswer[]>([]);
  const [diskussionNotizen, setDiskussionNotizen] = useState("");
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showEmployeeEditor, setShowEmployeeEditor] = useState(false);
  const [editEmployeeIds, setEditEmployeeIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setIsAdmin(roleData?.role === "administrator");
    }

    const { data: ev } = await supabase.from("safety_evaluations").select("*").eq("id", id).single();
    if (!ev) {
      setLoading(false);
      return;
    }

    setEvaluation(ev);
    setChecklistItems((ev.checklist_items as ChecklistItem[]) || []);
    setAnswers((ev.filled_answers as ChecklistAnswer[]) || []);
    setDiskussionNotizen(ev.diskussion_notizen || "");
    setIsCreator(user?.id === ev.created_by);

    // Project name
    const { data: proj } = await supabase.from("projects").select("name").eq("id", ev.project_id).single();
    if (proj) setProjectName(proj.name);

    // Employees + profiles
    const { data: empData } = await supabase
      .from("safety_evaluation_employees")
      .select("user_id")
      .eq("evaluation_id", id);
    const empIds = (empData || []).map((e: any) => e.user_id);
    setEmployeeIds(empIds);

    if (empIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, vorname, nachname")
        .in("id", empIds);
      setEmployees((profiles || []) as Employee[]);
    }

    // Signatures
    const { data: sigData } = await supabase
      .from("safety_evaluation_signatures")
      .select("*")
      .eq("evaluation_id", id);
    setSignatures((sigData || []) as Signature[]);

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const canEdit = isCreator || isAdmin;
  const status = evaluation?.status || "entwurf";

  const handleSaveChecklistStructure = async () => {
    if (!id) return;
    setSaving(true);

    const { error } = await supabase
      .from("safety_evaluations")
      .update({ checklist_items: checklistItems })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Checkliste gespeichert" });
      setEvaluation((prev: any) => ({ ...prev, checklist_items: checklistItems }));
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("Evaluierung wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.")) return;
    const { error } = await supabase.from("safety_evaluations").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Evaluierung gelöscht" });
      navigate("/safety-evaluations");
    }
  };

  const handleSaveDiscussion = async () => {
    if (!id) return;
    setSaving(true);

    const newStatus = status === "ausgefuellt" ? "diskutiert" : status;
    const { error } = await supabase
      .from("safety_evaluations")
      .update({
        diskussion_notizen: diskussionNotizen || null,
        status: newStatus,
      })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Diskussion gespeichert" });
      setEvaluation((prev: any) => ({ ...prev, status: newStatus, diskussion_notizen: diskussionNotizen }));
    }
    setSaving(false);
  };

  const handleSaveEmployees = async () => {
    if (!id) return;
    setSaving(true);

    // Remove all existing
    await supabase.from("safety_evaluation_employees").delete().eq("evaluation_id", id);

    // Insert new
    if (editEmployeeIds.length > 0) {
      const inserts = editEmployeeIds.map((uid) => ({
        evaluation_id: id,
        user_id: uid,
      }));
      await supabase.from("safety_evaluation_employees").insert(inserts);
    }

    toast({ title: "Mitarbeiter aktualisiert" });
    setShowEmployeeEditor(false);
    setSaving(false);
    fetchData();
  };

  const handleCheckComplete = async () => {
    // Auto-close if all signed
    if (signatures.length >= employees.length && employees.length > 0) {
      await supabase.from("safety_evaluations").update({ status: "abgeschlossen" }).eq("id", id);
      toast({ title: "Evaluierung abgeschlossen" });
      setEvaluation((prev: any) => ({ ...prev, status: "abgeschlossen" }));
    }
  };

  const handleExportPDF = () => {
    if (!evaluation) return;
    generateSafetyEvaluationPDF({
      titel: evaluation.titel,
      typ: evaluation.typ,
      kategorie: evaluation.kategorie,
      projektName: projectName,
      status: evaluation.status,
      created_at: evaluation.created_at,
      checklistItems,
      answers,
      diskussionNotizen,
      signatures,
      employees,
    });
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Lade...</p></div>;
  if (!evaluation) return <div className="flex items-center justify-center min-h-screen"><p>Nicht gefunden</p></div>;

  const typLabel = evaluation.typ === "evaluierung" ? "Evaluierung" : "Sicherheitsunterweisung";

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/safety-evaluations")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{evaluation.titel}</h1>
          <p className="text-sm text-muted-foreground">
            {typLabel} · {projectName}
            {evaluation.kategorie && ` · ${evaluation.kategorie}`}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1" />
            Löschen
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <Download className="w-4 h-4 mr-1" />
          PDF
        </Button>
        <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="checklist">Checkliste</TabsTrigger>
          <TabsTrigger value="discussion">Diskussion</TabsTrigger>
          <TabsTrigger value="signatures">
            Unterschriften ({signatures.length}/{employees.length})
          </TabsTrigger>
        </TabsList>

        {/* Checklist Tab */}
        <TabsContent value="checklist" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Checkliste</CardTitle>
                {canEdit && status === "entwurf" && (
                  <Button variant="outline" size="sm" onClick={() => setShowExcelImport(true)}>
                    <FileSpreadsheet className="w-4 h-4 mr-1" />
                    Excel importieren
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <SafetyChecklistEditor
                items={checklistItems}
                answers={answers}
                onChange={setAnswers}
                readOnly={true}
              />
              {canEdit && status === "entwurf" && checklistItems.length > 0 && (
                <div className="flex justify-end mt-4">
                  <Button onClick={handleSaveChecklistStructure} disabled={saving}>
                    <Save className="w-4 h-4 mr-1" />
                    {saving ? "Speichert..." : "Checkliste speichern"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employee management */}
          {canEdit && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Beteiligte Mitarbeiter ({employees.length})</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditEmployeeIds(employeeIds); setShowEmployeeEditor(!showEmployeeEditor); }}
                  >
                    {showEmployeeEditor ? "Abbrechen" : "Bearbeiten"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {showEmployeeEditor ? (
                  <div className="space-y-3">
                    <SafetyEmployeeSelector
                      selectedIds={editEmployeeIds}
                      onChange={setEditEmployeeIds}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleSaveEmployees} disabled={saving}>
                        {saving ? "Speichert..." : "Mitarbeiter speichern"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {employees.map((emp) => (
                      <Badge key={emp.id} variant="outline" className="text-xs">
                        {emp.vorname} {emp.nachname}
                      </Badge>
                    ))}
                    {employees.length === 0 && (
                      <p className="text-sm text-muted-foreground">Keine Mitarbeiter zugewiesen</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Discussion Tab */}
        <TabsContent value="discussion" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Besprechungsnotizen
              </CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit && status !== "abgeschlossen" ? (
                <>
                  <Textarea
                    value={diskussionNotizen}
                    onChange={(e) => setDiskussionNotizen(e.target.value)}
                    placeholder="Notizen zur gemeinsamen Besprechung..."
                    rows={6}
                  />
                  <div className="flex justify-end mt-4">
                    <Button onClick={handleSaveDiscussion} disabled={saving}>
                      <Save className="w-4 h-4 mr-1" />
                      {saving ? "Speichert..." : status === "ausgefuellt" ? "Speichern & als diskutiert markieren" : "Speichern"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm whitespace-pre-wrap">
                  {diskussionNotizen || "Keine Notizen vorhanden"}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signatures Tab */}
        <TabsContent value="signatures" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <SafetySignatureCollector
                evaluationId={id!}
                employees={employees}
                signatures={signatures}
                currentUserId={userId}
                onSignatureAdded={() => {
                  fetchData();
                  handleCheckComplete();
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Excel Import Dialog */}
      <SafetyExcelImportDialog
        open={showExcelImport}
        onOpenChange={setShowExcelImport}
        onImport={(items) => {
          setChecklistItems(items);
          setShowExcelImport(false);
        }}
      />
    </div>
  );
}
