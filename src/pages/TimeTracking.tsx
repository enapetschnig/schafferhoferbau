import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Clock, Plus, AlertTriangle, CheckCircle2, Calendar, Sun, Trash2, Pencil, ChevronDown, CloudRain } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/PageHeader";
import { format, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import {
  getNormalWorkingHours,
  getDefaultWorkTimes,
  isNonWorkingDay,
  getWeeklyTargetHours,
  getTotalWorkingHours,
  calculateKilometergeld,
  DEFAULT_SCHEDULE,
  type WeekSchedule,
} from "@/lib/workingHours";
import { FillRemainingHoursDialog } from "@/components/FillRemainingHoursDialog";

type Project = {
  id: string;
  name: string;
  status: string;
  plz: string;
};

type ExistingEntry = {
  id: string;
  start_time: string;
  end_time: string;
  stunden: number;
  taetigkeit: string;
  project_name: string | null;
  project_id: string | null;
  plz: string | null;
  pause_start: string | null;
  pause_end: string | null;
  location_type: string | null;
  kilometer: number | null;
  km_beschreibung: string | null;
  zeit_typ: string | null;
};

interface TimeBlock {
  id: string;
  locationType: "baustelle" | "werkstatt";
  projectId: string;
  taetigkeit: string;
  startTime: string;
  endTime: string;
  manualHours: string;
  pauseStart: string;
  pauseEnd: string;
  kilometer: string;
  kmBeschreibung: string;
  zeitTyp: "normal" | "lenkzeit" | "reisezeit" | "fahrt_100km";
  diaetTyp: "keine" | "klein" | "gross";
  diaetAnfahrt: boolean;
}

const createDefaultBlock = (startTime = "", endTime = ""): TimeBlock => ({
  id: crypto.randomUUID(),
  locationType: "baustelle",
  projectId: "",
  taetigkeit: "",
  startTime,
  endTime,
  manualHours: "",
  pauseStart: "",
  pauseEnd: "",
  kilometer: "",
  kmBeschreibung: "",
  zeitTyp: "normal",
  diaetTyp: "keine",
  diaetAnfahrt: false,
});

const TimeTracking = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Admin editing another user's entries
  const targetUserId = searchParams.get("user_id");
  const [isAdmin, setIsAdmin] = useState(false);
  const [targetUserName, setTargetUserName] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [submittingAbsence, setSubmittingAbsence] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPlz, setNewProjectPlz] = useState("");
  const [newProjectAddress, setNewProjectAddress] = useState("");
  const [pendingBlockIdForNewProject, setPendingBlockIdForNewProject] = useState<string | null>(null);

  const [existingDayEntries, setExistingDayEntries] = useState<ExistingEntry[]>([]);
  const [loadingDayEntries, setLoadingDayEntries] = useState(false);
  
  const [showAbsenceDialog, setShowAbsenceDialog] = useState(false);
  const [showFillDialog, setShowFillDialog] = useState(false);
  const [showBadWeatherDialog, setShowBadWeatherDialog] = useState(false);
  const [savingBadWeather, setSavingBadWeather] = useState(false);
  const [badWeatherData, setBadWeatherData] = useState({
    projectId: "",
    beginn: "08:00",
    ende: "16:00",
    arbeitsstundenVorher: "",
    notizen: "",
  });
  const [badWeatherArt, setBadWeatherArt] = useState<string[]>([]);

  const [absenceData, setAbsenceData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: "urlaub" as "urlaub" | "krankenstand" | "weiterbildung" | "feiertag" | "za",
    document: null as File | null,
    customHours: "" as string,
    isFullDay: true,
    absenceStartTime: "07:00",
    absenceEndTime: "16:00",
    absencePauseMinutes: "30",
  });

  const [editMode, setEditMode] = useState(false);
  const [editingEntryIds, setEditingEntryIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    return searchParams.get("date") || new Date().toISOString().split('T')[0];
  });

  // Datum im Abwesenheits-Dialog auf selectedDate setzen wenn Dialog geöffnet wird
  useEffect(() => {
    if (showAbsenceDialog) {
      setAbsenceData(prev => ({ ...prev, date: selectedDate }));
    }
  }, [showAbsenceDialog, selectedDate]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([createDefaultBlock()]);
  const entryMode = "zeitraum" as const;

  // Employee schedule for individual working hours
  const [employeeSchedule, setEmployeeSchedule] = useState<WeekSchedule | null>(null);
  const [isExternalUser, setIsExternalUser] = useState(false);

  const fetchEmployeeSchedule = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const userId = targetUserId || user.id;
    const { data } = await supabase
      .from("employees")
      .select("regelarbeitszeit, wochen_soll_stunden, is_external, kategorie")
      .eq("user_id", userId)
      .single();
    if (data?.regelarbeitszeit) {
      setEmployeeSchedule(data.regelarbeitszeit as unknown as WeekSchedule);
    }
    setIsExternalUser(data?.is_external === true || data?.kategorie === "extern");
  }, [targetUserId]);

  useEffect(() => { fetchEmployeeSchedule(); }, [fetchEmployeeSchedule]);

  // Fetch existing entries for selected date
  const fetchExistingDayEntries = async (date: string) => {
    setLoadingDayEntries(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoadingDayEntries(false);
      return;
    }

    const { data, error } = await supabase
      .from("time_entries")
      .select(`
        id,
        start_time,
        end_time,
        stunden,
        taetigkeit,
        pause_start,
        pause_end,
        location_type,
        project_id,
        kilometer,
        km_beschreibung,
        zeit_typ,
        projects (name, plz)
      `)
      .eq("user_id", targetUserId || user.id)
      .eq("datum", date)
      .order("start_time");

    if (!error && data) {
      const entries: ExistingEntry[] = data.map((entry: any) => ({
        id: entry.id,
        start_time: entry.start_time,
        end_time: entry.end_time,
        stunden: entry.stunden,
        taetigkeit: entry.taetigkeit,
        project_name: entry.projects?.name || null,
        project_id: entry.project_id || null,
        plz: entry.projects?.plz || null,
        pause_start: entry.pause_start || null,
        pause_end: entry.pause_end || null,
        location_type: entry.location_type || null,
        kilometer: entry.kilometer || null,
        km_beschreibung: entry.km_beschreibung || null,
        zeit_typ: entry.zeit_typ || null,
      }));
      setExistingDayEntries(entries);
      
      // If entries exist, suggest next time slot for first block
      if (entries.length > 0 && !entries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit))) {
        const lastEntry = entries[entries.length - 1];
        const [lastEndHours, lastEndMinutes] = lastEntry.end_time.split(':').map(Number);
        const nextStartMinutes = lastEndHours * 60 + lastEndMinutes + 30;
        const suggestedStart = `${String(Math.floor(nextStartMinutes / 60)).padStart(2, '0')}:${String(nextStartMinutes % 60).padStart(2, '0')}`;
        
        setTimeBlocks([createDefaultBlock(suggestedStart)]);
      } else if (!entries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit))) {
        // Auto-fill default work times for the selected date
        const dateObj = new Date(date);
        const defaults = getDefaultWorkTimes(dateObj, employeeSchedule);
        if (defaults) {
          setTimeBlocks([createDefaultBlock(defaults.startTime, defaults.endTime)]);
        } else {
          setTimeBlocks([createDefaultBlock()]);
        }
      }
    } else {
      setExistingDayEntries([]);
      // Auto-fill default work times from employee schedule
      const dateObj = new Date(date);
      const defaults = getDefaultWorkTimes(dateObj, employeeSchedule);
      if (defaults) {
        setTimeBlocks([createDefaultBlock(defaults.startTime, defaults.endTime)]);
      } else {
        setTimeBlocks([createDefaultBlock()]);
      }
    }
    setLoadingDayEntries(false);
  };

  // Load existing entries when date changes
  useEffect(() => {
    setEditMode(false);
    setEditingEntryIds([]);
    fetchExistingDayEntries(selectedDate);
  }, [selectedDate]);

  // Auto-enter edit mode when navigated with ?date= and entries exist
  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (dateParam && existingDayEntries.length > 0 && !editMode && !loadingDayEntries) {
      const hasNormalEntries = existingDayEntries.some(
        e => !["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit)
      );
      if (hasNormalEntries) {
        enterEditMode();
        // Clear the date param so refreshing doesn't re-enter edit mode
        // Keep user_id if present (admin mode)
        const newParams: Record<string, string> = {};
        if (targetUserId) newParams.user_id = targetUserId;
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [existingDayEntries, loadingDayEntries]);

  // Check admin status and fetch target user name
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "administrator")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (targetUserId) {
      supabase
        .from("profiles")
        .select("vorname, nachname")
        .eq("id", targetUserId)
        .single()
        .then(({ data }) => {
          if (data) setTargetUserName(`${data.vorname} ${data.nachname}`);
        });
    }
  }, [targetUserId]);

  useEffect(() => {
    fetchProjects();

    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreateNewProject = async () => {
    if (creatingProject) return;
    
    if (!newProjectName.trim() || !newProjectPlz.trim()) {
      sonnerToast.error("Name und PLZ sind Pflichtfelder");
      return;
    }

    if (!/^\d{4,5}$/.test(newProjectPlz)) {
      sonnerToast.error("PLZ muss 4-5 Ziffern haben");
      return;
    }

    setCreatingProject(true);

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: newProjectName.trim(),
        plz: newProjectPlz.trim(),
        adresse: newProjectAddress.trim() || null,
        status: 'aktiv'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        sonnerToast.error("Ein Projekt mit diesem Namen und PLZ existiert bereits");
      } else {
        sonnerToast.error("Projekt konnte nicht erstellt werden");
      }
      setCreatingProject(false);
      return;
    }

    sonnerToast.success("Projekt erfolgreich erstellt");

    // Refresh project list so new project is immediately visible
    await fetchProjects();

    // Set the project in the pending block
    if (pendingBlockIdForNewProject) {
      updateBlock(pendingBlockIdForNewProject, { projectId: data.id });
    }
    
    setShowNewProjectDialog(false);
    setNewProjectName("");
    setNewProjectPlz("");
    setNewProjectAddress("");
    setPendingBlockIdForNewProject(null);
    setCreatingProject(false);
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, status, plz")
      .eq("status", "aktiv")
      .order("name");

    if (data) setProjects(data);
    setLoading(false);
  };

  // Update a specific block
  const updateBlock = (blockId: string, updates: Partial<TimeBlock>) => {
    setTimeBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, ...updates } : block
    ));
  };

  // Add a new time block
  const addTimeBlock = () => {
    const lastBlock = timeBlocks[timeBlocks.length - 1];
    let suggestedStart = "";
    
    if (lastBlock.endTime) {
      const [endH, endM] = lastBlock.endTime.split(':').map(Number);
      const nextMinutes = endH * 60 + endM + 30; // 30 min after last block ends
      suggestedStart = `${String(Math.floor(nextMinutes / 60)).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`;
    }
    
    setTimeBlocks(prev => [...prev, createDefaultBlock(suggestedStart)]);
  };

  // Remove a time block
  const removeBlock = (blockId: string) => {
    setTimeBlocks(prev => prev.filter(block => block.id !== blockId));
  };

  // Enter edit mode: load existing entries as editable time blocks
  const enterEditMode = () => {
    const blocks: TimeBlock[] = existingDayEntries
      .filter(e => !["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit))
      .map(entry => ({
        id: crypto.randomUUID(),
        locationType: (entry.location_type === "werkstatt" ? "werkstatt" : "baustelle") as "baustelle" | "werkstatt",
        projectId: entry.project_id || "",
        taetigkeit: entry.taetigkeit || "",
        startTime: entry.start_time?.substring(0, 5) || "",
        endTime: entry.end_time?.substring(0, 5) || "",
        manualHours: "",
        pauseStart: entry.pause_start?.substring(0, 5) || "",
        pauseEnd: entry.pause_end?.substring(0, 5) || "",
        kilometer: entry.kilometer ? String(entry.kilometer) : "",
        kmBeschreibung: entry.km_beschreibung || "",
        zeitTyp: (entry.zeit_typ as TimeBlock["zeitTyp"]) || "normal",
      }));
    if (blocks.length === 0) blocks.push(createDefaultBlock());
    setTimeBlocks(blocks);
    setEditingEntryIds(existingDayEntries.map(e => e.id));
    setEditMode(true);
  };

  const cancelEditMode = () => {
    setEditMode(false);
    setEditingEntryIds([]);
    fetchExistingDayEntries(selectedDate);
  };

  const calculateBlockPauseMinutes = (block: TimeBlock): number => {
    if (!block.pauseStart || !block.pauseEnd) return 0;
    const [sh, sm] = block.pauseStart.split(':').map(Number);
    const [eh, em] = block.pauseEnd.split(':').map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  };

  // Calculate hours for a single block
  const calculateBlockHours = (block: TimeBlock): number => {
    if (!block.startTime || !block.endTime) return 0;

    const [startH, startM] = block.startTime.split(':').map(Number);
    const [endH, endM] = block.endTime.split(':').map(Number);
    const pauseMinutes = calculateBlockPauseMinutes(block);

    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM) - pauseMinutes;
    return Math.max(0, totalMinutes / 60);
  };

  // Calculate total hours across all blocks
  const calculateTotalHours = (): string => {
    const total = timeBlocks.reduce((sum, block) => sum + calculateBlockHours(block), 0);
    return total.toFixed(2);
  };

  // Quick-fill preset for first block
  const applyFullDayPreset = () => {
    if (timeBlocks.length > 0) {
      const selectedDateObj = new Date(selectedDate);
      const defaultTimes = getDefaultWorkTimes(selectedDateObj, employeeSchedule);

      if (!defaultTimes) {
        toast({
          variant: "destructive",
          title: "Arbeitsfrei", 
          description: "Am Wochenende wird nicht gearbeitet"
        });
        return;
      }
      
      updateBlock(timeBlocks[0].id, {
        startTime: defaultTimes.startTime,
        endTime: defaultTimes.endTime,
      });
    }
  };

  const handleAbsenceSubmit = async () => {
    if (submittingAbsence) return;
    
    setSubmittingAbsence(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSubmittingAbsence(false);
      return;
    }

    const { count: existingCount } = await supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("datum", absenceData.date);

    if ((existingCount ?? 0) > 0) {
      toast({ 
        variant: "destructive", 
        title: "Eintrag bereits vorhanden", 
        description: "Für diesen Tag wurden die Stunden bereits eingetragen, gehe unter Meine Stunden rein." 
      });
      setSubmittingAbsence(false);
      return;
    }

    let documentPath = null;
    if (absenceData.type === "krankenstand" && absenceData.document) {
      const fileName = `${user.id}/${Date.now()}_${absenceData.document.name}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(fileName, absenceData.document);

      if (uploadError) {
        toast({ variant: "destructive", title: "Fehler", description: `Dokument konnte nicht hochgeladen werden: ${uploadError.message}` });
        setSubmittingAbsence(false);
        return;
      }

      documentPath = fileName;
    }

    const selectedDateObj = new Date(absenceData.date);
    const automaticHours = getNormalWorkingHours(selectedDateObj, employeeSchedule);
    const defaultTimes = getDefaultWorkTimes(selectedDateObj, employeeSchedule);

    let workingHours: number;
    let entryStartTime: string;
    let entryEndTime: string;
    let entryPauseMinutes: number;

    if (absenceData.isFullDay) {
      workingHours = absenceData.customHours ? parseFloat(absenceData.customHours) : automaticHours;
      entryStartTime = defaultTimes?.startTime || "07:00";
      entryEndTime = defaultTimes?.endTime || "16:00";
      entryPauseMinutes = defaultTimes?.pauseMinutes || 30;
    } else {
      // Calculate from Von/Bis
      const [sH, sM] = absenceData.absenceStartTime.split(':').map(Number);
      const [eH, eM] = absenceData.absenceEndTime.split(':').map(Number);
      const pause = parseInt(absenceData.absencePauseMinutes) || 0;
      const totalMinutes = (eH * 60 + eM) - (sH * 60 + sM) - pause;
      workingHours = Math.max(0, totalMinutes / 60);
      entryStartTime = absenceData.absenceStartTime;
      entryEndTime = absenceData.absenceEndTime;
      entryPauseMinutes = pause;
    }

    // ZA: Check and deduct from time account
    if (absenceData.type === "za") {
      const { data: timeAccount, error: taError } = await supabase
        .from("time_accounts")
        .select("id, balance_hours")
        .eq("user_id", user.id)
        .maybeSingle();

      if (taError || !timeAccount) {
        toast({ variant: "destructive", title: "Fehler", description: "Kein Zeitkonto gefunden. Bitte wenden Sie sich an den Administrator." });
        setSubmittingAbsence(false);
        return;
      }

      if (Number(timeAccount.balance_hours) < workingHours) {
        toast({ variant: "destructive", title: "Nicht genügend ZA-Stunden", description: `Verfügbar: ${timeAccount.balance_hours}h, benötigt: ${workingHours}h` });
        setSubmittingAbsence(false);
        return;
      }

      const balanceBefore = Number(timeAccount.balance_hours);
      const balanceAfter = balanceBefore - workingHours;

      const { error: updateErr } = await supabase
        .from("time_accounts")
        .update({ balance_hours: balanceAfter, updated_at: new Date().toISOString() })
        .eq("id", timeAccount.id);

      if (updateErr) {
        toast({ variant: "destructive", title: "Fehler", description: "ZA-Stunden konnten nicht abgebucht werden" });
        setSubmittingAbsence(false);
        return;
      }

      await supabase.from("time_account_transactions").insert({
        user_id: user.id,
        changed_by: user.id,
        change_type: "za_abzug",
        hours: -workingHours,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: `Zeitausgleich am ${absenceData.date}`,
      });
    }

    const absenceLabel = absenceData.type === "urlaub" ? "Urlaub" : absenceData.type === "krankenstand" ? "Krankenstand" : absenceData.type === "weiterbildung" ? "Weiterbildung" : absenceData.type === "za" ? "Zeitausgleich" : "Feiertag";

    const { error } = await supabase.from("time_entries").insert({
      user_id: user.id,
      datum: absenceData.date,
      project_id: null,
      taetigkeit: absenceLabel,
      stunden: workingHours,
      start_time: entryStartTime,
      end_time: entryEndTime,
      pause_minutes: entryPauseMinutes,
      location_type: "baustelle",
      notizen: documentPath ? `Krankmeldung: ${documentPath}` : null,
      week_type: null,
    });

    if (!error) {
      toast({ title: "Erfolg", description: `${absenceLabel} erfasst` });
      setShowAbsenceDialog(false);
      setAbsenceData({
        date: new Date().toISOString().split('T')[0],
        type: "urlaub",
        document: null,
        customHours: "",
        isFullDay: true,
        absenceStartTime: "07:00",
        absenceEndTime: "16:00",
        absencePauseMinutes: "30",
      });
      fetchExistingDayEntries(selectedDate);
    } else {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht gespeichert werden" });
    }
    setSubmittingAbsence(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      setSaving(false);
      return;
    }

    // Validate all blocks
    for (let i = 0; i < timeBlocks.length; i++) {
      const block = timeBlocks[i];
      const blockNum = i + 1;

      if (isExternalUser) {
        // External: only manual hours required
        if (!block.manualHours || parseFloat(block.manualHours) <= 0) {
          toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Gesamtstunden erforderlich` });
          setSaving(false);
          return;
        }
      } else {
        if (!block.startTime || !block.endTime) {
          toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Start- und Endzeit erforderlich` });
          setSaving(false);
          return;
        }

        const [startH, startM] = block.startTime.split(':').map(Number);
        const [endH, endM] = block.endTime.split(':').map(Number);
        if (endH * 60 + endM <= startH * 60 + startM) {
          toast({ variant: "destructive", title: "Fehler", description: `Block ${blockNum}: Endzeit muss nach Startzeit liegen` });
          setSaving(false);
          return;
        }
      }

      // Tätigkeit and Projekt are now optional - no validation needed
    }

    // Check for overlaps between blocks (skip for external — they use manual hours)
    const timeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    if (!isExternalUser) {
      for (let i = 0; i < timeBlocks.length; i++) {
        for (let j = i + 1; j < timeBlocks.length; j++) {
          const blockA = timeBlocks[i];
          const blockB = timeBlocks[j];

          const aStart = timeToMinutes(blockA.startTime);
          const aEnd = timeToMinutes(blockA.endTime);
          const bStart = timeToMinutes(blockB.startTime);
          const bEnd = timeToMinutes(blockB.endTime);

          if (aStart < bEnd && aEnd > bStart) {
            toast({
              variant: "destructive",
              title: "Zeitüberschneidung",
              description: `Block ${i + 1} und Block ${j + 1} überschneiden sich`
            });
            setSaving(false);
            return;
          }
        }
      }
    }

    // Check for overlaps with existing entries (skip entries being edited, skip for external)
    if (!editMode && !isExternalUser) {
      const { data: existingEntries } = await supabase
        .from("time_entries")
        .select("id, start_time, end_time, taetigkeit")
        .eq("user_id", targetUserId || user.id)
        .eq("datum", selectedDate);

      if (existingEntries && existingEntries.length > 0) {
        for (const entry of existingEntries) {
          if (["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(entry.taetigkeit)) {
            toast({
              variant: "destructive",
              title: "Tag bereits blockiert",
              description: `Für diesen Tag ist bereits ${entry.taetigkeit} eingetragen.`
            });
            setSaving(false);
            return;
          }

          const existingStart = timeToMinutes(entry.start_time);
          const existingEnd = timeToMinutes(entry.end_time);

          for (let i = 0; i < timeBlocks.length; i++) {
            const block = timeBlocks[i];
            const blockStart = timeToMinutes(block.startTime);
            const blockEnd = timeToMinutes(block.endTime);

            if (blockStart < existingEnd && blockEnd > existingStart) {
              toast({
                variant: "destructive",
                title: "Zeitüberschneidung",
                description: `Block ${i + 1} überschneidet mit bestehendem Eintrag (${entry.start_time.substring(0, 5)} - ${entry.end_time.substring(0, 5)})`
              });
              setSaving(false);
              return;
            }
          }
        }
      }
    }

    // In edit mode, delete old entries first
    if (editMode && editingEntryIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("time_entries")
        .delete()
        .in("id", editingEntryIds);
      if (deleteError) {
        toast({ variant: "destructive", title: "Fehler", description: "Alte Einträge konnten nicht gelöscht werden" });
        setSaving(false);
        return;
      }
    }

    // Insert all blocks
    let totalEntriesCreated = 0;
    let hasError = false;

    for (const block of timeBlocks) {
      const blockHours = isExternalUser
        ? parseFloat(block.manualHours) || 0
        : calculateBlockHours(block);
      const pauseMinutes = isExternalUser ? 0 : calculateBlockPauseMinutes(block);

      const km = block.kilometer ? parseFloat(block.kilometer) : null;

      const { error: insertError } = await supabase.from("time_entries").insert({
        user_id: targetUserId || user.id,
        datum: selectedDate,
        project_id: block.locationType === "werkstatt" ? null : (block.projectId || null),
        taetigkeit: block.taetigkeit,
        stunden: blockHours,
        start_time: isExternalUser ? null : block.startTime,
        end_time: isExternalUser ? null : block.endTime,
        pause_minutes: pauseMinutes,
        pause_start: isExternalUser ? null : (block.pauseStart || null),
        pause_end: isExternalUser ? null : (block.pauseEnd || null),
        location_type: block.locationType,
        notizen: null,
        week_type: null,
        kilometer: km,
        km_beschreibung: block.kmBeschreibung || null,
        zeit_typ: isExternalUser ? "normal" : block.zeitTyp,
        diaeten_typ: isExternalUser ? null : block.diaetTyp,
        diaeten_betrag: null,
        diaeten_anfahrt: isExternalUser ? false : block.diaetAnfahrt,
      });

      if (insertError) {
        hasError = true;
        console.error("Error creating time entry:", insertError);
        toast({ variant: "destructive", title: "Fehler beim Speichern", description: insertError.message });
        continue;
      }

      totalEntriesCreated += 1;
    }

    if (!hasError) {
      toast({ title: "Erfolg", description: editMode
        ? `${totalEntriesCreated} Eintrag/Einträge aktualisiert`
        : `${totalEntriesCreated} Eintrag/Einträge gespeichert`
      });

      // Admin mode: navigate back to hours report with filters
      if (targetUserId) {
        const returnMonth = searchParams.get("return_month");
        const returnYear = searchParams.get("return_year");
        const params = new URLSearchParams();
        if (returnMonth) params.set("month", returnMonth);
        if (returnYear) params.set("year", returnYear);
        params.set("user", targetUserId);
        navigate(`/hours-report?${params.toString()}`);
        setSaving(false);
        return;
      }

      // Exit edit mode
      if (editMode) {
        setEditMode(false);
        setEditingEntryIds([]);
      }

      // Refresh existing entries
      await fetchExistingDayEntries(selectedDate);
    } else {
      toast({ variant: "destructive", title: "Fehler", description: "Einige Einträge konnten nicht gespeichert werden" });
    }
    setSaving(false);
  };

  const handleSaveBadWeather = async () => {
    if (!badWeatherData.projectId || !badWeatherData.beginn || !badWeatherData.ende) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte Projekt, Beginn und Ende ausfüllen" });
      return;
    }
    setSavingBadWeather(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingBadWeather(false); return; }

    const [bh, bm] = badWeatherData.beginn.split(":").map(Number);
    const [eh, em] = badWeatherData.ende.split(":").map(Number);
    const stunden = Math.max(0, Math.round(((eh * 60 + em) - (bh * 60 + bm)) / 60 * 100) / 100);

    const { error } = await supabase.from("bad_weather_records").insert({
      user_id: targetUserId || user.id,
      project_id: badWeatherData.projectId,
      datum: selectedDate,
      beginn_schlechtwetter: badWeatherData.beginn,
      ende_schlechtwetter: badWeatherData.ende,
      schlechtwetter_stunden: stunden,
      arbeitsstunden_vor_schlechtwetter: parseFloat(badWeatherData.arbeitsstundenVorher) || 0,
      wetter_art: badWeatherArt,
      notizen: badWeatherData.notizen.trim() || null,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Gespeichert", description: `Schlechtwetter-Eintrag (${stunden}h) erstellt` });
      setShowBadWeatherDialog(false);
      setBadWeatherData({ projectId: "", beginn: "08:00", ende: "16:00", arbeitsstundenVorher: "", notizen: "" });
      setBadWeatherArt([]);
    }
    setSavingBadWeather(false);
  };

  const isDayBlocked = existingDayEntries.some(e => ["Urlaub", "Krankenstand", "Weiterbildung", "Feiertag", "Zeitausgleich"].includes(e.taetigkeit));

  if (loading) return <div className="p-4">Lädt...</div>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Zeiterfassung" />
      
      <div className="p-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            {targetUserId && targetUserName && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-blue-800">
                  Bearbeitung für <strong>{targetUserName}</strong>
                </span>
                <Button variant="ghost" size="sm" onClick={() => {
                  const returnMonth = searchParams.get("return_month");
                  const returnYear = searchParams.get("return_year");
                  const params = new URLSearchParams();
                  if (returnMonth) params.set("month", returnMonth);
                  if (returnYear) params.set("year", returnYear);
                  if (targetUserId) params.set("user", targetUserId);
                  navigate(`/hours-report?${params.toString()}`);
                }} className="text-blue-600 h-7">
                  Zurück
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <CardTitle>Zeiterfassung</CardTitle>
              </div>
              {!targetUserId && !isExternalUser && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBadWeatherDialog(true)}
                    className="gap-1"
                  >
                    <CloudRain className="h-4 w-4" />
                    <span className="hidden sm:inline">Schlechtwetter</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAbsenceDialog(true)}
                    className="gap-1"
                  >
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Abwesenheit</span>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date picker */}
              <div className="space-y-2">
                <Label htmlFor="date">Datum</Label>
                <Input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => { if (!editMode && !targetUserId) setSelectedDate(e.target.value); }}
                  disabled={editMode || !!targetUserId}
                  required
                />
                {selectedDate && (
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedDate), "EEEE, dd. MMMM yyyy", { locale: de })}
                  </p>
                )}
              </div>

              {/* Weekly target info — not for external */}
              {!isExternalUser && (
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {getWeeklyTargetHours(employeeSchedule)}h Wochensoll
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const s = employeeSchedule || DEFAULT_SCHEDULE;
                      const workDays = Object.entries(s)
                        .filter(([, d]) => d.hours > 0)
                        .map(([key, d]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${d.hours}h`);
                      return workDays.join(", ");
                    })()}
                  </span>
                </div>
              </div>
              )}

              {/* Edit mode banner */}
              {editMode && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                    <Pencil className="w-4 h-4" />
                    Bearbeitungsmodus — Änderungen an bestehenden Einträgen
                  </div>
                  <Button variant="ghost" size="sm" onClick={cancelEditMode}>Abbrechen</Button>
                </div>
              )}

              {/* Existing entries info box */}
              {!editMode && (loadingDayEntries ? (
                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 animate-pulse" />
                  Lade Tageseinträge...
                </div>
              ) : existingDayEntries.length > 0 ? (
                <div className={`rounded-lg p-4 space-y-3 ${
                  isDayBlocked
                    ? "bg-destructive/10 border border-destructive/30"
                    : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                }`}>
                  <div className="flex items-center gap-2 font-medium text-sm">
                    {isDayBlocked ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-destructive">Tag blockiert ({existingDayEntries[0].taetigkeit})</span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-700 dark:text-amber-300">Bereits gebuchte Zeiten</span>
                      </>
                    )}
                  </div>
                  
                  {!isDayBlocked && (
                    <div className="space-y-1.5">
                      {existingDayEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between text-sm bg-background/60 rounded px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {entry.start_time.substring(0, 5)} - {entry.end_time.substring(0, 5)}
                            </Badge>
                            <span className="truncate max-w-[150px]">
                              {entry.project_name ? `${entry.project_name}` : entry.taetigkeit}
                            </span>
                          </div>
                          <span className="font-medium">{Number(entry.stunden).toFixed(2)}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between pt-2 border-t border-amber-200 dark:border-amber-700">
                    <span className="text-sm font-medium">Tagessumme</span>
                    <span className="font-bold">
                      {existingDayEntries.reduce((sum, e) => sum + Number(e.stunden), 0).toFixed(2)} Stunden
                    </span>
                  </div>
                  {!isDayBlocked && !editMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={enterEditMode}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Einträge bearbeiten
                    </Button>
                  )}
                </div>
              ) : (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Noch keine Einträge für diesen Tag
                  </p>
                </div>
              ))}

              {/* Remaining hours banner */}
              {!isDayBlocked && existingDayEntries.length > 0 && (() => {
                const dateObj = new Date(selectedDate);
                const target = getNormalWorkingHours(dateObj, employeeSchedule);
                const booked = existingDayEntries.reduce((sum, e) => sum + Number(e.stunden), 0);
                const remaining = target - booked;
                if (remaining <= 0 || target === 0) return null;
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">
                        Noch <strong>{remaining.toFixed(2)} h</strong> offen (Soll: {target}h)
                      </span>
                    </div>
                    <Button size="sm" onClick={() => setShowFillDialog(true)}>
                      Restzeit auffüllen
                    </Button>
                  </div>
                );
              })()}

              {/* Only show form if day is not blocked */}
              {!isDayBlocked && (
                <>

                  {/* Time Blocks */}
                  <div className="space-y-4">
                    {timeBlocks.map((block, index) => (
                      <div 
                        key={block.id} 
                        className="border rounded-lg p-4 space-y-4 bg-card"
                      >
                        {/* Block header */}
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-sm flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {timeBlocks.length > 1 ? `Zeitblock ${index + 1}` : "Arbeitszeit"}
                          </h3>
                          {timeBlocks.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBlock(block.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        {/* Location selection — not for external */}
                        {!isExternalUser && (
                        <div className="space-y-2">
                          <Label>Arbeitsort</Label>
                          <RadioGroup
                            value={block.locationType}
                            onValueChange={(value: 'baustelle' | 'werkstatt') => updateBlock(block.id, { locationType: value })}
                            className="grid grid-cols-2 gap-4"
                          >
                            <div>
                              <RadioGroupItem value="baustelle" id={`baustelle-${block.id}`} className="peer sr-only" />
                              <Label htmlFor={`baustelle-${block.id}`} className="flex h-12 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent peer-data-[state=checked]:border-primary text-sm">
                                🏗️ Baustelle
                              </Label>
                            </div>
                            <div>
                              <RadioGroupItem value="werkstatt" id={`werkstatt-${block.id}`} className="peer sr-only" />
                              <Label htmlFor={`werkstatt-${block.id}`} className="flex h-12 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent peer-data-[state=checked]:border-primary text-sm">
                                🏭 Lager
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                        )}

                        {/* Project selection - for Baustelle (internal) or always (external) */}
                        {(isExternalUser || block.locationType === "baustelle") && (
                          <div className="space-y-2">
                            <Label>{isExternalUser ? "Baustelle / Projekt" : "Projekt"} <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Select 
                              value={block.projectId} 
                              onValueChange={(value) => {
                                if (value === "new") {
                                  setPendingBlockIdForNewProject(block.id);
                                  setShowNewProjectDialog(true);
                                } else {
                                  updateBlock(block.id, { projectId: value });
                                }
                              }}
                            >
                              <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
                              <SelectContent>
                                {projects.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.plz})</SelectItem>
                                ))}
                                <SelectItem value="new" className="text-primary font-semibold">
                                  <div className="flex items-center gap-2"><Plus className="w-4 h-4" />Neues Projekt erstellen</div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Activity - optional */}
                        <div className="space-y-2">
                          <Label>Tätigkeit <span className="text-muted-foreground font-normal">(optional)</span></Label>
                          <Input 
                            value={block.taetigkeit} 
                            onChange={(e) => updateBlock(block.id, { taetigkeit: e.target.value })} 
                            placeholder="Optional - z.B. Montage, Aufmaß..."
                          />
                        </div>

                        {/* Time inputs — external: only manual hours */}
                        {isExternalUser ? (
                          <div className="space-y-1">
                            <Label className="text-xs">Gesamtstunden</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.25"
                              value={block.manualHours}
                              onChange={(e) => updateBlock(block.id, { manualHours: e.target.value })}
                              placeholder="z.B. 8"
                              required
                              className="h-10"
                            />
                          </div>
                        ) : (
                          <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Beginn</Label>
                            <Input
                              type="time"
                              value={block.startTime}
                              onChange={(e) => updateBlock(block.id, { startTime: e.target.value })}
                              required
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ende</Label>
                            <Input
                              type="time"
                              value={block.endTime}
                              onChange={(e) => updateBlock(block.id, { endTime: e.target.value })}
                              required
                              className="h-10"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Pause von</Label>
                            <Input
                              type="time"
                              value={block.pauseStart}
                              onChange={(e) => updateBlock(block.id, { pauseStart: e.target.value })}
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Pause bis</Label>
                            <Input
                              type="time"
                              value={block.pauseEnd}
                              onChange={(e) => updateBlock(block.id, { pauseEnd: e.target.value })}
                              className="h-10"
                            />
                          </div>
                        </div>
                        {calculateBlockPauseMinutes(block) > 0 && (
                          <p className="text-xs text-muted-foreground">{calculateBlockPauseMinutes(block)} Min. Pause werden abgezogen</p>
                        )}

                        {/* Zeittyp (Sonderzeiten) */}
                        <div className="space-y-2">
                          <Label className="text-xs">Zeittyp</Label>
                          <Select
                            value={block.zeitTyp}
                            onValueChange={(value) => updateBlock(block.id, { zeitTyp: value as TimeBlock["zeitTyp"] })}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">Normalzeit</SelectItem>
                              <SelectItem value="lenkzeit">Lenkzeit</SelectItem>
                              <SelectItem value="reisezeit">Reisezeit</SelectItem>
                              <SelectItem value="fahrt_100km">Fahrt &gt;100km</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                          </>
                        )}

                        {/* Kilometer */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Kilometer</Label>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={block.kilometer}
                              onChange={(e) => updateBlock(block.id, { kilometer: e.target.value })}
                              placeholder="0"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Strecke</Label>
                            <Input
                              value={block.kmBeschreibung}
                              onChange={(e) => updateBlock(block.id, { kmBeschreibung: e.target.value })}
                              placeholder="z.B. Graz → Baustelle"
                              className="h-10"
                            />
                          </div>
                        </div>
                        {block.kilometer && parseFloat(block.kilometer) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Kilometergeld: € {calculateKilometergeld(parseFloat(block.kilometer)).toFixed(2)}
                          </p>
                        )}


                        {/* Regelarbeitszeit button - not for external */}
                        {!isExternalUser && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const dateObj = new Date(selectedDate);
                              const defaults = getDefaultWorkTimes(dateObj, employeeSchedule);
                              if (defaults) {
                                updateBlock(block.id, {
                                  startTime: defaults.startTime,
                                  endTime: defaults.endTime,
                                  pauseStart: defaults.pauseStart,
                                  pauseEnd: defaults.pauseEnd,
                                });
                              }
                            }}
                            className="w-full text-xs"
                          >
                            <Sun className="w-3 h-3 mr-1" />
                            Regelarbeitszeit einfüllen
                          </Button>
                        )}

                        {/* Diäten */}
                        {!isExternalUser && (
                          <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                            <Label className="text-xs font-medium text-muted-foreground">Diäten</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {(["keine", "klein", "gross"] as const).map((typ) => (
                                <button
                                  key={typ}
                                  type="button"
                                  onClick={() => updateBlock(block.id, { diaetTyp: typ })}
                                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                                    block.diaetTyp === typ
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-background border-input hover:bg-muted"
                                  }`}
                                >
                                  {typ === "keine" ? "Keine" : typ === "klein" ? "3–9 Stunden" : "Über 9 Stunden"}
                                </button>
                              ))}
                            </div>
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={block.diaetAnfahrt}
                                onChange={(e) => updateBlock(block.id, { diaetAnfahrt: e.target.checked })}
                                className="rounded"
                              />
                              Baustellenanfahrt (einmal täglich)
                            </label>
                          </div>
                        )}

                        {/* Block hours */}
                        {!isExternalUser && (
                          <div className="bg-muted/50 rounded px-3 py-2 flex items-center justify-between text-sm">
                            <span>Stunden</span>
                            <span className="font-bold">{calculateBlockHours(block).toFixed(2)} h</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add another block button */}
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={addTimeBlock}
                    className="w-full gap-2 border-dashed"
                  >
                    <Plus className="w-4 h-4" />
                    Weitere Stunden hinzufügen
                  </Button>

                  {/* Total hours */}
                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex items-center justify-between">
                    <span className="font-medium">Gesamt zu buchen</span>
                    <span className="text-2xl font-bold">{calculateTotalHours()} h</span>
                  </div>

                  <div className="flex gap-2">
                    {editMode && (
                      <Button type="button" variant="outline" className="flex-1" onClick={cancelEditMode} disabled={saving}>
                        Abbrechen
                      </Button>
                    )}
                    <Button type="submit" className="flex-1" disabled={saving}>
                      {saving
                        ? "Wird gespeichert..."
                        : editMode
                          ? "Änderungen speichern"
                          : `${timeBlocks.length > 1 ? 'Alle Einträge' : 'Stunden'} erfassen`
                      }
                    </Button>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>

        {/* New Project Dialog */}
        <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neues Projekt erstellen</DialogTitle>
              <DialogDescription>Geben Sie die Details ein.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>Projektname *</Label><Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} /></div>
              <div><Label>PLZ *</Label><Input value={newProjectPlz} onChange={(e) => setNewProjectPlz(e.target.value)} maxLength={5} /></div>
              <div><Label>Adresse</Label><Input value={newProjectAddress} onChange={(e) => setNewProjectAddress(e.target.value)} /></div>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => { 
                    setShowNewProjectDialog(false); 
                    setNewProjectName(""); 
                    setNewProjectPlz(""); 
                    setNewProjectAddress(""); 
                    setPendingBlockIdForNewProject(null);
                  }}
                  disabled={creatingProject}
                >
                  Abbrechen
                </Button>
                <Button onClick={handleCreateNewProject} disabled={creatingProject}>
                  {creatingProject ? 'Wird erstellt...' : 'Erstellen'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Absence Dialog */}
        <Dialog open={showAbsenceDialog} onOpenChange={setShowAbsenceDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit erfassen</DialogTitle>
              <DialogDescription>Erfassen Sie Urlaub, Krankenstand, ZA, Weiterbildung oder Feiertag</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="absence-date">Datum</Label>
                <Input 
                  id="absence-date" 
                  type="date" 
                  value={absenceData.date} 
                  onChange={(e) => setAbsenceData({ ...absenceData, date: e.target.value })} 
                />
              </div>
              
              <div>
                <Label>Art</Label>
                <RadioGroup 
                  value={absenceData.type} 
                  onValueChange={(value: "urlaub" | "krankenstand" | "weiterbildung" | "feiertag" | "za") => setAbsenceData({ ...absenceData, type: value })}
                  className="grid grid-cols-3 gap-2 mt-2"
                >
                  <div>
                    <RadioGroupItem value="urlaub" id="urlaub" className="peer sr-only" />
                    <Label 
                      htmlFor="urlaub" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🏖️ Urlaub
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="krankenstand" id="krankenstand" className="peer sr-only" />
                    <Label 
                      htmlFor="krankenstand" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🏥 Kranken.
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="za" id="za" className="peer sr-only" />
                    <Label 
                      htmlFor="za" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      ⏰ ZA
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="weiterbildung" id="weiterbildung" className="peer sr-only" />
                    <Label 
                      htmlFor="weiterbildung" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      📚 Weiterbild.
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="feiertag" id="feiertag" className="peer sr-only" />
                    <Label 
                      htmlFor="feiertag" 
                      className="flex h-14 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                    >
                      🎉 Feiertag
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Ganzer Tag toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="full-day-toggle">Ganzer Tag</Label>
                <Switch
                  id="full-day-toggle"
                  checked={absenceData.isFullDay}
                  onCheckedChange={(checked) => {
                    const dateObj = new Date(absenceData.date);
                    const defaults = getDefaultWorkTimes(dateObj, employeeSchedule);
                    setAbsenceData({
                      ...absenceData,
                      isFullDay: checked,
                      absenceStartTime: defaults?.startTime || "07:00",
                      absenceEndTime: defaults?.endTime || "16:00",
                      absencePauseMinutes: String(defaults?.pauseMinutes ?? 30),
                    });
                  }}
                />
              </div>

              {absenceData.isFullDay ? (
                /* Full day: show calculated hours with optional override */
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Berechnete Stunden für diesen Tag:</span>
                    <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                      {absenceData.customHours || getNormalWorkingHours(new Date(absenceData.date), employeeSchedule)} h
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(() => {
                      const absenceDateObj = new Date(absenceData.date);
                      const dayOfWeek = absenceDateObj.getDay();
                      if (dayOfWeek === 0 || dayOfWeek === 6) return "Wochenende: 0 Stunden";
                      return "Mo-Fr: 8 Stunden (08:00 - 17:00, 1h Pause)";
                    })()}
                  </div>
                  <div className="pt-2 border-t">
                    <Label className="text-sm">Stunden anpassen (optional)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="24"
                        placeholder={String(getNormalWorkingHours(new Date(absenceData.date), employeeSchedule))}
                        value={absenceData.customHours}
                        onChange={(e) => setAbsenceData({ ...absenceData, customHours: e.target.value })}
                        className="w-24 text-center"
                      />
                      <span className="text-sm text-muted-foreground">Stunden</span>
                      {absenceData.customHours && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setAbsenceData({ ...absenceData, customHours: "" })}
                        >
                          Zurücksetzen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Partial day: Von/Bis time inputs */
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Von</Label>
                      <Input
                        type="time"
                        value={absenceData.absenceStartTime}
                        onChange={(e) => setAbsenceData({ ...absenceData, absenceStartTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Bis</Label>
                      <Input
                        type="time"
                        value={absenceData.absenceEndTime}
                        onChange={(e) => setAbsenceData({ ...absenceData, absenceEndTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pause (Minuten)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="120"
                      value={absenceData.absencePauseMinutes}
                      onChange={(e) => setAbsenceData({ ...absenceData, absencePauseMinutes: e.target.value })}
                      className="w-24"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Berechnete Stunden:</span>
                    <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                      {(() => {
                        const [sH, sM] = absenceData.absenceStartTime.split(':').map(Number);
                        const [eH, eM] = absenceData.absenceEndTime.split(':').map(Number);
                        const pause = parseInt(absenceData.absencePauseMinutes) || 0;
                        const total = Math.max(0, ((eH * 60 + eM) - (sH * 60 + sM) - pause) / 60);
                        return total.toFixed(2);
                      })()} h
                    </Badge>
                  </div>
                </div>
              )}

              {absenceData.type === "krankenstand" && (
                <div>
                  <Label htmlFor="document">Krankmeldung (optional)</Label>
                  <Input 
                    id="document" 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setAbsenceData({ ...absenceData, document: e.target.files?.[0] || null })}
                    className="mt-2"
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowAbsenceDialog(false);
                    setAbsenceData({ date: new Date().toISOString().split('T')[0], type: "urlaub", document: null, customHours: "", isFullDay: true, absenceStartTime: "07:00", absenceEndTime: "16:00", absencePauseMinutes: "30" });
                  }}
                  disabled={submittingAbsence}
                >
                  Abbrechen
                </Button>
                <Button onClick={handleAbsenceSubmit} disabled={submittingAbsence}>
                  {submittingAbsence ? "Wird gespeichert..." : "Erfassen"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Fill Remaining Hours Dialog */}
        <FillRemainingHoursDialog
          open={showFillDialog}
          onOpenChange={setShowFillDialog}
          remainingHours={(() => {
            const target = getNormalWorkingHours(new Date(selectedDate), employeeSchedule);
            const booked = existingDayEntries.reduce((sum, e) => sum + Number(e.stunden), 0);
            return Math.max(0, target - booked);
          })()}
          bookedHours={existingDayEntries.reduce((sum, e) => sum + Number(e.stunden), 0)}
          targetHours={getNormalWorkingHours(new Date(selectedDate), employeeSchedule)}
          projects={projects}
          existingEntries={existingDayEntries}
          onSubmit={async (projectId, locationType, description, startTime, endTime, pauseMinutes, pauseStart, pauseEnd) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [sh, sm] = startTime.split(":").map(Number);
            const [eh, em] = endTime.split(":").map(Number);
            const totalMinutes = (eh * 60 + em) - (sh * 60 + sm) - pauseMinutes;
            const hours = Math.max(0, totalMinutes / 60);

            const { error } = await supabase.from("time_entries").insert({
              user_id: targetUserId || user.id,
              datum: selectedDate,
              project_id: projectId,
              taetigkeit: description || "",
              stunden: hours,
              start_time: startTime,
              end_time: endTime,
              pause_minutes: pauseMinutes,
              pause_start: pauseStart,
              pause_end: pauseEnd,
              location_type: locationType,
              notizen: null,
              week_type: null,
            });

            if (error) {
              toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht gespeichert werden" });
              throw error;
            }

            toast({ title: "Erfolg", description: "Reststunden gebucht" });
            await fetchExistingDayEntries(selectedDate);
          }}
        />

        {/* Bad Weather Dialog */}
        <Dialog open={showBadWeatherDialog} onOpenChange={(open) => {
          setShowBadWeatherDialog(open);
          if (!open) {
            setBadWeatherData({ projectId: "", beginn: "08:00", ende: "16:00", arbeitsstundenVorher: "", notizen: "" });
            setBadWeatherArt([]);
          }
        }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CloudRain className="h-5 w-5" />
                Schlechtwetter dokumentieren
              </DialogTitle>
              <DialogDescription>
                Schlechtwetter für {selectedDate ? format(new Date(selectedDate), "EEEE, dd.MM.yyyy", { locale: de }) : "heute"} erfassen
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Baustelle / Projekt *</Label>
                <Select value={badWeatherData.projectId} onValueChange={(v) => setBadWeatherData({ ...badWeatherData, projectId: v })}>
                  <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
                  <SelectContent>
                    {projects.filter(p => p.status === "aktiv" || p.status === "in_planung").map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.plz})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Beginn Schlechtwetter *</Label>
                  <Input
                    type="time"
                    value={badWeatherData.beginn}
                    onChange={(e) => setBadWeatherData({ ...badWeatherData, beginn: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ende Schlechtwetter *</Label>
                  <Input
                    type="time"
                    value={badWeatherData.ende}
                    onChange={(e) => setBadWeatherData({ ...badWeatherData, ende: e.target.value })}
                  />
                </div>
              </div>

              {badWeatherData.beginn && badWeatherData.ende && (() => {
                const [bh, bm] = badWeatherData.beginn.split(":").map(Number);
                const [eh, em] = badWeatherData.ende.split(":").map(Number);
                const hrs = Math.max(0, ((eh * 60 + em) - (bh * 60 + bm)) / 60);
                return (
                  <p className="text-sm text-muted-foreground">
                    Schlechtwetter-Stunden: <strong>{hrs.toFixed(1)}h</strong>
                  </p>
                );
              })()}

              <div>
                <Label>Arbeitsstunden vor Schlechtwetter</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={badWeatherData.arbeitsstundenVorher}
                  onChange={(e) => setBadWeatherData({ ...badWeatherData, arbeitsstundenVorher: e.target.value })}
                  placeholder="z.B. 2.5"
                />
              </div>

              <div className="space-y-2">
                <Label>Art des Schlechtwetters</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "regen", label: "Regen" },
                    { value: "schnee", label: "Schnee" },
                    { value: "frost", label: "Frost" },
                    { value: "sturm", label: "Sturm" },
                    { value: "hagel", label: "Hagel" },
                    { value: "gewitter", label: "Gewitter" },
                  ].map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={badWeatherArt.includes(opt.value) ? "default" : "outline"}
                      className="cursor-pointer text-sm px-3 py-1.5 select-none"
                      onClick={() => {
                        setBadWeatherArt(prev =>
                          prev.includes(opt.value)
                            ? prev.filter(v => v !== opt.value)
                            : [...prev, opt.value]
                        );
                      }}
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Notizen</Label>
                <Input
                  value={badWeatherData.notizen}
                  onChange={(e) => setBadWeatherData({ ...badWeatherData, notizen: e.target.value })}
                  placeholder="Zusätzliche Informationen..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowBadWeatherDialog(false)}>
                  Abbrechen
                </Button>
                <Button onClick={handleSaveBadWeather} disabled={savingBadWeather}>
                  {savingBadWeather ? "Speichere..." : "Speichern"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default TimeTracking;
