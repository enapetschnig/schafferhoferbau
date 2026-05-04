import * as React from "react";
import { cn } from "@/lib/utils";
import { snapTimeTo15 } from "@/lib/timeUtils";

// Single-Select-Time-Input mit harten 15-Min-Schritten.
// Optik wie der bisherige <Input type="time">, aber Liste enthaelt nur
// 00:00 / 00:15 / 00:30 / ... / 23:45 (96 Eintraege).
// Auf iOS oeffnet sich der native Wheel-Picker, auf Android ein scrollbares
// Material-Dropdown, am Desktop das native Select-Dropdown mit Type-Ahead.
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

const TIMES: string[] = (() => {
  const arr: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ["00", "15", "30", "45"]) {
      arr.push(`${String(h).padStart(2, "0")}:${m}`);
    }
  }
  return arr;
})();

export function TimeInput({
  value,
  onChange,
  disabled,
  required,
  className,
  title,
  id,
}: Props) {
  // Bestehende DB-Werte mit krummen Minuten (z.B. 08:07) auf naechsten
  // 15-Min-Schritt runden, damit das Dropdown immer einen gueltigen
  // Wert anzeigen kann.
  const snapped = snapTimeTo15(value);
  const displayValue = TIMES.includes(snapped) ? snapped : "";

  const baseClasses =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
    "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <select
      id={id}
      value={displayValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required}
      title={title}
      className={cn(baseClasses, className)}
    >
      <option value="">--:--</option>
      {TIMES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
