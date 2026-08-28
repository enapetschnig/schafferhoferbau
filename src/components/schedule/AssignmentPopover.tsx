import { useState, useEffect } from "react";
import { format, startOfISOWeek } from "date-fns";
import { de } from "date-fns/locale";
import { Trash2, AlertTriangle, Truck, Target, Users, ChevronDown, ChevronUp } from "lucide-react";
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
  /** Alle sichtbaren Mitarbeiter - fuer "weitere Mitarbeiter mit einteilen" */
  allProfiles?: Profile[];
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
  allProfiles = [],
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
  // Weitere Mitarbeiter, die dieselbe Einteilung bekommen sollen
  const [weitereUserIds, setWeitereUserIds] = useState<string[]>([]);
  const [weitereOffen, setWeitereOffen] = useState(false);

  const isRangeMode = days && days.length > 1;

  useEffect(() => {
    setSelectedProject(assignment?.project_id || "");
    setNotizen(assignment?.notizen || "");
    setTransportErforderlich(!!assignment?.transport_erforderlich);
    // Auswahl beim Oeffnen zuruecksetzen - sonst schleppt sie sich zum
    // naechsten Mitarbeiter mit
    setWeitereUserIds([]);
  }, [assignment, open]);

  // Bestehende Tages-/Wochenziele laden (nur im Single-Day-Modus)
  useEffect(() => {
    if (!open || !profile || !date) return;
    if (isRangeMode) {
      // Range: Felder leer beim Oeffnen, da uneinheitlich ueber mehrere Tage
      setTagesziel("");
      setWochenziel("");
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

  /**
   * Ziele speichern.
   *
   * @param userId Fuer wen
   * @param darfLoeschen Nur beim urspruenglich angeklickten Mitarbeiter darf ein
   *   leeres Feld ein bestehendes Ziel loeschen. Bei zusaetzlich ausgewaehlten
   *   Mitarbeitern wuerde das sonst deren Ziele ungefragt mitloeschen.
   */
  const persistGoalsFor = async (userId: string, darfLoeschen: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    const createdBy = user?.id || null;
    const nowIso = new Date().toISOString();
    const profile = { id: userId };

    if (isRangeMode && days) {
      // Range-Mode: nur Upsert, kein Delete (leere Felder lassen bestehende Ziele unberuehrt)
      const tagesTrim = tagesziel.trim();
      const wochenTrim = wochenziel.trim();
      const weekStarts = new Set<string>(
        days.map((d) => format(startOfISOWeek(d), "yyyy-MM-dd"))
      );

      if (tagesTrim) {
        for (const d of days) {
          const datumStr = format(d, "yyyy-MM-dd");
          await (supabase.from("worker_goals") as any).upsert(
            { user_id: profile.id, scope: "day", datum: datumStr, week_start: null, ziel: tagesTrim, created_by: createdBy, updated_at: nowIso },
            { onConflict: "user_id,datum", ignoreDuplicates: false }
          );
        }
      }

      if (wochenTrim) {
        for (const ws of weekStarts) {
          await (supabase.from("worker_goals") as any).upsert(
            { user_id: profile.id, scope: "week", datum: null, week_start: ws, ziel: wochenTrim, created_by: createdBy, updated_at: nowIso },
            { onConflict: "user_id,week_start", ignoreDuplicates: false }
          );
        }
      }
    } else if (date) {
      // Single-Day-Modus: leeres Feld loescht das bestehende Ziel
      const datumStr = format(date, "yyyy-MM-dd");
      const weekStartStr = format(startOfISOWeek(date), "yyyy-MM-dd");

      // Tagesziel
      if (tagesziel.trim()) {
        await (supabase.from("worker_goals") as any).upsert(
          { user_id: profile.id, scope: "day", datum: datumStr, week_start: null, ziel: tagesziel.trim(), created_by: createdBy, updated_at: nowIso },
          { onConflict: "user_id,datum", ignoreDuplicates: false }
        );
      } else if (darfLoeschen) {
        await (supabase.from("worker_goals") as any)
          .delete()
          .eq("user_id", profile.id)
          .eq("scope", "day")
          .eq("datum", datumStr);
      }

      // Wochenziel
      if (wochenziel.trim()) {
        await (supabase.from("worker_goals") as any).upsert(
          { user_id: profile.id, scope: "week", datum: null, week_start: weekStartStr, ziel: wochenziel.trim(), created_by: createdBy, updated_at: nowIso },
          { onConflict: "user_id,week_start", ignoreDuplicates: false }
        );
      } else if (darfLoeschen) {
        await (supabase.from("worker_goals") as any)
          .delete()
          .eq("user_id", profile.id)
          .eq("scope", "week")
          .eq("week_start", weekStartStr);
      }
    }
  };

  if (!profile || !date) return null;

  const handleSave = async () => {
    if (!selectedProject) return;
    setSavingGoals(true);

    // Der angeklickte Mitarbeiter zuerst, danach die mitausgewaehlten -
    // alle bekommen dieselbe Einteilung
    const alleUserIds = [profile.id, ...weitereUserIds];

    for (const userId of alleUserIds) {
      if (isRangeMode && days) {
        for (const d of days) {
          onAssign(userId, d, selectedProject, notizen || undefined, transportErforderlich);
        }
      } else if (date) {
        onAssign(userId, date, selectedProject, notizen || undefined, transportErforderlich);
      }
      // Leere Zielfelder duerfen nur beim angeklickten Mitarbeiter loeschen
      await persistGoalsFor(userId, userId === profile.id);
    }

    setSavingGoals(false);
    setWeitereUserIds([]);
    onOpenChange(false);
  };

  // Alle ausser dem gerade angeklickten Mitarbeiter
  const andereProfiles = allProfiles.filter((p) => p.id !== profile.id);

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

          {/* Weitere Mitarbeiter gleich mit einteilen - erspart das einzelne
              Hineinziehen in die Plantafel */}
          {andereProfiles.length > 0 && (
            <div className="rounded-md border">
              <button
                type="button"
                onClick={() => setWeitereOffen((v) => !v)}
                className="flex items-center justify-between w-full gap-2 p-2 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Weitere Mitarbeiter mit einteilen
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {weitereUserIds.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {weitereUserIds.length}
                    </Badge>
                  )}
                  {weitereOffen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>
              {weitereOffen && (
                <div className="border-t p-2 space-y-1 max-h-44 overflow-y-auto">
                  <div className="flex gap-2 pb-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setWeitereUserIds(
                          weitereUserIds.length === andereProfiles.length
                            ? []
                            : andereProfiles.map((p) => p.id)
                        )
                      }
                    >
                      {weitereUserIds.length === andereProfiles.length
                        ? "Auswahl leeren"
                        : "Alle auswählen"}
                    </Button>
                  </div>
                  {andereProfiles.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer"
                    >
                      <Checkbox
                        checked={weitereUserIds.includes(p.id)}
                        onCheckedChange={(v) =>
                          setWeitereUserIds((prev) =>
                            v === true ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                          )
                        }
                      />
                      <span className="text-sm">
                        {p.vorname} {p.nachname}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

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

          {/* User-spezifische Ziele */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Ziele für {profile.vorname}
            </div>
            <div>
              <Label className="text-xs">
                {isRangeMode ? "Tagesziel (für alle ausgewählten Tage)" : "Tagesziel"}
              </Label>
              <Textarea
                placeholder="z.B. Außenmauer fertig betonieren"
                value={tagesziel}
                onChange={(e) => setTagesziel(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
            <div>
              <Label className="text-xs">
                {isRangeMode ? "Wochenziel (für die betroffenen Kalenderwochen)" : "Wochenziel"}
              </Label>
              <Textarea
                placeholder="z.B. Rohbau OG fertigstellen"
                value={wochenziel}
                onChange={(e) => setWochenziel(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
            {isRangeMode && (
              <p className="text-[10px] text-muted-foreground">
                Hinweis: Leere Felder bleiben unverändert (überschreiben kein bestehendes Ziel).
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!selectedProject || savingGoals}
          >
            {savingGoals
              ? "Speichern..."
              : (() => {
                  const anzahlMA = 1 + weitereUserIds.length;
                  const maTeil = anzahlMA > 1 ? ` · ${anzahlMA} Mitarbeiter` : "";
                  return isRangeMode && days
                    ? `${days.length} Tage zuweisen${maTeil}`
                    : `Speichern${maTeil}`;
                })()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
