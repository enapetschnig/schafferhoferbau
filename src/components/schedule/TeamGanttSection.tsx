import { useState, useEffect, useMemo } from "react";
import { format, startOfISOWeek } from "date-fns";
import { ChevronDown, ChevronRight, Users, Truck, Target } from "lucide-react";
import { GanttBar } from "./GanttBar";
import {
  getAssignmentForDay,
  getAssignmentsForDay,
  isOnLeave,
  isCompanyHoliday,
  getEmployeeColor,
  getProjectColor,
} from "./scheduleUtils";
import type {
  Profile,
  Project,
  Assignment,
  LeaveRequest,
  CompanyHoliday,
  WorkerGoal,
} from "./scheduleTypes";

interface Props {
  profiles: Profile[];
  projects: Project[];
  assignments: Assignment[];
  leaveRequests: LeaveRequest[];
  holidays: CompanyHoliday[];
  workerGoals?: WorkerGoal[];
  days: Date[];
  canEditProject: (projectId: string) => boolean;
  onCellClick?: (userId: string, date: Date) => void;
  onRangeSelect?: (userId: string, days: Date[]) => void;
}

export function TeamGanttSection({
  profiles,
  projects,
  assignments,
  leaveRequests,
  holidays,
  workerGoals = [],
  days,
  canEditProject,
  onCellClick,
  onRangeSelect,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragUserId, setDragUserId] = useState<string | null>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  // Goals nach (user_id|datum) und (user_id|week_start) indizieren
  const { dayGoalMap, weekGoalMap } = useMemo(() => {
    const dayMap: Record<string, string> = {};
    const weekMap: Record<string, string> = {};
    for (const g of workerGoals) {
      if (g.scope === "day" && g.datum) {
        dayMap[`${g.user_id}|${g.datum}`] = g.ziel;
      } else if (g.scope === "week" && g.week_start) {
        weekMap[`${g.user_id}|${g.week_start}`] = g.ziel;
      }
    }
    return { dayGoalMap: dayMap, weekGoalMap: weekMap };
  }, [workerGoals]);

  const truncate = (s: string, n = 22) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;

  useEffect(() => {
    const onMouseUp = () => {
      if (dragUserId !== null && dragStartIdx !== null && dragEndIdx !== null) {
        const lo = Math.min(dragStartIdx, dragEndIdx);
        const hi = Math.max(dragStartIdx, dragEndIdx);
        const selectedDays = days.slice(lo, hi + 1);
        if (selectedDays.length === 1 && onCellClick) {
          onCellClick(dragUserId, selectedDays[0]);
        } else if (selectedDays.length > 1 && onRangeSelect) {
          onRangeSelect(dragUserId, selectedDays);
        }
      }
      setDragUserId(null);
      setDragStartIdx(null);
      setDragEndIdx(null);
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragUserId, dragStartIdx, dragEndIdx, days, onCellClick, onRangeSelect]);

  return (
    <div className="border-b">
      {/* Section header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
        <Users className="h-4 w-4 shrink-0" />
        <span className="font-semibold text-sm">Teammitglieder</span>
        <span className="text-xs text-muted-foreground">
          {profiles.length} Mitarbeiter
        </span>
      </button>

      {!collapsed &&
        profiles.map((profile) => {
          const empColor = getEmployeeColor(profile.id, profiles.map(p => p.id));
          // Wochenziel fuer die erste Woche im sichtbaren Range (typischerweise nur eine in der Wochenansicht)
          const firstDay = days[0];
          const weekStartStr = firstDay ? format(startOfISOWeek(firstDay), "yyyy-MM-dd") : null;
          const wochenziel = weekStartStr ? weekGoalMap[`${profile.id}|${weekStartStr}`] : undefined;
          return (
          <div
            key={profile.id}
            className="grid border-t"
            style={{
              gridTemplateColumns: `minmax(140px, 200px) repeat(${days.length}, minmax(40px, 1fr))`,
            }}
          >
            {/* Label */}
            <div className={`p-2 border-r text-sm sticky left-0 z-10 flex flex-col justify-center gap-0.5 ${empColor.bg} ${empColor.text}`}>
              <span className="font-medium truncate">{profile.vorname} {profile.nachname}</span>
              {wochenziel && (
                <span
                  className="flex items-center gap-1 text-[10px] font-normal bg-amber-50 border border-amber-200 text-amber-900 rounded px-1 py-0.5 truncate"
                  title={`Wochenziel: ${wochenziel}`}
                >
                  <Target className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{truncate(wochenziel, 20)}</span>
                </span>
              )}
            </div>

            {/* Day cells */}
            {days.map((day, dayIdx) => {
              const holiday = isCompanyHoliday(holidays, day);
              const dow = day.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const leave = isOnLeave(leaveRequests, profile.id, day);
              const dayAssignments = getAssignmentsForDay(
                assignments,
                profile.id,
                day
              );
              const editable = dayAssignments.length > 0
                ? dayAssignments.some(a => canEditProject(a.project_id))
                : true;

              const isDragSelected =
                dragUserId === profile.id &&
                dragStartIdx !== null &&
                dragEndIdx !== null &&
                dayIdx >= Math.min(dragStartIdx, dragEndIdx) &&
                dayIdx <= Math.max(dragStartIdx, dragEndIdx);

              const dayKey = format(day, "yyyy-MM-dd");
              const tagesziel = dayGoalMap[`${profile.id}|${dayKey}`];

              return (
                <div
                  key={day.toISOString()}
                  className={`p-0.5 border-r min-h-[40px] select-none ${
                    holiday ? "bg-gray-100" : isWeekend ? "bg-muted/20" : ""
                  } ${
                    !editable && !holiday && !leave
                      ? "opacity-60"
                      : ""
                  } ${
                    isDragSelected
                      ? "bg-blue-100 ring-1 ring-inset ring-blue-400"
                      : ""
                  }`}
                  onMouseDown={() => {
                    if (!leave && editable && (onCellClick || onRangeSelect)) {
                      setDragUserId(profile.id);
                      setDragStartIdx(dayIdx);
                      setDragEndIdx(dayIdx);
                    }
                  }}
                  onMouseEnter={() => {
                    if (dragUserId === profile.id) {
                      setDragEndIdx(dayIdx);
                    }
                  }}
                >
                  {leave ? (
                    <GanttBar
                      label={
                        leave.type === "urlaub"
                          ? "Urlaub"
                          : leave.type === "krankenstand"
                          ? "Krank"
                          : leave.type === "za"
                          ? "ZA"
                          : leave.type
                      }
                      variant="leave"
                    />
                  ) : dayAssignments.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {holiday && (
                        <div className="text-[9px] text-gray-500 text-center truncate">{holiday.bezeichnung}</div>
                      )}
                      {dayAssignments.map((assignment) => (
                        <div key={assignment.id} className="relative">
                          <GanttBar
                            projectId={assignment.project_id}
                            label={projectMap[assignment.project_id] || "–"}
                            colorOverride={empColor}
                          />
                          {assignment.transport_erforderlich && (
                            <Truck
                              className="absolute top-0.5 right-0.5 h-3 w-3 text-orange-600 bg-white/80 rounded-sm"
                              aria-label="Transport erforderlich"
                            />
                          )}
                        </div>
                      ))}
                      {tagesziel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onCellClick) onCellClick(profile.id, day);
                          }}
                          className="flex items-center gap-0.5 text-[9px] bg-amber-50 border border-amber-200 text-amber-900 rounded px-1 py-0.5 truncate hover:bg-amber-100 transition-colors"
                          title={`Tagesziel: ${tagesziel}`}
                        >
                          <Target className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{truncate(tagesziel, 18)}</span>
                        </button>
                      )}
                    </div>
                  ) : holiday ? (
                    <GanttBar
                      label={holiday.bezeichnung || "Feiertag"}
                      variant="holiday"
                    />
                  ) : (
                    <div
                      className={`min-h-[32px] rounded-md border border-dashed border-muted-foreground/20 ${
                        (onCellClick || onRangeSelect) && editable
                          ? "cursor-pointer hover:bg-muted/30"
                          : ""
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
        })}

      {!collapsed && profiles.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          Keine aktiven Mitarbeiter
        </div>
      )}
    </div>
  );
}
