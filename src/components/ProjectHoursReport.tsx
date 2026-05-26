import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Calendar, Briefcase, MapPin, Wrench, Users, Car, Filter, Save, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { calculateOvertime, type WeekSchedule, type Schwellenwert } from "@/lib/workingHours";

interface DetailedProjectEntry {
  id: string;
  userId: string;
  employeeName: string;
  datum: string;
  startTime: string;
  endTime: string;
  pauseStart: string | null;
  pauseEnd: string | null;
  pauseMinutes: number;
  taetigkeit: string;
  hours: number;
  locationType: string;
  kilometer: number;
  isExternal: boolean;
  overtime: number;
}

interface Project {
  id: string;
  name: string;
  plz?: string;
}

interface EmployeeSummary {
  userId: string;
  name: string;
  isExternal: boolean;
  totalHours: number;
  normalHours: number;
  overtime: number;
  km: number;
}

// Anzeigereihenfolge fuer Rollen-Pills im Filter (Bauherr zuerst, weil das der
// typische "ausblenden"-Kandidat ist).
const KATEGORIE_LABELS_REPORT: Array<{ key: string; label: string }> = [
  { key: "bauherr", label: "Bauherr" },
  { key: "extern", label: "Extern" },
  { key: "lehrling", label: "Lehrling" },
  { key: "facharbeiter", label: "Facharbeiter" },
  { key: "vorarbeiter", label: "Vorarbeiter" },
];

