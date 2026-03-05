import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

type Project = {
  id: string;
  name: string;
  plz: string;
};

type ExistingEntry = {
  start_time: string;
  end_time: string;
  stunden: number;
};

interface FillRemainingHoursDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remainingHours: number;
  bookedHours: number;
  targetHours: number;
  projects: Project[];
  existingEntries: ExistingEntry[];
  onSubmit: (projectId: string | null, locationType: string, description: string, startTime: string, endTime: string, pauseMinutes: number, pauseStart: string | null, pauseEnd: string | null) => Promise<void>;
}

/**
 * Calculate free time blocks within the standard work day (08:00-17:00)
 * accounting for existing entries and the fixed pause 12:00-13:00.
 */
function calculateFreeBlocks(existingEntries: ExistingEntry[]): { start: number; end: number }[] {
  const DAY_START = 8 * 60;  // 08:00
  const DAY_END = 17 * 60;   // 17:00
  const PAUSE_START = 12 * 60; // 12:00
  const PAUSE_END = 13 * 60;   // 13:00

  // Collect all occupied intervals (existing entries + pause)
  const occupied: { start: number; end: number }[] = [];

  // Add existing entries
  for (const entry of existingEntries) {
    const [sh, sm] = entry.start_time.split(":").map(Number);
    const [eh, em] = entry.end_time.split(":").map(Number);
    occupied.push({ start: sh * 60 + sm, end: eh * 60 + em });
  }

  // Add pause block
  occupied.push({ start: PAUSE_START, end: PAUSE_END });

  // Sort by start time
  occupied.sort((a, b) => a.start - b.start);

  // Merge overlapping intervals
  const merged: { start: number; end: number }[] = [];
  for (const interval of occupied) {
    if (merged.length > 0 && interval.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  // Find free blocks between DAY_START and DAY_END
  const free: { start: number; end: number }[] = [];
  let cursor = DAY_START;

  for (const interval of merged) {
    if (interval.start > cursor) {
      free.push({ start: cursor, end: Math.min(interval.start, DAY_END) });
    }
    cursor = Math.max(cursor, interval.end);
  }

  if (cursor < DAY_END) {
    free.push({ start: cursor, end: DAY_END });
  }

  return free;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Pick enough free blocks to fill `remainingHours`, from earliest to latest.
 */
function pickBlocks(freeBlocks: { start: number; end: number }[], remainingMinutes: number): { start: string; end: string }[] {
  const result: { start: string; end: string }[] = [];
  let left = remainingMinutes;

  for (const block of freeBlocks) {
    if (left <= 0) break;
    const available = block.end - block.start;
    const use = Math.min(available, left);
    result.push({ start: minutesToTime(block.start), end: minutesToTime(block.start + use) });
    left -= use;
  }

  return result;
}

export const FillRemainingHoursDialog = ({
  open,
  onOpenChange,
  remainingHours,
  bookedHours,
  targetHours,
  projects,
  existingEntries,
  onSubmit,
}: FillRemainingHoursDialogProps) => {
  const [locationType, setLocationType] = useState<"baustelle" | "werkstatt">("werkstatt");
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const suggestedBlocks = useMemo(() => {
    const freeBlocks = calculateFreeBlocks(existingEntries);
    return pickBlocks(freeBlocks, Math.round(remainingHours * 60));
  }, [existingEntries, remainingHours]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setLocationType("werkstatt");
      setProjectId("");
      setDescription("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (suggestedBlocks.length === 0) return;
    setSubmitting(true);
    try {
      // Submit each block as a separate time entry
      for (const block of suggestedBlocks) {
        // Check if pause 12-13 falls within this block
        const [sh, sm] = block.start.split(":").map(Number);
        const [eh, em] = block.end.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        const hasPause = startMin < 12 * 60 && endMin > 13 * 60;

        await onSubmit(
          locationType === "werkstatt" ? null : (projectId || null),
          locationType,
          description,
          block.start,
          block.end,
          hasPause ? 60 : 0,
          hasPause ? "12:00" : null,
          hasPause ? "13:00" : null,
        );
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Reststunden auffüllen
          </DialogTitle>
          <DialogDescription>
            Fehlende Stunden automatisch buchen
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hours summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bereits gebucht:</span>
              <span className="font-medium">{bookedHours.toFixed(2)} h</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sollstunden:</span>
              <span className="font-medium">{targetHours.toFixed(2)} h</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="font-medium">Reststunden:</span>
              <Badge variant="secondary" className="text-lg font-bold px-3 py-1">
                {remainingHours.toFixed(2)} h
              </Badge>
            </div>
          </div>

          {/* Suggested time blocks */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Vorgeschlagene Zeitblöcke:</Label>
            {suggestedBlocks.map((block, i) => (
              <div key={i} className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Block {i + 1}:</span>
                  <span className="font-mono font-medium">{block.start} – {block.end}</span>
                </div>
              </div>
            ))}
            {suggestedBlocks.length === 0 && (
              <p className="text-sm text-muted-foreground">Kein freier Zeitraum verfügbar (08:00–17:00)</p>
            )}
          </div>

          {/* Location selection */}
          <div className="space-y-2">
            <Label>Arbeitsort</Label>
            <RadioGroup
              value={locationType}
              onValueChange={(value: "baustelle" | "werkstatt") => setLocationType(value)}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="baustelle" id="fill-baustelle" className="peer sr-only" />
                <Label
                  htmlFor="fill-baustelle"
                  className="flex h-12 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                >
                  Baustelle
                </Label>
              </div>
              <div>
                <RadioGroupItem value="werkstatt" id="fill-werkstatt" className="peer sr-only" />
                <Label
                  htmlFor="fill-werkstatt"
                  className="flex h-12 cursor-pointer items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent peer-data-[state=checked]:border-primary text-sm"
                >
                  Werkstatt
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Project selection - only for Baustelle */}
          {locationType === "baustelle" && (
            <div className="space-y-2">
              <Label>Projekt <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Projekt auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.plz})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label>Beschreibung <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="z.B. Werkstattarbeit, Aufräumen..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || suggestedBlocks.length === 0}
            >
              {submitting ? "Wird gebucht..." : "Reststunden buchen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
