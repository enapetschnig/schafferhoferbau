import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Users, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SCHEDULE, LEHRLING_SCHEDULE, type WeekSchedule } from "@/lib/workingHours";

type EmployeeLite = {
  id: string;
  vorname: string | null;
  nachname: string | null;
  kategorie?: string | null;
};

const DAY_KEYS = ["mo", "di", "mi", "do", "fr", "sa", "so"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr", sa: "Sa", so: "So",
};

interface Props {
  employees: EmployeeLite[];
  onSaved?: () => void;
}

export function BatchEmployeeSettings({ employees, onSaved }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyRegelarbeitszeit, setApplyRegelarbeitszeit] = useState(true);
  const [applySchwellenwert, setApplySchwellenwert] = useState(true);
  const [schedule, setSchedule] = useState<WeekSchedule>(DEFAULT_SCHEDULE);
  const [schwellenwert, setSchwellenwert] = useState<Record<string, number>>({
    mo: 10, di: 10, mi: 9.5, do: 9.5, fr: 0, sa: 0, so: 0,
  });

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

  const selectByKategorie = (kat: string) => {
    setSelected(new Set(employees.filter((e) => e.kategorie === kat).map((e) => e.id)));
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

    // Bestehende biweekly-Felder pro Mitarbeiter erhalten (nicht ueberschreiben).
    // Wir lesen erst die aktuellen Werte, mergen die batch-Eingaben darueber, dann pro Mitarbeiter speichern.
    const ids = [...selected];
    const { data: existing } = await supabase
      .from("employees")
      .select("id, regelarbeitszeit, schwellenwert")
      .in("id", ids);
    const map = new Map<string, { regelarbeitszeit: any; schwellenwert: any }>();
    (existing || []).forEach((e: any) => map.set(e.id, { regelarbeitszeit: e.regelarbeitszeit, schwellenwert: e.schwellenwert }));

    const errors: string[] = [];
    for (const id of ids) {
      const cur = map.get(id) || { regelarbeitszeit: null, schwellenwert: null };
      const update: Record<string, any> = {};

      if (applyRegelarbeitszeit) {
        // Wochentage aus Batch nutzen, biweekly-Felder (zyklus, woche_b, zyklus_anker) aus dem aktuellen Datensatz erhalten
        const merged = {
          ...(cur.regelarbeitszeit && typeof cur.regelarbeitszeit === "object" ? cur.regelarbeitszeit : {}),
          ...schedule,
        };
        update.regelarbeitszeit = merged;
        update.wochen_soll_stunden = Object.entries(schedule).reduce(
          (s, [_k, d]: [string, any]) => s + (d?.hours ?? 0),
          0
        );
      }

      if (applySchwellenwert) {
        const merged = {
          ...(cur.schwellenwert && typeof cur.schwellenwert === "object" ? cur.schwellenwert : {}),
          ...schwellenwert,
        };
        update.schwellenwert = merged;
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

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4 mr-2" />
        Mehrere Mitarbeiter gleichzeitig bearbeiten
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Batch-Einstellungen für Mitarbeiter</DialogTitle>
            <DialogDescription>
              Setze Regelarbeitszeit und/oder Schwellenwert für mehrere Mitarbeiter gleichzeitig.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Mitarbeiter-Auswahl */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">Mitarbeiter auswählen ({selected.size}/{employees.length})</CardTitle>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={selectAll}>
                      {selected.size === employees.length ? "Keine" : "Alle"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => selectByKategorie("vorarbeiter")}>Vorarbeiter</Button>
                    <Button size="sm" variant="outline" onClick={() => selectByKategorie("facharbeiter")}>Facharbeiter</Button>
                    <Button size="sm" variant="outline" onClick={() => selectByKategorie("helfer")}>Helfer</Button>
                    <Button size="sm" variant="outline" onClick={() => selectByKategorie("lehrling")}>Lehrlinge</Button>
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
                      {emp.kategorie && (
                        <span className="text-xs text-muted-foreground">({emp.kategorie})</span>
                      )}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Regelarbeitszeit */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={applyRegelarbeitszeit}
                      onCheckedChange={(v) => setApplyRegelarbeitszeit(!!v)}
                    />
                    <CardTitle className="text-base">Regelarbeitszeit</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSchedule(DEFAULT_SCHEDULE)}>
                      Facharbeiter (39h)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSchedule(LEHRLING_SCHEDULE)}>
                      Lehrling
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-xs">
                  Wochensoll: {Object.values(schedule).reduce((s, d) => s + (d?.hours ?? 0), 0).toFixed(1)}h
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {DAY_KEYS.map((day) => (
                    <div key={day} className="space-y-1">
                      <Label className="text-xs text-center block">{DAY_LABELS[day]}</Label>
                      <Input
                        type="time"
                        value={schedule[day]?.start || ""}
                        disabled={!applyRegelarbeitszeit}
                        onChange={(e) =>
                          setSchedule({
                            ...schedule,
                            [day]: { ...schedule[day], start: e.target.value || null },
                          })
                        }
                        className="text-xs"
                      />
                      <Input
                        type="time"
                        value={schedule[day]?.end || ""}
                        disabled={!applyRegelarbeitszeit}
                        onChange={(e) =>
                          setSchedule({
                            ...schedule,
                            [day]: { ...schedule[day], end: e.target.value || null },
                          })
                        }
                        className="text-xs"
                      />
                      <Input
                        type="number"
                        step="0.25"
                        placeholder="h"
                        value={schedule[day]?.hours ?? 0}
                        disabled={!applyRegelarbeitszeit}
                        onChange={(e) =>
                          setSchedule({
                            ...schedule,
                            [day]: { ...schedule[day], hours: parseFloat(e.target.value) || 0 },
                          })
                        }
                        className="text-xs text-center"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Pro Tag: Beginn, Ende, Stunden. Leer lassen für arbeitsfreie Tage.
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
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {DAY_KEYS.map((day) => (
                    <div key={day} className="text-center">
                      <Label className="text-xs">{DAY_LABELS[day]}</Label>
                      <Input
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        value={schwellenwert[day] ?? 0}
                        disabled={!applySchwellenwert}
                        onChange={(e) =>
                          setSchwellenwert({
                            ...schwellenwert,
                            [day]: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="text-center text-sm"
                      />
                    </div>
                  ))}
                </div>
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