export default function ProjectHoursReport() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  // projectData enthaelt IMMER alle Eintraege fuer den Zeitraum. Filterung
  // passiert anschliessend in einem useMemo (siehe `filtered`), damit
  // Live-Toggles ohne Re-Fetch wirken.
  const [projectData, setProjectData] = useState<DetailedProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, { vorname: string; nachname: string }>>({});
  const [externalUserIds, setExternalUserIds] = useState<Set<string>>(new Set());
  const [employeeSchedules, setEmployeeSchedules] = useState<Record<string, WeekSchedule | null>>({});
  const [employeeSchwellenwerte, setEmployeeSchwellenwerte] = useState<Record<string, Schwellenwert | null>>({});
  // user_id -> kategorie (fuer Rolle-basierten Filter im Report)
  const [employeeKategorien, setEmployeeKategorien] = useState<Record<string, string | null>>({});
  // Persistente Ausschluss-Liste pro Baustelle (aus project_excluded_employees).
  // Default leer = niemand ausgeschlossen.
  const [excludedUserIds, setExcludedUserIds] = useState<Set<string>>(new Set());
  // Live-Filter: per Klick eingeblendete/ausgeblendete Kategorien
  const [hiddenKategorien, setHiddenKategorien] = useState<Set<string>>(new Set());
  // Live-Override pro Mitarbeiter (zusaetzlich zu persistent ausgeschlossenen)
  const [liveDeselectedUserIds, setLiveDeselectedUserIds] = useState<Set<string>>(new Set());
  const [savingFilter, setSavingFilter] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const { toast } = useToast();

  useEffect(() => {
    fetchProfiles();
    fetchProjects();
    fetchEmployeeData();
  }, []);

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, vorname, nachname, is_active").eq("is_active", true);
    if (data) {
      const profileMap: Record<string, { vorname: string; nachname: string }> = {};
      data.forEach((profile) => {
        profileMap[profile.id] = { vorname: profile.vorname, nachname: profile.nachname };
      });
      setProfiles(profileMap);
    }
  };

  const fetchEmployeeData = async () => {
    const { data } = await supabase
      .from("employees")
      .select("user_id, is_external, kategorie, regelarbeitszeit, schwellenwert")
      .not("user_id", "is", null);

    if (data) {
      const extIds = new Set<string>();
      const schedules: Record<string, WeekSchedule | null> = {};
      const schwellenwerte: Record<string, Schwellenwert | null> = {};
      const kategorien: Record<string, string | null> = {};
      data.forEach((emp: any) => {
        if (emp.user_id) {
          // Bauherren werden technisch wie Externe behandelt (is_external=true,
          // kein Arbeitszeit-Plan). Im Report kennzeichnen wir beide als
          // "isExternal", die Rollen-Trennung erfolgt ueber employeeKategorien.
          if (emp.is_external === true || emp.kategorie === "extern" || emp.kategorie === "bauherr") {
            extIds.add(emp.user_id);
          }
          schedules[emp.user_id] = emp.regelarbeitszeit || null;
          schwellenwerte[emp.user_id] = emp.schwellenwert || null;
          kategorien[emp.user_id] = emp.kategorie || null;
        }
      });
      setExternalUserIds(extIds);
      setEmployeeSchedules(schedules);
      setEmployeeSchwellenwerte(schwellenwerte);
      setEmployeeKategorien(kategorien);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectHours();
    }
  }, [selectedProjectId, startDate, endDate, profiles, externalUserIds, employeeSchedules]);

  useEffect(() => {
    if (!selectedProjectId) return;

    const channel = supabase
      .channel('project-hours-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'time_entries',
        filter: `project_id=eq.${selectedProjectId}`
      }, () => {
        fetchProjectHours();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, plz")
      .order("name");

    if (data && !error) {
      setProjects(data);
      if (data.length > 0) {
        setSelectedProjectId(data[0].id);
      }
    }
    setLoading(false);
  };

  const fetchProjectHours = async () => {
    if (!selectedProjectId || Object.keys(profiles).length === 0) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("time_entries")
      .select("id, datum, start_time, end_time, pause_start, pause_end, pause_minutes, stunden, taetigkeit, user_id, location_type, kilometer")
      .eq("project_id", selectedProjectId)
      .gte("datum", startDate)
      .lte("datum", endDate)
      .not("project_id", "is", null)
      .order("datum", { ascending: true });

    if (error) {
      console.error("Fehler beim Laden der Projektstunden:", error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Projektstunden konnten nicht geladen werden"
      });
      setLoading(false);
      return;
    }

    if (data) {
      const detailedEntries: DetailedProjectEntry[] = [];

      data.forEach((entry: any) => {
        const profile = profiles[entry.user_id];
        if (!profile) return;

        const isExt = externalUserIds.has(entry.user_id);
        const schedule = employeeSchedules[entry.user_id] || null;
        const schwellenwert = employeeSchwellenwerte[entry.user_id] || null;
        const isAbsence = ["Urlaub", "Krankenstand", "Feiertag", "Zeitausgleich"].includes(entry.taetigkeit || "");
        // Pro Projekt nur die echten Ueberstunden (>= 0). Saldo (negativ bei
        // Unterzeit) gehoert ins Mitarbeiter-Konto, nicht ins Projekt-Reporting.
        const ot = isExt || isAbsence ? 0 : calculateOvertime(entry.stunden, new Date(entry.datum), schedule, schwellenwert);
        const km = entry.kilometer || 0;
        const name = `${profile.vorname} ${profile.nachname}`;

        detailedEntries.push({
          id: entry.id,
          userId: entry.user_id,
          employeeName: name,
          datum: entry.datum,
          startTime: entry.start_time,
          endTime: entry.end_time,
          pauseStart: entry.pause_start,
          pauseEnd: entry.pause_end,
          pauseMinutes: entry.pause_minutes || 0,
          taetigkeit: entry.taetigkeit,
          hours: entry.stunden,
          locationType: entry.location_type || "baustelle",
          kilometer: km,
          isExternal: isExt,
          overtime: ot,
        });
      });

      detailedEntries.sort((a, b) => {
        const dateCompare = a.datum.localeCompare(b.datum);
        if (dateCompare !== 0) return dateCompare;
        return a.employeeName.localeCompare(b.employeeName);
      });

      setProjectData(detailedEntries);
    }

    setLoading(false);
  };

  // Persistente Ausschluss-Liste laden, sobald die Baustelle wechselt. Live-
  // Filter (Kategorien + einzelne MA-Overrides) werden gleichzeitig
  // zurueckgesetzt, damit man pro Baustelle frisch startet.
  useEffect(() => {
    if (!selectedProjectId) {
      setExcludedUserIds(new Set());
      setHiddenKategorien(new Set());
      setLiveDeselectedUserIds(new Set());
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("project_excluded_employees")
        .select("user_id")
        .eq("project_id", selectedProjectId);
      setExcludedUserIds(new Set((data || []).map((r: any) => r.user_id as string)));
      setHiddenKategorien(new Set());
      setLiveDeselectedUserIds(new Set());
    })();
  }, [selectedProjectId]);

  // ===== Filter-Logik =====
  // Ein Eintrag ist "versteckt", wenn der Mitarbeiter persistent ausgeschlossen
  // ist, seine Kategorie temporaer abgewaehlt ist oder er live einzeln
  // abgewaehlt ist.
  const isHiddenUser = (userId: string): boolean => {
    if (excludedUserIds.has(userId)) return true;
    if (liveDeselectedUserIds.has(userId)) return true;
    const kat = employeeKategorien[userId];
    if (kat && hiddenKategorien.has(kat)) return true;
    return false;
  };

  // Gefilterte Aggregation. Reagiert live auf Filter-Aenderungen.
  const filtered = useMemo(() => {
    const visibleEntries = projectData.filter((e) => !isHiddenUser(e.userId));
    let total = 0;
    let otTotal = 0;
    let extTotal = 0;
    let kmTotal = 0;
    const empMap: Record<string, EmployeeSummary> = {};

    for (const e of visibleEntries) {
      total += e.hours;
      otTotal += e.overtime;
      if (e.isExternal) extTotal += e.hours;
      kmTotal += e.kilometer;

      if (!empMap[e.userId]) {
        empMap[e.userId] = {
          userId: e.userId,
          name: e.employeeName,
          isExternal: e.isExternal,
          totalHours: 0,
          normalHours: 0,
          overtime: 0,
          km: 0,
        };
      }
      empMap[e.userId].totalHours += e.hours;
      empMap[e.userId].overtime += e.overtime;
      empMap[e.userId].normalHours += e.hours - Math.max(0, e.overtime);
      empMap[e.userId].km += e.kilometer;
    }

    const summaries = Object.values(empMap).sort((a, b) => a.name.localeCompare(b.name));
    return { entries: visibleEntries, total, otTotal, extTotal, kmTotal, summaries };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectData, excludedUserIds, hiddenKategorien, liveDeselectedUserIds, employeeKategorien]);

  // Alle User, die im Zeitraum Stunden gebucht haben — Grundlage fuer die
  // Mitarbeiter-Filter-Liste (auch versteckte sind hier drin, damit man sie
  // wieder einblenden kann).
  const allUsersInData = useMemo(() => {
    const map = new Map<string, { userId: string; name: string; kategorie: string | null }>();
    for (const e of projectData) {
      if (!map.has(e.userId)) {
        map.set(e.userId, { userId: e.userId, name: e.employeeName, kategorie: employeeKategorien[e.userId] ?? null });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projectData, employeeKategorien]);

  // ===== Filter-Aktionen =====
  const toggleKategorie = (key: string) => {
    setHiddenKategorien((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleUserChecked = (userId: string, checked: boolean) => {
    // Sichtbar machen: aus beiden Sichtbarkeits-Sperren entfernen. Wenn der
    // User persistent ausgeschlossen war, ist er jetzt lokal sichtbar — beim
    // naechsten "Standard speichern" wird die DB nachgezogen.
    // Verstecken: in liveDeselected aufnehmen.
    if (checked) {
      setLiveDeselectedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setExcludedUserIds((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } else {
      setLiveDeselectedUserIds((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }
  };

  const handleSaveFilter = async () => {
    if (!selectedProjectId) return;
    setSavingFilter(true);
    try {
      // Aktueller "ausgeschlossen"-Zustand pro User: die, die jetzt versteckt
      // sind (egal ob via persistent excluded oder live deselected oder
      // Kategorie-hidden).
      const hiddenUserIds = allUsersInData
        .filter((u) => isHiddenUser(u.userId))
        .map((u) => u.userId);

      const { data: { user } } = await supabase.auth.getUser();

      // 1. Alle bestehenden Eintraege fuer diese Baustelle loeschen.
      const { error: delErr } = await (supabase as any)
        .from("project_excluded_employees")
        .delete()
        .eq("project_id", selectedProjectId);
      if (delErr) throw delErr;

      // 2. Aktuell versteckte User neu eintragen.
      if (hiddenUserIds.length > 0) {
        const rows = hiddenUserIds.map((uid) => ({
          project_id: selectedProjectId,
          user_id: uid,
          created_by: user?.id ?? null,
        }));
        const { error: insErr } = await (supabase as any)
          .from("project_excluded_employees")
          .insert(rows);
        if (insErr) throw insErr;
      }

      // 3. Lokalen State aktualisieren — alles, was versteckt war, ist jetzt
      //    persistent ausgeschlossen. Live-Filter werden zurueckgesetzt, weil
      //    sie jetzt in der persistenten Liste abgebildet sind.
      setExcludedUserIds(new Set(hiddenUserIds));
      setLiveDeselectedUserIds(new Set());
      setHiddenKategorien(new Set());

      toast({
        title: "Standard gespeichert",
        description: hiddenUserIds.length === 0
          ? "Alle Mitarbeiter werden in der Auswertung berücksichtigt."
          : `${hiddenUserIds.length} Mitarbeiter dauerhaft ausgeblendet.`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fehler", description: e.message || "Konnte Standard nicht speichern." });
    } finally {
      setSavingFilter(false);
    }
  };

  const handleResetFilter = async () => {
    if (!selectedProjectId) return;
    setSavingFilter(true);
    try {
      const { error } = await (supabase as any)
        .from("project_excluded_employees")
        .delete()
        .eq("project_id", selectedProjectId);
      if (error) throw error;
      setExcludedUserIds(new Set());
      setLiveDeselectedUserIds(new Set());
      setHiddenKategorien(new Set());
      toast({ title: "Standard zurückgesetzt", description: "Alle Mitarbeiter sichtbar." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fehler", description: e.message || "Konnte Standard nicht zuruecksetzen." });
    } finally {
      setSavingFilter(false);
    }
  };

  const formatTime = (time: string | null): string => {
    if (!time) return "";
    return time.substring(0, 5);
  };

  const formatPause = (entry: DetailedProjectEntry): string => {
    if (entry.pauseStart && entry.pauseEnd) {
      return `${formatTime(entry.pauseStart)} - ${formatTime(entry.pauseEnd)}`;
    }
    if (entry.pauseMinutes > 0) {
      return `${entry.pauseMinutes} Min.`;
    }
    return "";
  };

  const addBordersToCell = (cell: any, thick: boolean = false) => {
    const borderStyle = thick ? "medium" : "thin";
    cell.s = {
      border: {
        top: { style: borderStyle, color: { rgb: "000000" } },
        bottom: { style: borderStyle, color: { rgb: "000000" } },
        left: { style: borderStyle, color: { rgb: "000000" } },
        right: { style: borderStyle, color: { rgb: "000000" } },
      },
      alignment: { vertical: "center", horizontal: "left" },
    };
  };

  const exportToExcel = () => {
    const selectedProject = projects.find((p) => p.id === selectedProjectId);
    if (!selectedProject) return;

    // Excel benutzt 1:1 die gefilterte Datenstruktur — was im UI ausgeblendet
    // ist, fehlt auch im Export. Konsistenz zwischen Bildschirm und Datei.
    const worksheetData: any[][] = [
      ["Projektzeiterfassung", selectedProject.name],
      ["PLZ:", selectedProject.plz || "k.A."],
      ["Zeitraum:", `${startDate} bis ${endDate}`],
      [],
      ["Datum", "Start", "Ende", "Pause", "Stunden", "Überstunden", "km", "Mitarbeiter", "Tätigkeit", "Ort"],
    ];

    filtered.entries.forEach((entry) => {
      const dateFormatted = format(parseISO(entry.datum), "dd.MM.yyyy", { locale: de });
      const ortText = entry.locationType === "werkstatt" ? "Lager" : "Baustelle";
      const kat = employeeKategorien[entry.userId];
      const empLabel = kat === "bauherr"
        ? `${entry.employeeName} (Bauherr)`
        : entry.isExternal ? `${entry.employeeName} (Extern)` : entry.employeeName;

      worksheetData.push([
        dateFormatted,
        formatTime(entry.startTime),
        formatTime(entry.endTime),
        formatPause(entry),
        entry.hours.toFixed(2),
        entry.overtime > 0 ? entry.overtime.toFixed(2) : "",
        entry.kilometer > 0 ? entry.kilometer.toFixed(0) : "",
        empLabel,
        entry.taetigkeit,
        ortText,
      ]);
    });

    // Summary section
    worksheetData.push([]);
    worksheetData.push(["ZUSAMMENFASSUNG"]);
    worksheetData.push(["Gesamtstunden:", "", "", "", filtered.total.toFixed(2)]);
    worksheetData.push(["Normalarbeitszeit:", "", "", "", (filtered.total - filtered.otTotal).toFixed(2)]);
    worksheetData.push(["Überstunden:", "", "", "", filtered.otTotal.toFixed(2)]);
    if (filtered.extTotal > 0) {
      worksheetData.push(["Stunden Externe/Bauherren:", "", "", "", filtered.extTotal.toFixed(2)]);
    }
    worksheetData.push(["Kilometer gesamt:", "", "", "", "", "", filtered.kmTotal.toFixed(0)]);

    // Per-employee summary
    worksheetData.push([]);
    worksheetData.push(["MITARBEITER-ZUSAMMENFASSUNG"]);
    worksheetData.push(["Mitarbeiter", "", "", "", "Stunden", "Überstunden", "km"]);
    filtered.summaries.forEach((emp) => {
      const kat = employeeKategorien[emp.userId];
      const label = kat === "bauherr"
        ? `${emp.name} (Bauherr)`
        : emp.isExternal ? `${emp.name} (Extern)` : emp.name;
      worksheetData.push([label, "", "", "", emp.totalHours.toFixed(2), emp.overtime > 0 ? emp.overtime.toFixed(2) : "", emp.km > 0 ? emp.km.toFixed(0) : ""]);
    });

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    ws["!cols"] = [
      { wch: 12 },  // Datum
      { wch: 8 },   // Start
      { wch: 8 },   // Ende
      { wch: 14 },  // Pause
      { wch: 10 },  // Stunden
      { wch: 12 },  // Überstunden
      { wch: 8 },   // km
      { wch: 22 },  // Mitarbeiter
      { wch: 20 },  // Tätigkeit
      { wch: 12 },  // Ort
    ];

    ws["!merges"] = [
      { s: { r: 0, c: 1 }, e: { r: 0, c: 9 } },
      { s: { r: 2, c: 1 }, e: { r: 2, c: 9 } },
    ];

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { t: "s", v: "" };
        }

        const isHeader = R === 4;
        addBordersToCell(ws[cellAddress], isHeader);

        if (isHeader) {
          ws[cellAddress].s = {
            ...ws[cellAddress].s,
            font: { bold: true },
          };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedProject.name.substring(0, 31));
    XLSX.writeFile(wb, `Projektzeiterfassung_${selectedProject.name}.xlsx`);

    toast({
      title: "Export erfolgreich",
      description: "Die Excel-Datei wurde heruntergeladen",
    });
  };

  if (loading && projects.length === 0) {
    return <div className="text-center py-8">Lädt Projekte...</div>;
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Projektzeiterfassung</CardTitle>
            <CardDescription>
              Detaillierte Stunden nach Projekt mit Arbeitszeiten
            </CardDescription>
          </div>
          <Button
            onClick={exportToExcel}
            disabled={!selectedProjectId || projectData.length === 0}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Excel exportieren
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Projekt auswählen</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Projekt wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name} {project.plz && `(${project.plz})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Von:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Bis:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
                  setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
                }}
              >
                Dieser Monat
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  setStartDate(lastMonth.toISOString().split('T')[0]);
                  setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
                }}
              >
                Letzter Monat
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
                  const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
                  setStartDate(quarterStart.toISOString().split('T')[0]);
                  setEndDate(quarterEnd.toISOString().split('T')[0]);
                }}
              >
                Letztes Quartal
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Komplette Projekt-Historie - sehr fruehes Start- bis sehr spaetes End-Datum
                  setStartDate("2020-01-01");
                  setEndDate("2099-12-31");
                }}
              >
                Komplett
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filter — Rolle ausblenden + einzelne Mitarbeiter ausblenden. Speichern
            persistiert die aktuelle Auswahl pro Baustelle in
            project_excluded_employees, sodass sie sowohl im UI als auch beim
            Excel-Export beim naechsten Aufruf direkt aktiv ist. */}
        {selectedProject && projectData.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Auswertung filtern
                  {(excludedUserIds.size > 0 || liveDeselectedUserIds.size > 0 || hiddenKategorien.size > 0) && (
                    <Badge variant="secondary" className="text-xs">
                      {allUsersInData.filter((u) => isHiddenUser(u.userId)).length} ausgeblendet
                    </Badge>
                  )}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setFilterOpen((v) => !v)}>
                  {filterOpen ? "Einklappen" : "Auswählen"}
                </Button>
              </div>
            </CardHeader>
            {filterOpen && (
              <CardContent className="space-y-4">
                {/* Kategorie-Pills */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Rollen (Klick zum Ein- / Ausblenden)</p>
                  <div className="flex flex-wrap gap-2">
                    {KATEGORIE_LABELS_REPORT.map(({ key, label }) => {
                      const hidden = hiddenKategorien.has(key);
                      const present = allUsersInData.some((u) => u.kategorie === key);
                      if (!present) return null;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleKategorie(key)}
                          className={`px-3 py-1 rounded-full border text-sm transition-colors ${
                            hidden
                              ? "bg-muted text-muted-foreground line-through border-muted-foreground/30"
                              : "bg-primary/10 text-primary border-primary/40"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mitarbeiter-Liste */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Einzelne Mitarbeiter</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-56 overflow-y-auto rounded-md border p-2 bg-muted/30">
                    {allUsersInData.map((u) => {
                      const hidden = isHiddenUser(u.userId);
                      const isPersistent = excludedUserIds.has(u.userId) && !liveDeselectedUserIds.has(u.userId);
                      return (
                        <label key={u.userId} className="flex items-center gap-2 p-1 hover:bg-background/50 rounded cursor-pointer">
                          <Checkbox
                            checked={!hidden}
                            onCheckedChange={(c) => toggleUserChecked(u.userId, c === true)}
                          />
                          <span className={`text-sm ${hidden ? "text-muted-foreground line-through" : ""}`}>
                            {u.name}
                          </span>
                          {u.kategorie && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              {KATEGORIE_LABELS_REPORT.find((k) => k.key === u.kategorie)?.label || u.kategorie}
                            </Badge>
                          )}
                          {isPersistent && (
                            <Badge variant="secondary" className="text-[10px] py-0">dauerhaft</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Aktions-Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleSaveFilter}
                    disabled={savingFilter}
                    className="gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Aktuelle Auswahl als Standard speichern
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilter}
                    disabled={savingFilter}
                    className="gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Standard zurücksetzen
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Der gespeicherte Standard wirkt sowohl in der Stunden-Anzeige als auch im Excel-Export.
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* Summary Cards — Summen kommen aus filtered (ohne ausgeblendete MA) */}
        {selectedProject && projectData.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Gesamtstunden</p>
                <p className="text-2xl font-bold">{filtered.total.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Normalarbeitszeit</p>
                <p className="text-2xl font-bold">{(filtered.total - filtered.otTotal).toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Überstunden</p>
                <p className="text-2xl font-bold text-orange-600">{filtered.otTotal.toFixed(2)}</p>
              </CardContent>
            </Card>
            {filtered.extTotal > 0 && (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Externe / Bauherr</p>
                  <p className="text-2xl font-bold text-blue-600">{filtered.extTotal.toFixed(2)}</p>
                </CardContent>
              </Card>
            )}
            {filtered.kmTotal > 0 && (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Car className="w-3 h-3" /> Kilometer</p>
                  <p className="text-2xl font-bold">{filtered.kmTotal.toFixed(0)}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Per-Employee Summary — nur sichtbare MA */}
        {filtered.summaries.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Mitarbeiter-Zusammenfassung
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitarbeiter</TableHead>
                    <TableHead className="text-right">Stunden</TableHead>
                    <TableHead className="text-right">Normal</TableHead>
                    <TableHead className="text-right">Überstunden</TableHead>
                    <TableHead className="text-right">km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.summaries.map((emp) => {
                    const kat = employeeKategorien[emp.userId];
                    const badgeLabel = kat === "bauherr" ? "Bauherr" : emp.isExternal ? "Extern" : null;
                    return (
                      <TableRow key={emp.userId}>
                        <TableCell className="font-medium">
                          {emp.name}
                          {badgeLabel && (
                            <Badge variant="outline" className="ml-2 text-xs">{badgeLabel}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold">{emp.totalHours.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{emp.isExternal ? "–" : emp.normalHours.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-orange-600">
                          {emp.isExternal ? "–" : (emp.overtime > 0 ? emp.overtime.toFixed(2) : "–")}
                        </TableCell>
                        <TableCell className="text-right">{emp.km > 0 ? emp.km.toFixed(0) : "–"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Gesamt</TableCell>
                    <TableCell className="text-right font-bold">{filtered.total.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">{(filtered.total - filtered.otTotal).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-orange-600">{filtered.otTotal > 0 ? filtered.otTotal.toFixed(2) : "–"}</TableCell>
                    <TableCell className="text-right font-bold">{filtered.kmTotal > 0 ? filtered.kmTotal.toFixed(0) : "–"}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Detail Table — nur sichtbare Eintraege */}
        {projectData.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Einzelnachweise</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Ende</TableHead>
                    <TableHead>Pause</TableHead>
                    <TableHead className="text-right">Stunden</TableHead>
                    <TableHead className="text-right">km</TableHead>
                    <TableHead>Mitarbeiter</TableHead>
                    <TableHead>Tätigkeit</TableHead>
                    <TableHead>Ort</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.entries.map((entry) => {
                    const kat = employeeKategorien[entry.userId];
                    const badgeShort = kat === "bauherr" ? "Bauherr" : entry.isExternal ? "Ext." : null;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {format(parseISO(entry.datum), "dd.MM.yyyy", { locale: de })}
                        </TableCell>
                        <TableCell>{formatTime(entry.startTime)}</TableCell>
                        <TableCell>{formatTime(entry.endTime)}</TableCell>
                        <TableCell>{formatPause(entry)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {entry.hours.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.kilometer > 0 ? entry.kilometer.toFixed(0) : ""}
                        </TableCell>
                        <TableCell>
                          {entry.employeeName}
                          {badgeShort && (
                            <Badge variant="outline" className="ml-1 text-xs">{badgeShort}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <Briefcase className="w-3 h-3" />
                            {entry.taetigkeit}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {entry.locationType === "werkstatt" ? (
                            <Badge variant="secondary" className="gap-1">
                              <Wrench className="w-3 h-3" />
                              Lager
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <MapPin className="w-3 h-3" />
                              Baustelle
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-bold">Gesamt</TableCell>
                    <TableCell className="text-right font-bold">
                      {filtered.total.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {filtered.kmTotal > 0 ? filtered.kmTotal.toFixed(0) : ""}
                    </TableCell>
                    <TableCell colSpan={3}></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        ) : selectedProjectId ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Keine Stunden für dieses Projekt erfasst</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
