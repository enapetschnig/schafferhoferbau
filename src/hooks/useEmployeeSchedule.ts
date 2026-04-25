import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { WeekSchedule, Schwellenwert } from "@/lib/workingHours";
import { getEffectiveDay, getDefaultWorkTimes } from "@/lib/workingHours";

export interface EmployeeScheduleData {
  schedule: WeekSchedule | null;
  schwellenwert: Schwellenwert | null;
  wochenSollStunden: number | null;
  isExternal: boolean;
  loading: boolean;
}

/**
 * Zentrale Quelle fuer die Regelarbeitszeit eines Mitarbeiters.
 *
 * Liest:
 *  - regelarbeitszeit (JSONB, optional 14-taegiger Zyklus mit zyklus/woche_b/zyklus_anker)
 *  - schwellenwert
 *  - is_external / kategorie
 *
 * Hinweis: Diese Hook ist die einzig erlaubte Stelle fuer das Lesen von regelarbeitszeit.
 * Alle UI-Konsumenten (TimeTracking, TimeEntryStep, Schlechtwetter-Dialog, Abwesenheits-Dialog,
 * HoursReport, ProjectHoursReport) gehen ueber diese Hook.
 */
export function useEmployeeSchedule(userId: string | null | undefined): EmployeeScheduleData {
  const [data, setData] = useState<EmployeeScheduleData>({
    schedule: null,
    schwellenwert: null,
    wochenSollStunden: null,
    isExternal: false,
    loading: true,
  });

  useEffect(() => {
    if (!userId) {
      setData({ schedule: null, schwellenwert: null, wochenSollStunden: null, isExternal: false, loading: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase
        .from("employees")
        .select("regelarbeitszeit, schwellenwert, wochen_soll_stunden, is_external, kategorie")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setData({
        schedule: (row?.regelarbeitszeit as unknown as WeekSchedule) || null,
        schwellenwert: (row?.schwellenwert as unknown as Schwellenwert) || null,
        wochenSollStunden: (row?.wochen_soll_stunden as number | null) ?? null,
        isExternal: row?.is_external === true || row?.kategorie === "extern",
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return data;
}

/**
 * Convenience: gibt fuer ein Datum die effektiven Default-Zeiten (Beginn/Ende/Pause)
 * zurueck — beruecksichtigt 14-taegigen Zyklus.
 */
export function useDefaultWorkTimesForDate(userId: string | null | undefined, datum: string | null) {
  const sched = useEmployeeSchedule(userId);
  if (sched.loading || !datum) return { loading: sched.loading, preset: null, isExternal: sched.isExternal };
  const date = new Date(datum);
  const preset = getDefaultWorkTimes(date, sched.schedule);
  const day = getEffectiveDay(sched.schedule, date);
  return {
    loading: false,
    preset,
    day,
    isExternal: sched.isExternal,
  };
}
