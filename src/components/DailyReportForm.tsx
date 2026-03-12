import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { WeatherSelector } from "@/components/WeatherSelector";
import { TemperatureInput } from "@/components/TemperatureInput";
import { GeschossSelector } from "@/components/GeschossSelector";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";

type Project = { id: string; name: string; plz: string | null };
type Employee = { id: string; user_id: string; name: string };

type Activity = {
  id: string;
  geschoss: string;
  beschreibung: string;
};

interface DailyReportFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultProjectId?: string;
  editData?: {
    id: string;
    project_id: string;
    report_type: string;
    datum: string;
    temperatur_min: number | null;
    temperatur_max: number | null;
    wetter: string[] | null;
    geschoss: string[] | null;
    beschreibung: string;
    notizen: string | null;
  } | null;
}

export function DailyReportForm({ open, onOpenChange, onSuccess, defaultProjectId, editData }: DailyReportFormProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const [projectId, setProjectId] = useState(editData?.project_id ?? defaultProjectId ?? "");
  const [reportType, setReportType] = useState<"tagesbericht" | "zwischenbericht">("tagesbericht");
  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [temperaturMin, setTemperaturMin] = useState<number | null>(null);
  const [temperaturMax, setTemperaturMax] = useState<number | null>(null);
  const [wetter, setWetter] = useState<string[]>([]);
  const [geschoss, setGeschoss] = useState<string[]>([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [notizen, setNotizen] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, user_id, vorname, nachname, is_external, kategorie")
      .not("user_id", "is", null)
      .order("nachname");
    if (data) {
      setEmployees(
        data
          .filter(e => !e.is_external && e.kategorie !== "extern")
          .map(e => ({ id: e.id, user_id: e.user_id!, name: `${e.vorname} ${e.nachname}`.trim() }))
      );
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, plz")
      .eq("status", "aktiv")
      .order("name");
    if (data) setProjects(data);
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchEmployees();
  }, [fetchProjects, fetchEmployees]);

  useEffect(() => {
    if (editData) {
      setProjectId(editData.project_id);
      setReportType(editData.report_type as "tagesbericht" | "zwischenbericht");
      setDatum(editData.datum);
      setTemperaturMin(editData.temperatur_min);
      setTemperaturMax(editData.temperatur_max);
      setWetter(editData.wetter || []);
      setGeschoss(editData.geschoss || []);
      setBeschreibung(editData.beschreibung);
      setNotizen(editData.notizen || "");
      loadActivities(editData.id);
      loadWorkers(editData.id);
    } else {
      resetForm();
    }
  }, [editData, open]);

  const loadActivities = async (reportId: string) => {
    const { data } = await supabase
      .from("daily_report_activities")
      .select("*")
      .eq("daily_report_id", reportId)
      .order("sort_order");
    if (data) {
      setActivities(data.map((a: any) => ({
        id: a.id,
        geschoss: a.geschoss,
        beschreibung: a.beschreibung,
      })));
    }
  };

  const loadWorkers = async (reportId: string) => {
    const { data } = await supabase
      .from("daily_report_workers")
      .select("user_id")
      .eq("daily_report_id", reportId);
    if (data) {
      setSelectedWorkers(data.map((w: any) => w.user_id));
    }
  };

  const resetForm = () => {
    setProjectId("");
    setReportType("tagesbericht");
    setDatum(format(new Date(), "yyyy-MM-dd"));
    setTemperaturMin(null);
    setTemperaturMax(null);
    setWetter([]);
    setGeschoss([]);
    setBeschreibung("");
    setNotizen("");
    setActivities([]);
    setSelectedWorkers([]);
  };

  const addActivity = () => {
    setActivities([...activities, {
      id: crypto.randomUUID(),
      geschoss: geschoss[0] || "eg",
      beschreibung: "",
    }]);
  };

  const updateActivity = (id: string, field: keyof Activity, value: string) => {
    setActivities(activities.map((a) => a.id === id ? { ...a, [field]: value } : a));
  };

  const removeActivity = (id: string) => {
    setActivities(activities.filter((a) => a.id !== id));
  };

  const handleSave = async () => {
    if (!projectId) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte ein Projekt auswählen" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sitzung abgelaufen – bitte erneut einloggen" });
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      project_id: projectId,
      report_type: reportType,
      datum,
      temperatur_min: temperaturMin,
      temperatur_max: temperaturMax,
      wetter,
      geschoss,
      beschreibung: beschreibung.trim(),
      notizen: notizen.trim() || null,
    };

    let reportId: string;

    if (editData) {
      const { error } = await supabase
        .from("daily_reports")
        .update(payload)
        .eq("id", editData.id);
      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: error.message });
        setSaving(false);
        return;
      }
      reportId = editData.id;

      // Delete old activities and re-insert
      await supabase.from("daily_report_activities").delete().eq("daily_report_id", reportId);
    } else {
      const { data, error } = await supabase
        .from("daily_reports")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        toast({ variant: "destructive", title: "Fehler", description: error?.message || "Unbekannter Fehler" });
        setSaving(false);
        return;
      }
      reportId = data.id;
    }

    // Insert activities
    const validActivities = activities.filter((a) => a.beschreibung.trim());
    if (validActivities.length > 0) {
      await supabase.from("daily_report_activities").insert(
        validActivities.map((a, idx) => ({
          daily_report_id: reportId,
          geschoss: a.geschoss,
          beschreibung: a.beschreibung.trim(),
          sort_order: idx,
        }))
      );
    }

    // Save workers
    if (editData) {
      await supabase.from("daily_report_workers").delete().eq("daily_report_id", reportId);
    }
    if (selectedWorkers.length > 0) {
      await supabase.from("daily_report_workers").insert(
        selectedWorkers.map((userId) => ({
          daily_report_id: reportId,
          user_id: userId,
          is_main: false,
        }))
      );
    }

    toast({ title: "Gespeichert", description: editData ? "Bericht aktualisiert" : "Bericht erstellt" });
    onOpenChange(false);
    resetForm();
    onSuccess();
    setSaving(false);
    if (!editData) {
      navigate(`/daily-reports/${reportId}`);
    }
  };

  const GESCHOSS_LABELS: Record<string, string> = {
    aussen: "Außen", keller: "Keller", eg: "EG", og: "OG", dg: "DG",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? "Bericht bearbeiten" : "Neuer Tagesbericht"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Report Type */}
          <div>
            <Label>Berichtstyp</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tagesbericht">Tagesbericht</SelectItem>
                <SelectItem value="zwischenbericht">Zwischenbericht</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Project */}
          <div>
            <Label>Projekt *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} {p.plz ? `(${p.plz})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div>
            <Label>Datum</Label>
            <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </div>

          {/* Weather */}
          <WeatherSelector value={wetter} onChange={setWetter} />
          <TemperatureInput
            minValue={temperaturMin}
            maxValue={temperaturMax}
            onMinChange={setTemperaturMin}
            onMaxChange={setTemperaturMax}
          />

          {/* Geschoss */}
          <GeschossSelector value={geschoss} onChange={setGeschoss} />

          {/* Activities per floor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Tätigkeiten pro Geschoss</Label>
              <Button type="button" variant="outline" size="sm" onClick={addActivity}>
                <Plus className="w-4 h-4 mr-1" /> Tätigkeit
              </Button>
            </div>
            {activities.map((act) => (
              <div key={act.id} className="flex gap-2 items-start">
                <Select value={act.geschoss} onValueChange={(v) => updateActivity(act.id, "geschoss", v)}>
                  <SelectTrigger className="w-24 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GESCHOSS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={act.beschreibung}
                  onChange={(e) => updateActivity(act.id, "beschreibung", e.target.value)}
                  placeholder="Beschreibung der Tätigkeit..."
                  rows={2}
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeActivity(act.id)} className="h-9 px-2">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Description */}
          <div>
            <Label>Beschreibung</Label>
            <Textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Allgemeine Beschreibung des Tages..."
              rows={3}
            />
          </div>

          {/* Notes */}
          <div>
            <Label>Notizen (optional)</Label>
            <Textarea
              value={notizen}
              onChange={(e) => setNotizen(e.target.value)}
              placeholder="Zusätzliche Bemerkungen..."
              rows={2}
            />
          </div>

          {/* Anwesende Mitarbeiter */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">Anwesende Mitarbeiter</Label>
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
              {employees.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Mitarbeiter gefunden</p>
              ) : (
                employees.map((emp) => (
                  <div key={emp.user_id} className="flex items-center gap-2">
                    <Checkbox
                      id={`worker-${emp.user_id}`}
                      checked={selectedWorkers.includes(emp.user_id)}
                      onCheckedChange={(checked) => {
                        setSelectedWorkers(prev =>
                          checked
                            ? [...prev, emp.user_id]
                            : prev.filter(id => id !== emp.user_id)
                        );
                      }}
                    />
                    <label htmlFor={`worker-${emp.user_id}`} className="text-sm cursor-pointer">
                      {emp.name}
                    </label>
                  </div>
                ))
              )}
            </div>
            {selectedWorkers.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedWorkers.length} Mitarbeiter ausgewählt</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Speichere..." : editData ? "Aktualisieren" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
