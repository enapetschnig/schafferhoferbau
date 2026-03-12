import { isSameDay, isWithinInterval, parseISO } from "date-fns";
import type { Assignment, LeaveRequest, CompanyHoliday } from "./scheduleTypes";

export const EMPLOYEE_COLORS = [
  { bg: "bg-blue-500",    text: "text-white", border: "border-blue-600"    },
  { bg: "bg-emerald-500", text: "text-white", border: "border-emerald-600" },
  { bg: "bg-violet-500",  text: "text-white", border: "border-violet-600"  },
  { bg: "bg-amber-500",   text: "text-white", border: "border-amber-600"   },
  { bg: "bg-rose-500",    text: "text-white", border: "border-rose-600"    },
  { bg: "bg-cyan-600",    text: "text-white", border: "border-cyan-700"    },
  { bg: "bg-orange-500",  text: "text-white", border: "border-orange-600"  },
  { bg: "bg-indigo-500",  text: "text-white", border: "border-indigo-600"  },
  { bg: "bg-teal-500",    text: "text-white", border: "border-teal-600"    },
  { bg: "bg-pink-500",    text: "text-white", border: "border-pink-600"    },
];

export function getEmployeeColor(profileId: string) {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) {
    hash = ((hash << 5) - hash + profileId.charCodeAt(i)) | 0;
  }
  return EMPLOYEE_COLORS[Math.abs(hash) % EMPLOYEE_COLORS.length];
}

export const PROJECT_COLORS = [
  { bg: "bg-blue-100",    text: "text-blue-900",    border: "border-blue-500",    fill: "#93c5fd" },
  { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-500", fill: "#6ee7b7" },
  { bg: "bg-amber-200",   text: "text-amber-900",   border: "border-amber-500",   fill: "#fcd34d" },
  { bg: "bg-violet-100",  text: "text-violet-900",  border: "border-violet-500",  fill: "#c4b5fd" },
  { bg: "bg-rose-100",    text: "text-rose-900",    border: "border-rose-500",    fill: "#fda4af" },
  { bg: "bg-cyan-100",    text: "text-cyan-900",    border: "border-cyan-500",    fill: "#67e8f9" },
  { bg: "bg-orange-100",  text: "text-orange-900",  border: "border-orange-500",  fill: "#fdba74" },
  { bg: "bg-indigo-100",  text: "text-indigo-900",  border: "border-indigo-500",  fill: "#a5b4fc" },
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
