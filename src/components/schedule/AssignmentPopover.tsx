import { useState, useEffect } from "react";
import { format, startOfISOWeek } from "date-fns";
import { de } from "date-fns/locale";
import { Trash2, AlertTriangle, Truck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Profile, Project, Assignment, CompanyHoliday } from "./scheduleTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
  date: Date | null;
  days?: Date[];
  assignment: Assignment | null;
  existingAssignments?: Assignment[];
  projects: Project[];
  holidays?: CompanyHoliday[];
  onAssign: (userId: string, date: Date, projectId: string, notizen?: string, transportErforderlich?: boolean) => void;
  onRemove: (userId: string, date: Date, assignmentId?: string) => void;
}

export function AssignmentPopover({
  open,
  onOpenChange,
  profile,
  date,
  days,
  assignment,
  existingAssignments = [],
  projects,
  holidays = [],
  onAssign,
  onRemove,
}: Props) {
  const [selectedProject, setSelectedProject] = useState(assignment?.project_id || "");
  const [notizen, setNotizen] = useState(assignment?.notizen || "");
  const [transportErforderlich, setTransportErforderlich] = useState(!!assignment?.transport_erforderlich);
  // User-spezifische Ziele (worker_goals)
  const [tagesziel, setTagesziel] = useState("");
  const [wochenziel, setWochenziel] = useState("");
  const [savingGoals, setSavingGoals] = useState(false);

  const isRangeMode = days && days.length > 1;

  useEffect(() => {
    setSelectedProject(assignment?.project_id || "");
    setNotizen(assignment?.notizen || "");
    setTransportErforderlich(!!assignment?.transport_erforderlich);
  }, [assignment, open]);

  // Bestehende Tages-/Wochenziele laden
  useEffect(() => {
    if (!open || !profile || !date || isRangeMode) {
      if (!isRangeMode) { setTagesziel(""); setWochenziel(""); }
      return;
    }
    const datumStr = format(date, "yyyy-MM-dd");
    const weekStartStr = format(startOfISOWeek(date), "yyyy-MM-dd");
    (async () => {
      const [{ data: dayGoal }, { data: weekGoal }] = await Promise.all([
        (supabase.from("worker_goals") as any)
          .select("ziel")
          .eq("user_id", profile.id)
          .eq("scope", "day")
          .eq("datum", datumStr)
          .maybeSingle(),
        (supabase.from("worker_goals") as any)
          .select("ziel")
          .eq("user_id", profile.id)
          .eq("scope", "week")
          .eq("week_start", weekStartStr)
          .maybeSingle(),
      ]);
      setTagesziel((dayGoal as any)?.ziel || "");
      setWochenziel((weekGoal as any)?.ziel || "");
    })();
  }, [open, profile, date, isRangeMode]);

  const persistGoals = async () => {
    if (!profile || !date || isRangeMode) return;
    setSavingGoals(true);
    const datumStr = format(date, "yyyy-MM-dd");
    const weekStartStr = format(startOfISOWeek(date), "yyyy-MM-dd");
    const { data: { user } } = await supabase.auth.getUser();
    const createdBy = user?.id || null;

    // Tagesziel
    if (tagesziel.trim()) {
      await (supabase.from("worker_goals") as any).upsert(
        { user_id: profile.id, scope: "day", datum: datumStr, week_start: null, ziel: tagesziel.trim(), created_by: createdBy, updated_at: new Date().toISOString() },
        { onConflict: "user_id,datum", ignoreDuplicates: false }
      );
    } else {
      await (supabase.from("worker_goals") as any)
        .delete()
        .eq("user_id", profile.id)
        .eq("scope", "day")
        .eq("datum", datumStr);
    }

    // Wochenziel
    if (wochenziel.trim()) {
      await (supabase.from("worker_goals") as any).upsert(
        { user_id: profile.id, scope: "week", datum: null, week_start: weekStartStr, ziel: wochenziel.trim(), created_by: createdBy, updated_at: new Date().toISOString() },
        { onConflict: "user_id,week_start", ignoreDuplicates: false }
      );
    } else {
      await (supabase.from("worker_goals") as any)
        .delete()
        .eq("user_id", profile.id)
        .eq("scope", "week")
        .eq("week_start", weekStartStr);
    }
    setSavingGoals(false);
  };

  if (!profile || !date) return null;

  const handleSave = async () => {
    if (!selectedProject) return;
    if (isRangeMode) {
      for (const d of days) {
        onAssign(profile.id, d, selectedProject, notizen || undefined, transportErforderlich);
      }
    } else {
      onAssign(profile.id, date, selectedProject, notizen || undefined, transportErforderlich);
      // Tages-/Wochenziel parallel persistieren (nur Single-Day-Modus)
      await persistGoals();
    }
    onOpenChange(false);
  };

  const dateLabel = isRangeMode
    ? `${days.length} Tage: ${format(days[0], "EE dd.MM.", { locale: de })} – ${format(days[days.length - 1], "EE dd.MM.", { locale: de })}`
    : format(date, "EEEE, dd. MMMM yyyy", { locale: de });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {profile.vorname} {profile.nachname}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* BU/Feiertag Hinweis */}
          {!isRangeMode && holidays.some(h => h.datum === format(date, "yyyy-MM-dd")) && (
            <div className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                Dieser Tag ist als <strong>{holidays.find(h => h.datum === format(date, "yyyy-MM-dd"))?.bezeichnung || "Betriebsurlaub/Feiertag"}</strong> eingetragen. Planung ist trotzdem möglich.
              </span>
            </div>
          )}

          {/* Bestehende Zuordnungen */}
          {existingAssignments.length > 0 && !isRangeMode && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Bestehende Zuordnungen:</p>
              {existingAssignments.map((a) => {
                const proj = projects.find(p => p.id === a.project_id);
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/50 text-sm">
                    <Badge variant="secondary" className="text-xs">{proj?.name || "–"}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => {
                        onRemove(profile.id, date, a.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Projekt hinzufügen..." />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            placeholder="Notiz für den Mitarbeiter (optional)..."
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />

          {/* Transport-Flag */}
          <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30 transition-colors">
            <Checkbox
              checked={transportErforderlich}
              onCheckedChange={(v) => setTransportErforderlich(!!v)}
            />
            <Truck className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-normal cursor-pointer flex-1">Transport erforderlich</Label>
          </label>

          {/* User-spezifische Ziele — nur im Single-Day-Modus */}
          {!isRangeMode && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                Ziele für {profile.vorname}
              </div>
              <div>
                <Label className="text-xs">Tagesziel</Label>
                <Textarea
                  placeholder="z.B. Außenmauer fertig betonieren"
                  value={tagesziel}
                  onChange={(e) => setTagesziel(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
              <div>
                <Label className="text-xs">Wochenziel</Label>
                <Textarea
                  placeholder="z.B. Rohbau OG fertigstellen"
                  value={wochenziel}
                  onChange={(e) => setWochenziel(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!selectedProject}
          >
            {isRangeMode ? `${days.length} Tage zuweisen` : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
