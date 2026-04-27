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
import { VoiceAIInput } from "@/components/VoiceAIInput";
import { useProjectWeather } from "@/hooks/useProjectWeather";
import { format } from "date-fns";
import { Plus, Trash2, CloudSun, ChevronRight } from "lucide-react";
import TimeTracking from "@/pages/TimeTracking";

type Project = { id: string; name: string; plz: string | null; adresse?: string | null; baustellenart?: string | null };
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
  const [reportType, setReportType] = useState<"tagesbericht" | "zwischenbericht" | "regiebericht">("tagesbericht");
  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [temperaturMin, setTemperaturMin] = useState<number | null>(null);
  const [temperaturMax, setTemperaturMax] = useState<number | null>(null);
  const [wetter, setWetter] = useState<string[]>([]);
  const [autoFilledFields, setAutoFilledFields] = useState<{ temp: boolean; wetter: boolean }>({ temp: false, wetter: false });
  const [geschoss, setGeschoss] = useState<string[]>([]);
  const [beschreibung, setBeschreibung] = useState("");
  const [notizen, setNotizen] = useState("");
  const [interneAnmerkungen, setInterneAnmerkungen] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  // Wizard-State (nur fuer Tages-/Regiebericht beim Neuanlegen)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [authUserId, setAuthUserId] = useState<string>("");
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  // Wizard beim Neuanlegen fuer alle Berichtstypen.
  // Tages-/Regiebericht: Bericht -> Zeit -> Fotos (3 Schritte)
  // Zwischenbericht: Bericht -> Fotos (2 Schritte, Zeiterfassung wird uebersprungen)
  // Wizard nur bei Tages-/Regiebericht (mit Zeit-Step). Zwischenbericht: Single-Page.
  // Fotos werden NICHT im Wizard hochgeladen — passiert auf der Detail-Seite nach dem Speichern.
  const hasTimeStep = reportType !== "zwischenbericht";
  const isWizard = !editData && hasTimeStep;
  const stepKeys = (["bericht", "zeit"] as const);
  const totalSteps = stepKeys.length;
  const currentStepKey = stepKeys[Math.min(step, totalSteps) - 1];

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setAuthUserId(user.id);
    })();
  }, []);

  // Step clampen wenn der User vom 3-Step-Typ auf 2-Step-Typ (Zwischenbericht) wechselt
  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps as 1 | 2 | 3);
  }, [totalSteps, step]);

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
      .select("id, name, plz, adresse, baustellenart")
      .eq("status", "aktiv")
      .order("name");
    if (data) setProjects(data);
  }, []);

  // Merker, ob der User das Projekt manuell veraendert hat.
  // Der Autofill ueberschreibt keine manuellen Entscheidungen.
  const [projectManuallySet, setProjectManuallySet] = useState(false);

  // Projekt-Autofill aus Plantafel:
  // - immer wenn Dialog geoeffnet wird (neuer Bericht, nicht Bearbeiten)
  // - auch wenn Datum geaendert wird (Projekt fuer diesen Tag)
  // - respektiert manuelle Auswahl (projectManuallySet)
  useEffect(() => {
    if (!open) return;
    if (editData) return;
    if (defaultProjectId) return;
    if (projectManuallySet) return;
    if (projects.length === 0) return;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("worker_assignments")
        .select("project_id")
        .eq("user_id", user.id)
        .eq("datum", datum)
        .limit(1)
        .maybeSingle();
      if (data?.project_id && projects.some(p => p.id === data.project_id)) {
        setProjectId(data.project_id);
        const proj = projects.find(p => p.id === data.project_id);
        if (proj?.baustellenart === "regie") setReportType("regiebericht");
        else if (proj?.baustellenart === "pauschale") setReportType("tagesbericht");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, datum, projects, editData, defaultProjectId, projectManuallySet]);

  // Beim Schliessen des Dialogs: manuelle-Flagge zuruecksetzen (naechstes Mal wieder autofillen)
  useEffect(() => {
    if (!open) setProjectManuallySet(false);
  }, [open]);

  // Auto-Wetter fuer ausgewaehltes Projekt + Datum
  const selectedProject = projects.find(p => p.id === projectId);
  const weatherLocation = selectedProject
    ? (selectedProject.plz || selectedProject.adresse || selectedProject.name)
    : null;
  const { data: autoWeather, loading: weatherLoading } = useProjectWeather(weatherLocation, datum);

  // Auto-fuelle Wetter (Chip) wenn noch leer.
  useEffect(() => {
    if (!autoWeather) return;
    if (editData) return;
    if (wetter.length > 0) return;
    const code = autoWeather.weatherCode;
    const chip =
      code <= 3 ? "sonnig"
      : code <= 48 ? "bewoelkt"
      : code <= 67 ? "regen"
      : code <= 77 ? "schnee"
      : "gewitter";
    setWetter([chip]);
    setAutoFilledFields(prev => ({ ...prev, wetter: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWeather]);

  // Auto-fuelle Temperatur (min/max) wenn noch nicht gesetzt.
  // Manuelle Aenderungen ueberschreiben die Werte nicht mehr (handleTempMinChange/MaxChange setzt Auto-Flag zurueck).
  useEffect(() => {
    if (!autoWeather) return;
    if (editData) return;
    if (temperaturMin !== null || temperaturMax !== null) return;
    setTemperaturMin(autoWeather.min);
    setTemperaturMax(autoWeather.max);
    setAutoFilledFields(prev => ({ ...prev, temp: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWeather]);

  // Wrapper die Auto-Fill Flag zuruecksetzen wenn User manuell editiert
  const handleTempMinChange = (v: number | null) => {
    setTemperaturMin(v);
    setAutoFilledFields(prev => ({ ...prev, temp: false }));
  };
  const handleTempMaxChange = (v: number | null) => {
    setTemperaturMax(v);
    setAutoFilledFields(prev => ({ ...prev, temp: false }));
  };
  const handleWetterChange = (v: string[]) => {
    setWetter(v);
    setAutoFilledFields(prev => ({ ...prev, wetter: false }));
  };

  useEffect(() => {
    fetchProjects();
    fetchEmployees();
  }, [fetchProjects, fetchEmployees]);

  useEffect(() => {
    if (editData) {
      setProjectId(editData.project_id);
      setReportType(editData.report_type as "tagesbericht" | "zwischenbericht" | "regiebericht");
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
    setInterneAnmerkungen("");
    setActivities([]);
    setSelectedWorkers([]);
    setStep(1);
    setSavedReportId(null);
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
      interne_anmerkungen: interneAnmerkungen.trim() || null,
    };

    let reportId: string;

    const formatErr = (err: any, fallback: string) => {
      if (!err) return fallback;
      const parts = [err.message, err.details, err.hint, err.code].filter(Boolean);
      return parts.join(" — ") || fallback;
    };

    if (editData) {
      const { error } = await supabase
        .from("daily_reports")
        .update(payload)
        .eq("id", editData.id);
      if (error) {
        console.error("daily_reports update error", error, "payload:", payload);
        toast({ variant: "destructive", title: "Fehler beim Speichern", description: formatErr(error, "Update fehlgeschlagen") });
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
        console.error("daily_reports insert error", error, "payload:", payload);
        toast({ variant: "destructive", title: "Fehler beim Erstellen", description: formatErr(error, "Insert fehlgeschlagen") });
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

    // Zeiterfassung wird im Wizard-Step-2 ueber die embedded TimeTracking-Komponente
    // erfasst — separater Speicher-Pfad, hier nur der Bericht selbst.

    toast({ title: "Gespeichert", description: editData ? "Bericht aktualisiert" : "Bericht erstellt" });

    if (isWizard && hasTimeStep && !editData) {
      // Bericht ist gespeichert — wechsle zu Step 2 (Zeiterfassung-Embed). Dialog bleibt offen.
      setSavedReportId(reportId);
      setStep(2);
      setSaving(false);
      onSuccess(); // Liste der Berichte aktualisieren
      return;
    }

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

  const typeLabels = {
    tagesbericht: "Tagesbericht",
    regiebericht: "Regiebericht",
    zwischenbericht: "Zwischenbericht",
  } as const;
  const dialogTitle = editData
    ? `${typeLabels[reportType]} bearbeiten`
    : `Neuer ${typeLabels[reportType]}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className={isWizard && currentStepKey === "zeit" ? "max-w-3xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Wizard-Schritt-Indikator + Typ-Badge */}
          {isWizard && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                {stepKeys.map((key, idx) => {
                  const num = idx + 1;
                  const label = key === "bericht" ? "Bericht" : key === "zeit" ? "Zeiterfassung" : "Fotos";
                  return (
                    <span key={key} className="flex items-center gap-1">
                      {idx > 0 && <ChevronRight className="h-3 w-3" />}
                      <span className={step === num ? "font-semibold text-primary" : ""}>
                        {num}. {label}
                      </span>
                    </span>
                  );
                })}
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap">
                {typeLabels[reportType]}
              </span>
            </div>
          )}

          {/* === STEP 1: Bericht (alle Felder) === */}
          {(!isWizard || currentStepKey === "bericht") && (
          <>
          {/* Berichtstyp als intuitive Button-Gruppe ganz oben */}
          <div className="space-y-1">
            <Label className="text-sm">Berichtstyp</Label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-lg">
              {[
                { key: "tagesbericht", label: "Tagesbericht" },
                { key: "regiebericht", label: "Regiebericht" },
                { key: "zwischenbericht", label: "Zwischenbericht" },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setReportType(t.key as any)}
                  className={`text-xs sm:text-sm py-2 px-2 rounded transition-colors ${
                    reportType === t.key
                      ? "bg-primary text-primary-foreground font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-background"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project */}
          <div>
            <Label>Projekt *</Label>
            <Select value={projectId} onValueChange={(v) => {
              setProjectId(v);
              setProjectManuallySet(true);
              // Auto-select report type based on Baustellenart (nur bei neuen Berichten)
              const proj = projects.find(p => p.id === v);
              if (!editData) {
                if (proj?.baustellenart === "regie") {
                  setReportType("regiebericht");
                } else if (proj?.baustellenart === "pauschale") {
                  setReportType("tagesbericht");
                }
              }
            }}>
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

          {/* Auto-Wetter Hinweis */}
          {autoWeather && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs">
              <span className="text-xl">{autoWeather.icon}</span>
              <div className="flex-1">
                <span className="font-medium">
                  {autoWeather.min}°C / {autoWeather.max}°C · {autoWeather.description}
                </span>
                <span className="text-muted-foreground ml-2">
                  (automatisch für {selectedProject?.name}, {autoWeather.source === "historical" ? "historisch" : "Prognose"})
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTemperaturMin(autoWeather.min);
                  setTemperaturMax(autoWeather.max);
                  const code = autoWeather.weatherCode;
                  const chip =
                    code <= 3 ? "sonnig"
                    : code <= 48 ? "bewoelkt"
                    : code <= 67 ? "regen"
                    : code <= 77 ? "schnee"
                    : "gewitter";
                  setWetter([chip]);
                  setAutoFilledFields({ temp: true, wetter: true });
                }}
                title="Wetter übernehmen"
              >
                <CloudSun className="h-4 w-4" />
              </Button>
            </div>
          )}
          {weatherLoading && !autoWeather && projectId && (
            <p className="text-xs text-muted-foreground">Wetter wird geladen...</p>
          )}

          {/* Weather */}
          <div className="space-y-1">
            {autoFilledFields.wetter && (
              <div className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/30 px-2 py-0.5 rounded-full">
                <CloudSun className="w-3 h-3" />
                Automatisch aus Wetterdaten
              </div>
            )}
            <WeatherSelector value={wetter} onChange={handleWetterChange} />
          </div>
          <div className="space-y-1">
            {autoFilledFields.temp && (
              <div className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/30 px-2 py-0.5 rounded-full">
                <CloudSun className="w-3 h-3" />
                Automatisch aus Wetterdaten
              </div>
            )}
            <TemperatureInput
              minValue={temperaturMin}
              maxValue={temperaturMax}
              onMinChange={handleTempMinChange}
              onMaxChange={handleTempMaxChange}
            />
          </div>

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
                <VoiceAIInput
                  multiline
                  rows={2}
                  context="tagesbericht"
                  value={act.beschreibung}
                  onChange={(v) => updateActivity(act.id, "beschreibung", v)}
                  placeholder="Beschreibung der Tätigkeit..."
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
            <VoiceAIInput
              multiline
              rows={3}
              context="tagesbericht"
              value={beschreibung}
              onChange={setBeschreibung}
              placeholder="Allgemeine Beschreibung des Tages..."
            />
          </div>

          {/* Notes */}
          <div>
            <Label>Notizen (optional)</Label>
            <VoiceAIInput
              multiline
              rows={2}
              context="notiz"
              value={notizen}
              onChange={setNotizen}
              placeholder="Zusätzliche Bemerkungen..."
            />
          </div>

          {/* Interne Anmerkungen */}
          <div>
            <Label>Interne Anmerkungen (optional, wahlweise mitdruckbar)</Label>
            <VoiceAIInput
              multiline
              rows={2}
              context="anmerkung"
              value={interneAnmerkungen}
              onChange={setInterneAnmerkungen}
              placeholder="Interne Notizen (nur für Team sichtbar)..."
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
          </>
          )}

          {/* === STEP 2: Volle Zeiterfassung (embedded /zeiterfassung) === */}
          {isWizard && currentStepKey === "zeit" && savedReportId && (
            <div className="-mx-2 sm:-mx-4">
              <TimeTracking
                embedded={{
                  defaultDate: datum,
                  defaultProjectId: projectId || undefined,
                  hideHeader: true,
                  onSaved: () => {
                    onOpenChange(false);
                    resetForm();
                    onSuccess();
                    navigate(`/daily-reports/${savedReportId}`);
                  },
                }}
              />
            </div>
          )}

          {/* === Actions === */}
          {isWizard ? (
            currentStepKey === "bericht" ? (
              <div className="flex justify-between gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }} disabled={saving}>
                  Abbrechen
                </Button>
                <Button onClick={handleSave} disabled={saving || !projectId || !datum}>
                  {saving ? "Speichere..." : "Weiter zur Zeit"} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ) : (
              // Step 2: Zeiterfassung — TimeTracking handelt Save selbst (onSaved-Callback schliesst).
              // Hier nur Skip-Button, falls der User keine Zeit erfassen moechte.
              <div className="flex justify-between gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    resetForm();
                    if (savedReportId) navigate(`/daily-reports/${savedReportId}`);
                  }}
                >
                  Ohne Zeit speichern
                </Button>
                <span className="text-xs text-muted-foreground self-center">
                  Speichern-Button im Zeit-Formular oben
                </span>
              </div>
            )
          ) : (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => { resetForm(); onOpenChange(false); }}
              >
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Speichere..." : editData ? "Aktualisieren" : "Erstellen"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
