import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

export type TimeEntryFormData = {
  startTime: string;
  endTime: string;
  pauseMinutes: string;
  taetigkeit: string;
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

const DAY_KEYS = ["so", "mo", "di", "mi", "do", "fr", "sa"] as const;

/**
 * Step 2 im Bericht-Wizard: Zeiterfassung mit Vorbefuellung aus Regelarbeitszeit.
 * Speichern erfolgt im Parent (handleSave in DailyReportForm) wenn skip=false.
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

  // Regelarbeitszeit aus employees laden, einmalig pro Datum/User
  useEffect(() => {
    if (!userId || !datum) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("regelarbeitszeit")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const sched = (data as any)?.regelarbeitszeit;
      const dow = DAY_KEYS[parseISO(datum).getDay()];
      const day = sched?.[dow];
      const startTime = day?.start || "07:00";
      const endTime = day?.end || "16:00";
      const pauseMinutes = String(day?.pause ?? 30);
      onChange({
        startTime,
        endTime,
        pauseMinutes,
        taetigkeit: defaultTaetigkeit,
      });
      setDefaultsLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, datum]);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-base font-semibold">Zeiterfassung</Label>
        <p className="text-xs text-muted-foreground">
          {format(parseISO(datum), "dd.MM.yyyy")} · {projectName || "kein Projekt gewählt"}
        </p>
      </div>

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
              step={15}
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
          <p className="text-[10px] text-muted-foreground mt-2">
            Voreingestellt aus deiner Regelarbeitszeit. Beim Speichern wird ein Eintrag in die Zeiterfassung geschrieben.
          </p>
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
