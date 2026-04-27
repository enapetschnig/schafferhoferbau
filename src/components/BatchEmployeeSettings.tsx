import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SCHEDULE, LEHRLING_SCHEDULE, type WeekSchedule, type DaySchedule, type Schwellenwert } from "@/lib/workingHours";

type EmployeeLite = {
  id: string;
  user_id?: string | null;
  vorname: string | null;
  nachname: string | null;
  /** App-Rolle aus user_roles: administrator | vorarbeiter | mitarbeiter | extern */
  app_role?: string | null;
};

const APP_ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  vorarbeiter: "Vorarbeiter",
  mitarbeiter: "Mitarbeiter",
  extern: "Extern",
};

const DAY_KEYS = ["mo", "di", "mi", "do", "fr", "sa", "so"] as const;
type DayKey = (typeof DAY_KEYS)[number];
const DAY_LABELS: Record<DayKey, string> = {
  mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr", sa: "Sa", so: "So",
};

const DEFAULT_SCHWELLENWERT: Record<DayKey, number> = {
  mo: 10, di: 10, mi: 9.5, do: 9.5, fr: 0, sa: 0, so: 0,
};

interface Props {
  employees: EmployeeLite[];
  onSaved?: () => void;
}

function emptyDay(): DaySchedule {
  return { start: null, end: null, pause: 0, hours: 0 };
}
function copyWeek(src: WeekSchedule): Record<DayKey, DaySchedule> {
  const out = {} as Record<DayKey, DaySchedule>;
  DAY_KEYS.forEach((k) => { out[k] = { ...(src[k] || emptyDay()) }; });
  return out;
}
function defaultAnker(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7; // Mo=0
  d.setDate(d.getDate() - diff);
  return d.toISOString().split("T")[0];
}

