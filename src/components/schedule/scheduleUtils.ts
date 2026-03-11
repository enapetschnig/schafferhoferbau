import { isSameDay, isWithinInterval, parseISO } from "date-fns";
import type { Assignment, LeaveRequest, CompanyHoliday } from "./scheduleTypes";

export const EMPLOYEE_COLORS = [
  { bg: "bg-red-100",     text: "text-red-800",     border: "border-red-300"     },
  { bg: "bg-rose-100",    text: "text-rose-800",    border: "border-rose-300"    },
  { bg: "bg-pink-100",    text: "text-pink-800",    border: "border-pink-300"    },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-800", border: "border-fuchsia-300" },
  { bg: "bg-red-200",     text: "text-red-900",     border: "border-red-400"     },
  { bg: "bg-rose-200",    text: "text-rose-900",    border: "border-rose-400"    },
  { bg: "bg-pink-200",    text: "text-pink-900",    border: "border-pink-400"    },
  { bg: "bg-orange-100",  text: "text-orange-800",  border: "border-orange-300"  },
  { bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200"     },
  { bg: "bg-fuchsia-200", text: "text-fuchsia-900", border: "border-fuchsia-400" },
];

export function getEmployeeColor(profileId: string) {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) {
    hash = ((hash << 5) - hash + profileId.charCodeAt(i)) | 0;
  }
  return EMPLOYEE_COLORS[Math.abs(hash) % EMPLOYEE_COLORS.length];
}

export const PROJECT_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300", fill: "#dbeafe" },
  { bg: "bg-green-100", text: "text-green-800", border: "border-green-300", fill: "#dcfce7" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", fill: "#fef3c7" },
  { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300", fill: "#f3e8ff" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300", fill: "#ffe4e6" },
  { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300", fill: "#cffafe" },
  { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300", fill: "#ffedd5" },
  { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-300", fill: "#e0e7ff" },
];

export function getProjectColorIndex(projectId: string): number {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash + projectId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PROJECT_COLORS.length;
}

export function getProjectColor(projectId: string) {
  return PROJECT_COLORS[getProjectColorIndex(projectId)];
}

export function getProjectColorClass(projectId: string): string {
  const c = getProjectColor(projectId);
  return `${c.bg} ${c.text} ${c.border}`;
}

export const RESOURCE_SUGGESTIONS = [
  "Aluschalung",
  "Eisenschalung",
  "Deckenschalung (m\u00B2)",
  "Transport",
  "Bagger",
  "Dumper",
  "Eisen",
  "Kamin",
  "D\u00E4mmung",
  "Diverses",
];

export function getAssignmentForDay(
  assignments: Assignment[],
  userId: string,
  date: Date
): Assignment | undefined {
  return assignments.find(
    (a) => a.user_id === userId && isSameDay(parseISO(a.datum), date)
  );
}

export function isOnLeave(
  leaveRequests: LeaveRequest[],
  userId: string,
  date: Date
): LeaveRequest | undefined {
  return leaveRequests.find(
    (lr) =>
      lr.user_id === userId &&
      lr.status === "genehmigt" &&
      isWithinInterval(date, {
        start: parseISO(lr.start_date),
        end: parseISO(lr.end_date),
      })
  );
}

export function isCompanyHoliday(
  holidays: CompanyHoliday[],
  date: Date
): CompanyHoliday | undefined {
  return holidays.find((h) => isSameDay(parseISO(h.datum), date));
}

/** Get contiguous day ranges for a project's assignments */
export function getProjectDayRanges(
  assignments: Assignment[],
  projectId: string,
  days: Date[]
): { startIdx: number; endIdx: number; workerCount: number }[] {
  const ranges: { startIdx: number; endIdx: number; workerCount: number }[] = [];
  let rangeStart: number | null = null;

  for (let i = 0; i < days.length; i++) {
    const dayAssignments = assignments.filter(
      (a) => a.project_id === projectId && isSameDay(parseISO(a.datum), days[i])
    );

    if (dayAssignments.length > 0) {
      if (rangeStart === null) rangeStart = i;
    } else {
      if (rangeStart !== null) {
        // Calculate avg worker count for this range
        let totalWorkers = 0;
        for (let j = rangeStart; j < i; j++) {
          totalWorkers += assignments.filter(
            (a) => a.project_id === projectId && isSameDay(parseISO(a.datum), days[j])
          ).length;
        }
        ranges.push({
          startIdx: rangeStart,
          endIdx: i - 1,
          workerCount: Math.round(totalWorkers / (i - rangeStart)),
        });
        rangeStart = null;
      }
    }
  }

  // Close last range
  if (rangeStart !== null) {
    let totalWorkers = 0;
    for (let j = rangeStart; j < days.length; j++) {
      totalWorkers += assignments.filter(
        (a) => a.project_id === projectId && isSameDay(parseISO(a.datum), days[j])
      ).length;
    }
    ranges.push({
      startIdx: rangeStart,
      endIdx: days.length - 1,
      workerCount: Math.round(totalWorkers / (days.length - rangeStart)),
    });
  }

  return ranges;
}
