import { useState } from "react";
import { format, parseISO, eachDayOfInterval } from "date-fns";
import { Trash2, Plus, CalendarOff, Download } from "lucide-react";
import { getAustrianHolidays } from "@/lib/austrianHolidays";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CompanyHoliday } from "./scheduleTypes";

interface Props {
  holidays: CompanyHoliday[];
  onUpdate: () => void;
  userId: string;
}

export function CompanyHolidayManager({ holidays, onUpdate, userId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newLabel, setNewLabel] = useState("Betriebsurlaub");

  const handleAdd = async () => {
    if (!newDate) return;

    const label = newLabel || "Betriebsurlaub";
    let dates: string[] = [newDate];

    if (newEndDate && newEndDate > newDate) {
      dates = eachDayOfInterval({
        start: new Date(newDate),
        end: new Date(newEndDate),
      }).map(d => format(d, "yyyy-MM-dd"));
    }

    const rows = dates.map(d => ({
      datum: d,
      bezeichnung: label,
      created_by: userId,
    }));

    const { error } = await supabase
      .from("company_holidays")
      .upsert(rows, { onConflict: "datum" });

    if (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message,
      });
      return;
    }

    setNewDate("");
    setNewEndDate("");
    setNewLabel("Betriebsurlaub");
    onUpdate();
    toast({ title: `${dates.length} Tag${dates.length > 1 ? "e" : ""} hinzugefügt` });
  };

  // Ganzen Block (zusammenhängende Tage mit gleicher Bezeichnung) löschen.
  // Stoppt Event-Propagation, damit der Dialog nicht zugeht.
  const handleDeleteBlock = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    if (!window.confirm(`"${label}" mit ${ids.length} Tag${ids.length === 1 ? "" : "en"} wirklich löschen?`)) return;
    const { error } = await supabase
      .from("company_holidays")
      .delete()
      .in("id", ids);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    onUpdate();
    toast({ title: `${ids.length} Tag${ids.length === 1 ? "" : "e"} gelöscht` });
  };

  const handleImportHolidays = async () => {
    const year = newDate ? new Date(newDate).getFullYear() : new Date().getFullYear();
    const feiertage = getAustrianHolidays(year);
    const rows = feiertage.map((f) => ({
      datum: f.datum,
      bezeichnung: f.bezeichnung,
      created_by: userId,
    }));

    const { error } = await supabase
      .from("company_holidays")
      .upsert(rows, { onConflict: "datum" });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }

    onUpdate();
    toast({ title: `${feiertage.length} Feiertage für ${year} importiert` });
  };

  const sorted = [...holidays].sort(
    (a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime()
  );

  // Aufeinanderfolgende Tage mit gleicher Bezeichnung zu Blöcken zusammenfassen
  type Block = { ids: string[]; bezeichnung: string; from: string; to: string };
  const blocks: Block[] = [];
  for (const h of sorted) {
    const last = blocks[blocks.length - 1];
    const prevDate = last ? new Date(last.to) : null;
    const curDate = new Date(h.datum);
    const dayDiff = prevDate ? Math.round((curDate.getTime() - prevDate.getTime()) / 86_400_000) : null;
    const sameLabel = last && (last.bezeichnung || "") === (h.bezeichnung || "");
    if (last && sameLabel && dayDiff === 1) {
      last.ids.push(h.id);
      last.to = h.datum;
    } else {
      blocks.push({ ids: [h.id], bezeichnung: h.bezeichnung || "Betriebsurlaub", from: h.datum, to: h.datum });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarOff className="h-4 w-4 mr-2" />
          Betriebsurlaub
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Betriebsurlaub verwalten</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new */}
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">–</span>
              <Input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                min={newDate}
                className="flex-1"
                placeholder="bis (optional)"
              />
            </div>
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Bezeichnung"
                className="flex-1"
              />
              <Button size="sm" onClick={handleAdd} disabled={!newDate}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={handleImportHolidays}>
              <Download className="h-4 w-4 mr-2" />
              AT-Feiertage {newDate ? new Date(newDate).getFullYear() : new Date().getFullYear()} importieren
            </Button>
          </div>

          {/* Block-Liste */}
          <div className="space-y-2 max-h-64 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Keine Betriebsurlaube eingetragen
              </p>
            ) : (
              blocks.map((b, idx) => {
                const isSingle = b.ids.length === 1;
                return (
                  <div key={idx} className="rounded border bg-muted/30">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="text-sm font-mono">
                        {isSingle
                          ? format(parseISO(b.from), "dd.MM.yyyy")
                          : `${format(parseISO(b.from), "dd.MM.")} – ${format(parseISO(b.to), "dd.MM.yyyy")}`}
                      </span>
                      {!isSingle && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border text-muted-foreground">
                          {b.ids.length} Tage
                        </span>
                      )}
                      <span className="text-sm flex-1 truncate">{b.bezeichnung}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteBlock(b.ids, b.bezeichnung);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        {isSingle ? "Löschen" : "Block löschen"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