export function BatchEmployeeSettings({ employees, onSaved }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // === Regelarbeitszeit-State ===
  const [applyRegelarbeitszeit, setApplyRegelarbeitszeit] = useState(true);
  const [scheduleBiweekly, setScheduleBiweekly] = useState(false);
  const [scheduleAnker, setScheduleAnker] = useState<string>(defaultAnker());
  const [scheduleA, setScheduleA] = useState<Record<DayKey, DaySchedule>>(copyWeek(DEFAULT_SCHEDULE));
  const [scheduleB, setScheduleB] = useState<Record<DayKey, DaySchedule>>(copyWeek(DEFAULT_SCHEDULE));

  // === Schwellenwert-State ===
  const [applySchwellenwert, setApplySchwellenwert] = useState(true);
  const [swBiweekly, setSwBiweekly] = useState(false);
  const [swAnker, setSwAnker] = useState<string>(defaultAnker());
  const [swA, setSwA] = useState<Record<DayKey, number>>({ ...DEFAULT_SCHWELLENWERT });
  const [swB, setSwB] = useState<Record<DayKey, number>>({ ...DEFAULT_SCHWELLENWERT });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === employees.length) setSelected(new Set());
    else setSelected(new Set(employees.map((e) => e.id)));
  };

  const selectByRole = (role: string) => {
    setSelected(new Set(employees.filter((e) => e.app_role === role).map((e) => e.id)));
  };

  const presetSchedule = (preset: WeekSchedule) => {
    setScheduleA(copyWeek(preset));
    setScheduleB(copyWeek(preset));
  };

  const apply = async () => {
    if (selected.size === 0) {
      toast({ variant: "destructive", title: "Niemand ausgewählt" });
      return;
    }
    if (!applyRegelarbeitszeit && !applySchwellenwert) {
      toast({ variant: "destructive", title: "Nichts zu ändern" });
      return;
    }
    setSaving(true);

    // Pro Mitarbeiter aktuellen Datensatz laden + mergen, damit individuelle Felder erhalten bleiben.
    const ids = [...selected];
    const { data: existing } = await supabase
      .from("employees")
      .select("id, regelarbeitszeit, schwellenwert")
      .in("id", ids);
    const map = new Map<string, { regelarbeitszeit: any; schwellenwert: any }>();
    (existing || []).forEach((e: any) => map.set(e.id, { regelarbeitszeit: e.regelarbeitszeit, schwellenwert: e.schwellenwert }));

    // Neue Regelarbeitszeit-Konfiguration aus Form bauen
    const newSchedule: any = { ...scheduleA };
    if (scheduleBiweekly) {
      newSchedule.zyklus = "biweekly";
      newSchedule.woche_b = scheduleB;
      newSchedule.zyklus_anker = scheduleAnker;
    }
    // Wochensoll = Summe aus Woche A
    const sollA = (Object.values(scheduleA) as DaySchedule[]).reduce(
      (s, d) => s + (d?.hours ?? 0),
      0
    );

    // Neue Schwellenwert-Konfiguration
    const newSchwellenwert: any = { ...swA };
    if (swBiweekly) {
      newSchwellenwert.zyklus = "biweekly";
      newSchwellenwert.woche_b = swB;
      newSchwellenwert.zyklus_anker = swAnker;
    }

    const errors: string[] = [];
    for (const id of ids) {
      const update: Record<string, any> = {};

      if (applyRegelarbeitszeit) {
        update.regelarbeitszeit = newSchedule;
        update.wochen_soll_stunden = sollA;
      }

      if (applySchwellenwert) {
        update.schwellenwert = newSchwellenwert;
      }

      const { error } = await supabase.from("employees").update(update).eq("id", id);
      if (error) errors.push(`${id}: ${error.message}`);
    }

    setSaving(false);
    if (errors.length > 0) {
      toast({ variant: "destructive", title: `${errors.length} Fehler`, description: errors.slice(0, 3).join(" · ") });
      return;
    }
    toast({ title: `${selected.size} Mitarbeiter aktualisiert` });
    setOpen(false);
    onSaved?.();
  };

  // Helper: Tag in einer Wochen-State updaten
  const updateScheduleDay = (
    week: "A" | "B",
    day: DayKey,
    field: keyof DaySchedule,
    val: any
  ) => {
    const setter = week === "A" ? setScheduleA : setScheduleB;
    const cur = week === "A" ? scheduleA : scheduleB;
    const updated = { ...cur, [day]: { ...cur[day], [field]: val } };
    // Pause-Minuten automatisch berechnen, wenn Start+Ende gesetzt sind
    if (field === "pause_start" || field === "pause_end") {
      const d = updated[day];
      if (d.pause_start && d.pause_end) {
        const [sh, sm] = d.pause_start.split(":").map(Number);
        const [eh, em] = d.pause_end.split(":").map(Number);
        const min = (eh * 60 + em) - (sh * 60 + sm);
        if (min > 0) updated[day] = { ...d, pause: min };
      }
    }
    setter(updated);
  };

  const renderScheduleGrid = (week: "A" | "B") => {
    const data = week === "A" ? scheduleA : scheduleB;
    return (
      <div className="grid grid-cols-7 gap-2">
        {DAY_KEYS.map((day) => (
          <div key={day} className="space-y-1">
            <Label className="text-xs text-center block font-bold">{DAY_LABELS[day]}</Label>
            <Input
              type="time"
              value={data[day]?.start || ""}
              disabled={!applyRegelarbeitszeit}
              onChange={(e) => updateScheduleDay(week, day, "start", e.target.value || null)}
              className="text-xs h-8 px-1"
              placeholder="Start"
              title="Beginn"
            />
            <Input
              type="time"
              value={data[day]?.end || ""}
              disabled={!applyRegelarbeitszeit}
              onChange={(e) => updateScheduleDay(week, day, "end", e.target.value || null)}
              className="text-xs h-8 px-1"
              placeholder="Ende"
              title="Ende"
            />
            <Input
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={data[day]?.hours ?? 0}
              disabled={!applyRegelarbeitszeit}
              onChange={(e) => updateScheduleDay(week, day, "hours", parseFloat(e.target.value) || 0)}
              className="text-xs h-8 px-1 text-center"
              placeholder="h"
              title="Stunden"
            />
            <Input
              type="time"
              value={(data[day] as any)?.pause_start || ""}
              disabled={!applyRegelarbeitszeit}
              onChange={(e) => updateScheduleDay(week, day, "pause_start" as any, e.target.value || null)}
              className="text-xs h-8 px-1"
              placeholder="P-Start"
              title="Pausen-Beginn"
            />
            <Input
              type="time"
              value={(data[day] as any)?.pause_end || ""}
              disabled={!applyRegelarbeitszeit}
              onChange={(e) => updateScheduleDay(week, day, "pause_end" as any, e.target.value || null)}
              className="text-xs h-8 px-1"
              placeholder="P-Ende"
              title="Pausen-Ende"
            />
            <Input
              type="number"
              min="0"
              max="120"
              step="5"
              value={data[day]?.pause ?? 0}
              disabled={!applyRegelarbeitszeit}
              onChange={(e) => updateScheduleDay(week, day, "pause", parseInt(e.target.value) || 0)}
              className="text-xs h-8 px-1 text-center"
              placeholder="min"
              title="Pausen-Minuten (auto bei Start+Ende)"
            />
          </div>
        ))}
      </div>
    );
  };

  const renderSchwellenwertGrid = (week: "A" | "B") => {
    const data = week === "A" ? swA : swB;
    const setter = week === "A" ? setSwA : setSwB;
    return (
      <div className="grid grid-cols-7 gap-2">
        {DAY_KEYS.map((day) => (
          <div key={day} className="text-center">
            <Label className="text-xs font-bold">{DAY_LABELS[day]}</Label>
            <Input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={data[day] ?? 0}
              disabled={!applySchwellenwert}
              onChange={(e) =>
                setter({
                  ...data,
                  [day]: parseFloat(e.target.value) || 0,
                })
              }
              className="text-center text-sm"
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4 mr-2" />
        Arbeitszeiten einstellen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Arbeitszeiten einstellen</DialogTitle>
            <DialogDescription>
              Setze Regelarbeitszeit und/oder Schwellenwert für mehrere Mitarbeiter gleichzeitig.
              Andere Felder (z.B. Bankverbindung) bleiben unverändert.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Mitarbeiter-Auswahl */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Mitarbeiter auswählen ({selected.size}/{employees.length})</CardTitle>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={selectAll}>
                      {selected.size === employees.length ? "Keine" : "Alle"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => selectByRole("administrator")}>Administratoren</Button>
                    <Button size="sm" variant="outline" onClick={() => selectByRole("vorarbeiter")}>Vorarbeiter</Button>
                    <Button size="sm" variant="outline" onClick={() => selectByRole("mitarbeiter")}>Mitarbeiter</Button>
                    <Button size="sm" variant="outline" onClick={() => selectByRole("extern")}>Externe</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-56 overflow-y-auto">
                  {employees.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selected.has(emp.id)}
                        onCheckedChange={() => toggle(emp.id)}
                      />
                      <span className="text-sm">
                        {emp.vorname || ""} {emp.nachname || ""}
                      </span>
                      {emp.app_role && (
                        <span className="text-xs text-muted-foreground">({APP_ROLE_LABELS[emp.app_role] || emp.app_role})</span>
                      )}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Regelarbeitszeit */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={applyRegelarbeitszeit}
                      onCheckedChange={(v) => setApplyRegelarbeitszeit(!!v)}
                    />
                    <CardTitle className="text-base">Regelarbeitszeit</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => presetSchedule(DEFAULT_SCHEDULE)}>
                      Facharbeiter (39h)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => presetSchedule(LEHRLING_SCHEDULE)}>
                      Lehrling
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  Wochensoll (A): {(Object.values(scheduleA) as DaySchedule[]).reduce((s, d) => s + (d?.hours ?? 0), 0).toFixed(1)}h
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30">
                  <Checkbox
                    checked={scheduleBiweekly}
                    disabled={!applyRegelarbeitszeit}
                    onCheckedChange={(v) => setScheduleBiweekly(!!v)}
                  />
                  <span className="text-sm">14-tägige Durchrechnung (kurze / lange Woche im Wechsel)</span>
                </label>

                {scheduleBiweekly && applyRegelarbeitszeit && (
                  <div className="flex items-center gap-3">
                    <Label className="text-sm whitespace-nowrap">Anker (Mo der ersten Kurze-Woche-Periode):</Label>
                    <Input
                      type="date"
                      value={scheduleAnker}
                      onChange={(e) => setScheduleAnker(e.target.value)}
                      className="h-9 w-44"
                    />
                  </div>
                )}

                {scheduleBiweekly ? (
                  <Tabs defaultValue="A">
                    <TabsList>
                      <TabsTrigger value="A">Kurze Woche (A)</TabsTrigger>
                      <TabsTrigger value="B">Lange Woche (B)</TabsTrigger>
                    </TabsList>
                    <TabsContent value="A" className="pt-3">{renderScheduleGrid("A")}</TabsContent>
                    <TabsContent value="B" className="pt-3">{renderScheduleGrid("B")}</TabsContent>
                  </Tabs>
                ) : (
                  renderScheduleGrid("A")
                )}

                <p className="text-xs text-muted-foreground">
                  Pro Tag: Beginn / Ende / Stunden / Pausen-Beginn / Pausen-Ende / Pausen-Minuten. Pausen-Minuten werden automatisch berechnet, wenn Start und Ende gesetzt sind.
                </p>
              </CardContent>
            </Card>

            {/* Schwellenwert */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={applySchwellenwert}
                    onCheckedChange={(v) => setApplySchwellenwert(!!v)}
                  />
                  <CardTitle className="text-base">Schwellenwert (Tagesgrenze für Zeitausgleich)</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Stunden bis zum Schwellenwert = Lohnstunden, alles darüber = Zeitausgleich.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30">
                  <Checkbox
                    checked={swBiweekly}
                    disabled={!applySchwellenwert}
                    onCheckedChange={(v) => setSwBiweekly(!!v)}
                  />
                  <span className="text-sm">14-tägige Durchrechnung (kurze / lange Woche im Wechsel)</span>
                </label>

                {swBiweekly && applySchwellenwert && (
                  <div className="flex items-center gap-3">
                    <Label className="text-sm whitespace-nowrap">Anker (Mo der ersten Kurze-Woche-Periode):</Label>
                    <Input
                      type="date"
                      value={swAnker}
                      onChange={(e) => setSwAnker(e.target.value)}
                      className="h-9 w-44"
                    />
                  </div>
                )}

                {swBiweekly ? (
                  <Tabs defaultValue="A">
                    <TabsList>
                      <TabsTrigger value="A">Kurze Woche (A)</TabsTrigger>
                      <TabsTrigger value="B">Lange Woche (B)</TabsTrigger>
                    </TabsList>
                    <TabsContent value="A" className="pt-3">{renderSchwellenwertGrid("A")}</TabsContent>
                    <TabsContent value="B" className="pt-3">{renderSchwellenwertGrid("B")}</TabsContent>
                  </Tabs>
                ) : (
                  renderSchwellenwertGrid("A")
                )}
              </CardContent>
            </Card>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button onClick={apply} disabled={saving || selected.size === 0}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Auf {selected.size} Mitarbeiter anwenden
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
