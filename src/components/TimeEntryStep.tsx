import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { useDefaultWorkTimesForDate } from "@/hooks/useEmployeeSchedule";

export type TimeEntryFormData = {
  startTime: string;
  endTime: string;
  pauseMinutes: string;
  taetigkeit: string;
};

export type ExistingEntryWindow = {
  start_time: string;
  end_time: string;
};

interface Props {
  userId: string;
  projectId: string;
  projectName: string;
  datum: string;
  defaultTaetigkeit?: string;
  value: TimeEntryFormData;
  onChange: (v: TimeEntryFormData) => void;
  skip: boolean;
  onSkipChange: (v: boolean) => void;
}

/**
 * Wandelt "HH:MM" in Minuten ab Mitternacht um.
 */
function toMin(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Prueft ob zwei Zeit-Ranges sich ueberschneiden.
 */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Step 2 im Bericht-Wizard: Zeiterfassung mit Vorbefuellung aus Regelarbeitszeit
 * (zentral via useDefaultWorkTimesForDate, beruecksichtigt 14-Tage-Zyklus).
 * Prueft auch auf Ueberschneidungen mit bestehenden time_entries fuer den Tag.
 */
export function TimeEntryStep({
  userId,
  projectName,
  datum,
  defaultTaetigkeit = "",
  value,
  onChange,
  skip,
  onSkipChange,
}: Props) {
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [existingWindows, setExistingWindows] = useState<ExistingEntryWindow[]>([]);
  const [hasExistingFullDay, setHasExistingFullDay] = useState(false);
  const { preset, loading: scheduleLoading } = useDefaultWorkTimesForDate(userId, datum);

  // Defaults aus Regelarbeitszeit anwenden, sobald Schedule geladen ist
  useEffect(() => {
    if (scheduleLoading || defaultsLoaded) return;
    const startTime = preset?.startTime || "07:00";
    const endTime = preset?.endTime || "16:00";
    // Pause: aus regelarbeitszeit; Default 30
    const pauseMinutes = String(preset?.pauseMinutes ?? 30);
    onChange({
      startTime,
      endTime,
      pauseMinutes,
      taetigkeit: defaultTaetigkeit,
    });
    setDefaultsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleLoading, preset]);

  // Existierende time_entries fuer (user, datum) laden — fuer Ueberschneidungs-Check
  useEffect(() => {
    if (!userId || !datum) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("start_time, end_time, stunden, taetigkeit")
        .eq("user_id", userId)
        .eq("datum", datum);
      if (cancelled) return;
      const wins: ExistingEntryWindow[] = (data || [])
        .filter((d: any) => d.start_time && d.end_time)
        .map((d: any) => ({ start_time: d.start_time, end_time: d.end_time }));
      setExistingWindows(wins);
      // Ganztagsabwesenheit?
      setHasExistingFullDay(
        (data || []).some((d: any) =>
          ["urlaub", "krankenstand", "feiertag", "zeitausgleich", "schlechtwetter"].some((kw) =>
            (d.taetigkeit || "").toLowerCase().includes(kw)
          )
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, datum]);

  const startMin = toMin(value.startTime);
  const endMin = toMin(value.endTime);
  const conflict = !skip && existingWindows.some((w) => overlaps(startMin, endMin, toMin(w.start_time), toMin(w.end_time)));
  const wholeDayBlocked = hasExistingFullDay;

  // Wenn Ganztags-Abwesenheit existiert: skip-mode forcieren
  useEffect(() => {
    if (wholeDayBlocked && !skip) onSkipChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholeDayBlocked]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-base font-semibold">Zeiterfassung</Label>
        <p className="text-xs text-muted-foreground">
          {format(parseISO(datum), "dd.MM.yyyy")} · {projectName || "kein Projekt gewählt"}
        </p>
      </div>

      {wholeDayBlocked && (
        <div className="text-xs p-2 rounded bg-amber-50 border border-amber-200 text-amber-900">
          Für diesen Tag liegt bereits eine Ganztagsabwesenheit vor — Zeiterfassung wird übersprungen.
        </div>
      )}

      {existingWindows.length > 0 && !wholeDayBlocked && (
        <div className="text-xs p-2 rounded bg-blue-50 border border-blue-200 text-blue-900">
          Du hast heute bereits {existingWindows.length} Zeiteintrag{existingWindows.length === 1 ? "" : "äge"} ({" "}
          {existingWindows.map((w) => `${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`).join(", ")} ).
          Eine zusätzliche Erfassung ist möglich, wenn sie zeitlich nicht überschneidet.
        </div>
      )}

      <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30 transition-colors">
        <Checkbox checked={skip} onCheckedChange={(v) => onSkipChange(!!v)} />
        <span className="text-sm">Zeiterfassung überspringen (Bericht ohne Stunden speichern)</span>
      </label>

      {!skip && (
        <div className={defaultsLoaded ? "" : "opacity-50 pointer-events-none"}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Beginn</Label>
              <Input
                type="time"
                step={900}
                value={value.startTime}
                onChange={(e) => onChange({ ...value, startTime: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Ende</Label>
              <Input
                type="time"
                step={900}
                value={value.endTime}
                onChange={(e) => onChange({ ...value, endTime: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-3">
            <Label className="text-xs">Pause (Minuten)</Label>
            <Input
              type="number"
              min={0}
              step={5}
              value={value.pauseMinutes}
              onChange={(e) => onChange({ ...value, pauseMinutes: e.target.value })}
            />
          </div>
          <div className="mt-3">
            <Label className="text-xs">Tätigkeit (optional)</Label>
            <Textarea
              rows={2}
              value={value.taetigkeit}
              onChange={(e) => onChange({ ...value, taetigkeit: e.target.value })}
              placeholder="Kurze Beschreibung..."
              className="resize-none text-sm"
            />
          </div>
          {conflict && (
            <p className="mt-2 text-xs text-destructive">
              Achtung: Die Zeit überschneidet sich mit einem bestehenden Eintrag. Bitte anpassen oder überspringen.
            </p>
          )}
          {!conflict && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Voreingestellt aus deiner Regelarbeitszeit. Beim Speichern wird ein Eintrag in die Zeiterfassung geschrieben.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Berechnet Netto-Stunden aus Beginn/Ende/Pause.
 */
export function calcEntryHours(startTime: string, endTime: string, pauseMinutes: number): number {
  if (!startTime || !endTime) return 0;
  const [sH, sM] = startTime.split(":").map((n) => parseInt(n, 10));
  const [eH, eM] = endTime.split(":").map((n) => parseInt(n, 10));
  const startMin = sH * 60 + sM;
  let endMin = eH * 60 + eM;
  if (endMin < startMin) endMin += 24 * 60; // ueber Mitternacht
  const grossMin = endMin - startMin;
  const netMin = Math.max(0, grossMin - Math.max(0, pauseMinutes));
  return Math.round((netMin / 60) * 100) / 100;
}
