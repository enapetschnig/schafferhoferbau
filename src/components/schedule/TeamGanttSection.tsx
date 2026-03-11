import { useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { GanttBar } from "./GanttBar";
import {
  getAssignmentForDay,
  isOnLeave,
  isCompanyHoliday,
  getEmployeeColor,
} from "./scheduleUtils";
import type {
  Profile,
  Project,
  Assignment,
  LeaveRequest,
  CompanyHoliday,
} from "./scheduleTypes";

interface Props {
  profiles: Profile[];
  projects: Project[];
  assignments: Assignment[];
  leaveRequests: LeaveRequest[];
  holidays: CompanyHoliday[];
  days: Date[];
  canEditProject: (projectId: string) => boolean;
  onCellClick?: (userId: string, date: Date) => void;
}

export function TeamGanttSection({
  profiles,
  projects,
  assignments,
  leaveRequests,
  holidays,
  days,
  canEditProject,
  onCellClick,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

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
          const empColor = getEmployeeColor(profile.id);
          return (
          <div
            key={profile.id}
            className="grid border-t"
            style={{
              gridTemplateColumns: `minmax(140px, 200px) repeat(${days.length}, minmax(40px, 1fr))`,
            }}
          >
            {/* Label */}
            <div className={`p-2 border-r text-sm font-medium truncate sticky left-0 z-10 flex items-center ${empColor.bg} ${empColor.text}`}>
              {profile.vorname} {profile.nachname}
            </div>

            {/* Day cells */}
            {days.map((day) => {
              const holiday = isCompanyHoliday(holidays, day);
              const leave = isOnLeave(leaveRequests, profile.id, day);
              const assignment = getAssignmentForDay(
                assignments,
                profile.id,
                day
              );
              const projectName = assignment
                ? projectMap[assignment.project_id]
                : null;
              const editable = assignment
                ? canEditProject(assignment.project_id)
                : true;

              return (
                <div
                  key={day.toISOString()}
                  className={`p-0.5 border-r min-h-[40px] ${
                    holiday ? "bg-gray-100" : ""
                  } ${
                    !editable && !holiday && !leave
                      ? "opacity-60"
                      : ""
                  }`}
                  onClick={() => {
                    if (!holiday && !leave && editable && onCellClick) {
                      onCellClick(profile.id, day);
                    }
                  }}
                >
                  {holiday ? (
                    <GanttBar
                      label={holiday.bezeichnung || "Feiertag"}
                      variant="holiday"
                    />
                  ) : leave ? (
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
                  ) : assignment ? (
                    <GanttBar
                      projectId={assignment.project_id}
                      label={projectName || "–"}
                      colorOverride={empColor}
                      onClick={
                        editable && onCellClick
                          ? () => onCellClick(profile.id, day)
                          : undefined
                      }
                    />
                  ) : (
                    <div
                      className={`min-h-[32px] rounded-md border border-dashed border-muted-foreground/20 ${
                        onCellClick && editable
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
