import { useRef, useState, useEffect } from "react";
import { format, parseISO, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VoiceAIInput } from "@/components/VoiceAIInput";
import type {
  Project,
  Assignment,
  Profile,
  DailyTarget,
} from "./scheduleTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  datum: string | null;
  profiles: Profile[];
  assignments: Assignment[];
  dailyTarget: DailyTarget | null;
  onUpdateTarget: (
    projectId: string,
    datum: string,
    field: keyof DailyTarget,
    value: string | number | null
  ) => void;
}

export function DayDetailSheet({
  open,
  onOpenChange,
  project,
  datum,
  profiles,
  assignments,
  dailyTarget,
  onUpdateTarget,
}: Props) {
  const { toast } = useToast();
  const [transportErforderlich, setTransportErforderlich] = useState(false);
  const [transportNotiz, setTransportNotiz] = useState("");
  const [transportId, setTransportId] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !datum) return;
    (async () => {
      const { data } = await supabase
        .from("project_day_transport")
        .select("id, erforderlich, notiz")
        .eq("project_id", project.id)
        .eq("datum", datum)
        .maybeSingle();
      if (data) {
        setTransportErforderlich(!!data.erforderlich);
        setTransportNotiz(data.notiz || "");
        setTransportId(data.id);
      } else {
        setTransportErforderlich(false);
        setTransportNotiz("");
        setTransportId(null);
      }
    })();
  }, [project?.id, datum]);

  const saveTransport = async (erforderlich: boolean, notiz: string) => {
    if (!project || !datum) return;
    const payload: any = {
      project_id: project.id,
      datum,
      erforderlich,
      notiz: notiz.trim() || null,
    };
    if (transportId) {
      const { error } = await supabase.from("project_day_transport").update(payload).eq("id", transportId);
      if (error) toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      const { data, error } = await supabase.from("project_day_transport").insert(payload).select("id").single();
      if (error) toast({ variant: "destructive", title: "Fehler", description: error.message });
      else if (data) setTransportId((data as any).id);
    }
  };

  if (!project || !datum) return null;

  const dateParsed = parseISO(datum);
  const dayAssignments = assignments.filter(
    (a) =>
      a.project_id === project.id && isSameDay(parseISO(a.datum), dateParsed)
  );

  const assignedProfiles = profiles.filter((p) =>
    dayAssignments.some((a) => a.user_id === p.id)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">{project.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {format(dateParsed, "EEEE, dd. MMMM yyyy", { locale: de })}
          </p>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Assigned workers */}
          <div>
            <h3 className="text-sm font-semibold mb-2">
              Eingeteilte Mitarbeiter ({assignedProfiles.length})
            </h3>
            {assignedProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Mitarbeiter eingeteilt
              </p>
            ) : (
              <div className="space-y-1">
                {assignedProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="text-sm px-2 py-1.5 bg-muted/30 rounded"
                  >
                    {p.vorname} {p.nachname}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tagesziel */}
          <div>
            <label className="text-sm font-semibold mb-1 block">
              Tagesziel
            </label>
            <VoiceAIInput
              multiline
              rows={2}
              context="tagesbericht"
              value={dailyTarget?.tagesziel || ""}
              onChange={(v) =>
                onUpdateTarget(project.id, datum, "tagesziel", v || null)
              }
              placeholder="Was soll heute erreicht werden?"
            />
          </div>

          {/* Nachkalkulation */}
          <div>
            <label className="text-sm font-semibold mb-1 block">
              Nachkalkulation (Stunden)
            </label>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="0"
              value={dailyTarget?.nachkalkulation_stunden ?? ""}
              onChange={(e) =>
                onUpdateTarget(
                  project.id,
                  datum,
                  "nachkalkulation_stunden",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
            />
          </div>

          {/* Transport */}
          <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={transportErforderlich}
                onCheckedChange={(v) => {
                  const next = !!v;
                  setTransportErforderlich(next);
                  saveTransport(next, transportNotiz);
                }}
              />
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Transport erforderlich</span>
            </label>
            {transportErforderlich && (
              <Input
                className="h-9 text-sm"
                placeholder="Notiz (z.B. Stahl liefern, LKW 7:00)"
                value={transportNotiz}
                onChange={(e) => setTransportNotiz(e.target.value)}
                onBlur={() => saveTransport(transportErforderlich, transportNotiz)}
              />
            )}
          </div>

          {/* Notizen */}
          <div>
            <label className="text-sm font-semibold mb-1 block">Notizen</label>
            <VoiceAIInput
              multiline
              rows={2}
              context="notiz"
              value={dailyTarget?.notizen || ""}
              onChange={(v) =>
                onUpdateTarget(project.id, datum, "notizen", v || null)
              }
              placeholder="Anmerkungen zum Tag..."
            />
          </div>

          {/* Hinweis: Ressourcen werden in der Wochen-Plantafel direkt per Drag-Select zugewiesen */}
          <p className="text-xs text-muted-foreground">
            Ressourcen werden in der Plantafel zugewiesen (Drag-Select über mehrere Tage in der Ressourcen-Sektion).
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
