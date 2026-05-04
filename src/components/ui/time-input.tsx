import * as React from "react";
import { cn } from "@/lib/utils";
import { snapTimeTo15 } from "@/lib/timeUtils";

// Time-Picker mit harten 15-Min-Schritten: zwei Dropdowns (Stunden + Minuten).
// Minuten-Dropdown enthaelt nur 00/15/30/45, andere Werte sind nicht waehlbar.
// Bestehende DB-Werte mit "krummen" Minuten (z.B. 08:07) werden visuell auf
// den naechsten 15-Min-Schritt gerundet, damit das Dropdown immer einen
// gueltigen Wert zeigt.
type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  title?: string;
  id?: string;
  placeholder?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

export function TimeInput({
  value,
  onChange,
  disabled,
  required,
  className,
  title,
  id,
}: Props) {
  const snapped = snapTimeTo15(value);
  const m = snapped && /^\d{1,2}:\d{2}/.test(snapped) ? snapped.split(":") : ["", ""];
  const h = m[0] ? m[0].padStart(2, "0") : "";
  const min = m[1] || "";

  const setHour = (newH: string) => {
    if (!newH) {
      onChange("");
      return;
    }
    onChange(`${newH}:${min || "00"}`);
  };

  const setMin = (newM: string) => {
    if (!newM) {
      onChange(h ? `${h}:00` : "");
      return;
    }
    onChange(`${h || "00"}:${newM}`);
  };

  const baseSelectClasses =
    "h-10 rounded-md border border-input bg-background pl-2 pr-1 py-2 text-sm " +
    "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex items-center gap-1 w-full">
      <select
        id={id}
        value={h}
        onChange={(e) => setHour(e.target.value)}
        disabled={disabled}
        required={required}
        title={title}
        className={cn(baseSelectClasses, "flex-1 min-w-0", className)}
      >
        <option value="">--</option>
        {HOURS.map((hr) => (
          <option key={hr} value={hr}>{hr}</option>
        ))}
      </select>
      <span className="text-sm text-muted-foreground shrink-0">:</span>
      <select
        value={min}
        onChange={(e) => setMin(e.target.value)}
        disabled={disabled}
        required={required}
        className={cn(baseSelectClasses, "flex-1 min-w-0", className)}
      >
        <option value="">--</option>
        {MINUTES.map((mn) => (
          <option key={mn} value={mn}>{mn}</option>
        ))}
      </select>
    </div>
  );
}
