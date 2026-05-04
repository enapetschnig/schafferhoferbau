import * as React from "react";
import { Input } from "@/components/ui/input";
import { snapTimeTo15 } from "@/lib/timeUtils";

// Time-Input der beim Verlassen automatisch auf 15-Minuten-Schritte snapt.
// step=900 zusaetzlich gesetzt, damit Browser mit nativer step-Validation
// (Desktop) ebenfalls greifen.
type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "step" | "onChange" | "value"
> & {
  value: string;
  onChange: (value: string) => void;
};

export const TimeInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, onBlur, ...rest }, ref) => {
    return (
      <Input
        ref={ref}
        type="time"
        step={900}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const snapped = snapTimeTo15(e.target.value);
          if (snapped !== e.target.value) onChange(snapped);
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  }
);
TimeInput.displayName = "TimeInput";
