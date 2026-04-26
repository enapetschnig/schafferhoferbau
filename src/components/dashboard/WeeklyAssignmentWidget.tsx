import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<WeekAssignment[]>([]);
  const [holidays, setHolidays] = useState<HolidayDay[]>([]);
  const [leaves, setLeaves] = useState<LeaveDay[]>([]);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfISOWeek(new Date());
  const weekEnd = addDays(weekStart, 6); // Include weekend
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const row1Days = weekDays.slice(0, 4); // Mo-Do
  const row2Days = weekDays.slice(4, 7); // Fr-So
  // Map: datum (yyyy-MM-dd) -> Ziel
  const [projectDayTargets, setProjectDayTargets] = useState<Record<string, string>>({});
  const [userDayGoals, setUserDayGoals] = useState<Record<string, string>>({});
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

      // Projekt-Tagesziele fuer alle Tage der Woche laden (pro Projekt+Datum)
      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");
      if (assignData && assignData.length > 0) {
        const projectIds = Array.from(new Set(assignData.map((a: any) => a.project_id)));
        const { data: targetsData } = await supabase
          .from("project_daily_targets")
          .select("project_id, datum, tagesziel")
          .in("project_id", projectIds)
          .gte("datum", weekStartStr)
          .lte("datum", weekEndStr);
        if (targetsData) {
          const map: Record<string, string> = {};
          for (const t of targetsData as any[]) {
            // pro Datum: das Ziel des am Tag eingeteilten Projekts
            const assign = assignData.find((a: any) => a.datum === t.datum && a.project_id === t.project_id);
            if (assign && t.tagesziel) map[t.datum] = t.tagesziel;
          }
          setProjectDayTargets(map);
        }
      }

      // User-spezifische Tages-Ziele (worker_goals scope=day) fuer die ganze Woche
      const [{ data: dayGoals }, { data: weekGoal }] = await Promise.all([
        (supabase.from("worker_goals") as any)
          .select("datum, ziel")
          .eq("user_id", userId)
          .eq("scope", "day")
          .gte("datum", weekStartStr)
          .lte("datum", weekEndStr),
        (supabase.from("worker_goals") as any)
          .select("ziel")
          .eq("user_id", userId)
          .eq("scope", "week")
          .eq("week_start", weekStartStr)
          .maybeSingle(),
      ]);
      if (dayGoals) {
        const map: Record<string, string> = {};
        for (const g of dayGoals as any[]) {
          if (g.datum && g.ziel) map[g.datum] = g.ziel;
        }
        setUserDayGoals(map);
      }
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
    const dayKey = format(day, "yyyy-MM-dd");
    // User-Tagesziel hat Vorrang vor Projekt-Tagesziel
    const dayGoal = userDayGoals[dayKey] || projectDayTargets[dayKey] || null;

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
            {dayGoal && (
              <div
                className="text-[9px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 leading-tight text-left"
                title={dayGoal}
              >
                <span className="font-medium">Ziel:</span> <span className="line-clamp-2">{dayGoal}</span>
              </div>
            )}
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
      <Card
        className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all"
        onClick={() => navigate("/schedule")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") navigate("/schedule"); }}
      >
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
          {/* Wochenziel wird unten angezeigt; Tagesziele sind direkt unter dem jeweiligen Projekt */}
          {userWochenziel && (
            <div className="pt-1 border-t mt-2">
              <p className="text-xs text-muted-foreground">Wochenziel:</p>
              <p className="text-sm font-medium">{userWochenziel}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
