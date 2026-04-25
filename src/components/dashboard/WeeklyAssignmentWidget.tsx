import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfISOWeek,
  addDays,
  format,
  isSameDay,
  parseISO,
  isWithinInterval,
  getISOWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { getProjectColor } from "@/components/schedule/scheduleUtils";

type WeekAssignment = {
  datum: string;
  project_id: string;
  project_name: string;
  notizen: string | null;
};

type HolidayDay = {
  datum: string;
  bezeichnung: string | null;
};

type LeaveDay = {
  start_date: string;
  end_date: string;
  type: string;
};

interface Props {
  userId: string;
}

export function WeeklyAssignmentWidget({ userId }: Props) {
  const [assignments, setAssignments] = useState<WeekAssignment[]>([]);
  const [holidays, setHolidays] = useState<HolidayDay[]>([]);
  const [leaves, setLeaves] = useState<LeaveDay[]>([]);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfISOWeek(new Date());
  const weekEnd = addDays(weekStart, 6); // Include weekend
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const row1Days = weekDays.slice(0, 4); // Mo-Do
  const row2Days = weekDays.slice(4, 7); // Fr-So
  const [todayTarget, setTodayTarget] = useState<string | null>(null);
  const [userTagesziel, setUserTagesziel] = useState<string | null>(null);
  const [userWochenziel, setUserWochenziel] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const fromDate = format(weekStart, "yyyy-MM-dd");
      const toDate = format(weekEnd, "yyyy-MM-dd");

      const [{ data: assignData }, { data: holidayData }, { data: leaveData }] =
        await Promise.all([
          supabase
            .from("worker_assignments")
            .select("datum, project_id, notizen, projects:project_id(name)")
            .eq("user_id", userId)
            .gte("datum", fromDate)
            .lte("datum", toDate),
          supabase
            .from("company_holidays")
            .select("datum, bezeichnung")
            .gte("datum", fromDate)
            .lte("datum", toDate),
          supabase
            .from("leave_requests")
            .select("start_date, end_date, type")
            .eq("user_id", userId)
            .eq("status", "genehmigt")
            .lte("start_date", toDate)
            .gte("end_date", fromDate),
        ]);

      if (assignData) {
        setAssignments(
          assignData.map((a: any) => ({
            datum: a.datum,
            project_id: a.project_id,
            project_name: a.projects?.name || "–",
            notizen: a.notizen ?? null,
          }))
        );
      }

      if (holidayData) setHolidays(holidayData);
      if (leaveData) setLeaves(leaveData as LeaveDay[]);

      // Fetch today's target (Projekt-Tagesziel)
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const todayAssign = assignData?.find((a: any) => a.datum === todayStr);
      if (todayAssign) {
        const { data: targetData } = await supabase
          .from("project_daily_targets")
          .select("tagesziel")
          .eq("project_id", todayAssign.project_id)
          .eq("datum", todayStr)
          .maybeSingle();
        if (targetData?.tagesziel) setTodayTarget(targetData.tagesziel);
      }

      // User-spezifisches Tages- und Wochenziel (worker_goals)
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const [{ data: dayGoal }, { data: weekGoal }] = await Promise.all([
        (supabase.from("worker_goals") as any)
          .select("ziel")
          .eq("user_id", userId)
          .eq("scope", "day")
          .eq("datum", todayStr)
          .maybeSingle(),
        (supabase.from("worker_goals") as any)
          .select("ziel")
          .eq("user_id", userId)
          .eq("scope", "week")
          .eq("week_start", weekStartStr)
          .maybeSingle(),
      ]);
      setUserTagesziel((dayGoal as any)?.ziel || null);
      setUserWochenziel((weekGoal as any)?.ziel || null);

      setLoading(false);
    };

    fetch();
  }, [userId]);

  // Don't show if no data at all
  if (loading) return null;

  const hasAnyData =
    assignments.length > 0 || holidays.length > 0 || leaves.length > 0;
  if (!hasAnyData) return null;

  const renderDay = (day: Date) => {
    const dayAssigns = assignments.filter((a) => isSameDay(parseISO(a.datum), day));
    const holiday = holidays.find((h) => isSameDay(parseISO(h.datum), day));
    const leave = leaves.find((l) =>
      isWithinInterval(day, { start: parseISO(l.start_date), end: parseISO(l.end_date) })
    );
    const isToday = isSameDay(day, new Date());

    return (
      <div key={day.toISOString()} className="text-center">
        <div className={`text-[10px] font-medium mb-1 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
          {format(day, "EEE", { locale: de })}
        </div>
        {leave ? (
          <div className="rounded-md bg-green-100 text-green-800 text-[10px] px-1 py-2 border border-green-300">
            {leave.type === "urlaub" ? "Urlaub" : leave.type === "krankenstand" ? "Krank" : leave.type === "za" ? "ZA" : leave.type}
          </div>
        ) : dayAssigns.length > 0 ? (
          <div className="space-y-0.5">
            {holiday && <div className="text-[8px] text-gray-400">{holiday.bezeichnung}</div>}
            {dayAssigns.map((assign) => {
              const color = getProjectColor(assign.project_id);
              return (
                <div key={assign.project_id} className={`rounded-md ${color?.bg} ${color?.text} text-[10px] px-1 py-1.5 border ${color?.border}`}>
                  <div className="truncate">{assign.project_name}</div>
                </div>
              );
            })}
          </div>
        ) : holiday ? (
          <div className="rounded-md bg-gray-100 text-gray-500 text-[10px] px-1 py-2 border border-gray-200">
            {holiday.bezeichnung || "Feiertag"}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-muted-foreground/20 text-muted-foreground text-[10px] px-1 py-2">
            –
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        Meine Einteilung – KW {getISOWeek(weekStart)}
      </h2>
      <Card>
        <CardContent className="p-3 space-y-2">
          {/* Zeile 1: Mo-Do */}
          <div className="grid grid-cols-4 gap-1.5">
            {row1Days.map((day) => renderDay(day))}
          </div>
          {/* Zeile 2: Fr-So */}
          <div className="grid grid-cols-4 gap-1.5">
            {row2Days.map((day) => renderDay(day))}
            <div /> {/* Leere 4. Spalte fuer Alignment */}
          </div>
          {/* User-Tagesziel hat Vorrang vor Projekt-Tagesziel */}
          {(userTagesziel || todayTarget) && (
            <div className="pt-1 border-t mt-2">
              <p className="text-xs text-muted-foreground">Tagesziel:</p>
              <p className="text-sm font-medium">{userTagesziel || todayTarget}</p>
            </div>
          )}
          {userWochenziel && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground">Wochenziel:</p>
              <p className="text-sm font-medium">{userWochenziel}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
