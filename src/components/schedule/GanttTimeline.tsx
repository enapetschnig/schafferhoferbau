import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { CompanyHoliday } from "./scheduleTypes";
import { isCompanyHoliday } from "./scheduleUtils";

interface Props {
  days: Date[];
  holidays: CompanyHoliday[];
}

export function GanttTimeline({ days, holidays }: Props) {
  return (
    <div
      className="grid border-b sticky top-0 z-20 bg-card"
      style={{
        gridTemplateColumns: `minmax(140px, 200px) repeat(${days.length}, minmax(40px, 1fr))`,
      }}
    >
      <div className="p-2 border-r font-medium text-sm sticky left-0 bg-card z-30" />
      {days.map((day) => {
        const holiday = isCompanyHoliday(holidays, day);
        const dow = day.getDay(); // 0=So, 6=Sa
        const isWeekend = dow === 0 || dow === 6;
        return (
          <div
            key={day.toISOString()}
            className={`p-1.5 text-center border-r text-xs ${
              holiday ? "bg-gray-200 text-gray-500" : isWeekend ? "bg-muted/40" : ""
            }`}
          >
            <div className={`font-medium ${isWeekend && !holiday ? "text-muted-foreground" : ""}`}>
              {format(day, "EEE", { locale: de })}
            </div>
            <div className="text-muted-foreground">
              {format(day, "dd.MM.")}
            </div>
            {holiday && (
              <div className="text-[10px] text-gray-400 truncate">
                {holiday.bezeichnung || "Feiertag"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
