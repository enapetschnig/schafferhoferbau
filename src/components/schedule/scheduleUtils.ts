import { isSameDay, isWithinInterval, parseISO } from "date-fns";
import type { Assignment, LeaveRequest, CompanyHoliday } from "./scheduleTypes";

export const EMPLOYEE_COLORS = [
  { bg: "bg-slate-600",   text: "text-white", border: "border-slate-700"   },
  { bg: "bg-blue-700",    text: "text-white", border: "border-blue-800"    },
  { bg: "bg-teal-700",    text: "text-white", border: "border-teal-800"    },
  { bg: "bg-stone-600",   text: "text-white", border: "border-stone-700"   },
  { bg: "bg-cyan-700",    text: "text-white", border: "border-cyan-800"    },
  { bg: "bg-indigo-700",  text: "text-white", border: "border-indigo-800"  },
  { bg: "bg-emerald-700", text: "text-white", border: "border-emerald-800" },
  { bg: "bg-zinc-600",    text: "text-white", border: "border-zinc-700"    },
  { bg: "bg-sky-700",     text: "text-white", border: "border-sky-800"     },
  { bg: "bg-violet-700",  text: "text-white", border: "border-violet-800"  },
];

export function getEmployeeColor(profileId: string) {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) {
    hash = ((hash << 5) - hash + profileId.charCodeAt(i)) | 0;
  }
  return EMPLOYEE_COLORS[Math.abs(hash) % EMPLOYEE_COLORS.length];
}

export const PROJECT_COLORS = [
  { bg: "bg-slate-100",   text: "text-slate-800",   border: "border-slate-400",   fill: "#cbd5e1" },
  { bg: "bg-blue-100",    text: "text-blue-900",    border: "border-blue-400",    fill: "#93c5fd" },
  { bg: "bg-teal-100",    text: "text-teal-900",    border: "border-teal-400",    fill: "#99f6e4" },
  { bg: "bg-stone-100",   text: "text-stone-800",   border: "border-stone-400",   fill: "#d6d3d1" },
  { bg: "bg-sky-100",     text: "text-sky-900",     border: "border-sky-400",     fill: "#bae6fd" },
  { bg: "bg-indigo-100",  text: "text-indigo-900",  border: "border-indigo-400",  fill: "#a5b4fc" },
  { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-400", fill: "#6ee7b7" },
  { bg: "bg-zinc-100",    text: "text-zinc-800",    border: "border-zinc-400",    fill: "#d4d4d8" },
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
