import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Package, X } from "lucide-react";
import { format, eachDayOfInterval, parseISO, isWithinInterval } from "date-fns";
import { isCompanyHoliday } from "./scheduleUtils";
import type { ResourceBlock, MasterResource, Project, CompanyHoliday } from "./scheduleTypes";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  masterResources: MasterResource[];
  resourceBlocks: ResourceBlock[];
  projects: Project[];
  days: Date[];
  holidays: CompanyHoliday[];
  canEdit: boolean;
  onCreateBlock: (resourceId: string, projectId: string | null, startDate: string, endDate: string, label?: string | null) => Promise<void> | void;
  onUpdateBlock: (id: string, patch: { project_id?: string | null; start_date?: string; end_date?: string; label?: string | null }) => Promise<void> | void;
  onDeleteBlock: (id: string) => Promise<void> | void;
}

/**
 * Wochen-Gantt fuer Master-Ressourcen.
 * - Zeile pro aktiver Master-Ressource
 * - Zelle pro Tag, Block ueberspannt mehrere Tage (start_date ... end_date)
 * - Drag-Select ueber mehrere Tage erstellt einen neuen Block
 * - Farbe immer aus Master-Ressource (resources.farbe)
 */
export function ResourcesGanttSection({
  masterResources,
  resourceBlocks,
  projects,
  days,
  holidays,
  canEdit,
  onCreateBlock,
  onUpdateBlock,
  onDeleteBlock,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragResId, setDragResId] = useState<string | null>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);
  // Dialog-State fuer Erstellung
  const [createOpen, setCreateOpen] = useState(false);
  const [createResId, setCreateResId] = useState<string | null>(null);
  const [createStart, setCreateStart] = useState<string>("");
  const [createEnd, setCreateEnd] = useState<string>("");
  const [createProjectId, setCreateProjectId] = useState<string>("__none__");

  const activeResources = masterResources.filter((m) => m.is_active);

  useEffect(() => {
    const onMouseUp = () => {
      if (dragResId && dragStartIdx !== null && dragEndIdx !== null) {
        const lo = Math.min(dragStartIdx, dragEndIdx);
        const hi = Math.max(dragStartIdx, dragEndIdx);
        const startD = days[lo];
        const endD = days[hi];
        if (startD && endD) {
          setCreateResId(dragResId);
          setCreateStart(format(startD, "yyyy-MM-dd"));
          setCreateEnd(format(endD, "yyyy-MM-dd"));
          setCreateProjectId("__none__");
          setCreateOpen(true);
        }
      }
      setDragResId(null);
      setDragStartIdx(null);
      setDragEndIdx(null);
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragResId, dragStartIdx, dragEndIdx, days]);

  const submitCreate = async () => {
    if (!createResId) return;
    await onCreateBlock(
      createResId,
      createProjectId === "__none__" ? null : createProjectId,
      createStart,
      createEnd,
    );
    setCreateOpen(false);
  };

  return (
    <div className="border-b">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        <Package className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="font-semibold text-sm">Ressourcen</span>
        <span className="text-xs text-muted-foreground">{activeResources.length} verfügbar</span>
      </button>

      {!collapsed && activeResources.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          Keine Ressourcen angelegt.
        </div>
      )}

      {!collapsed &&
        activeResources.map((res) => {
          const farbe = res.farbe || "#94A3B8";
          // Bloecke dieser Ressource, die im sichtbaren Range liegen
          const blocks = resourceBlocks.filter((b) => b.resource_id === res.id);

          return (
            <div
              key={res.id}
              className="grid border-t"
              style={{
                gridTemplateColumns: `minmax(140px, 200px) repeat(${days.length}, minmax(40px, 1fr))`,
              }}
            >
              <div className="p-2 border-r text-sm font-medium truncate sticky left-0 bg-card z-10 flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: farbe }}
                />
                <span className="truncate">{res.name}</span>
                {res.einheit && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{res.einheit}</span>
                )}
              </div>

              {days.map((day, dayIdx) => {
                const datum = format(day, "yyyy-MM-dd");
                const holiday = isCompanyHoliday(holidays, day);
                const dow = day.getDay();
                const isWeekend = dow === 0 || dow === 6;

                // Bloecke, die diesen Tag enthalten
                const dayBlocks = blocks.filter((b) =>
                  isWithinInterval(day, { start: parseISO(b.start_date), end: parseISO(b.end_date) })
                );

                const isDragSelected =
                  dragResId === res.id &&
                  dragStartIdx !== null &&
                  dragEndIdx !== null &&
                  dayIdx >= Math.min(dragStartIdx, dragEndIdx) &&
                  dayIdx <= Math.max(dragStartIdx, dragEndIdx);

                return (
                  <div
                    key={datum}
                    className={`p-0.5 border-r min-h-[40px] select-none ${
                      holiday ? "bg-gray-100" : isWeekend ? "bg-muted/30" : ""
                    } ${isDragSelected ? "bg-blue-100 ring-1 ring-inset ring-blue-400" : ""}`}
                    onMouseDown={() => {
                      // Nicht draggen auf bereits belegten Zellen — verhindert versehentliches Ueberschreiben
                      if (!canEdit || dayBlocks.length > 0) return;
                      setDragResId(res.id);
                      setDragStartIdx(dayIdx);
                      setDragEndIdx(dayIdx);
                    }}
                    onMouseEnter={() => {
                      // Drag-Erweiterung nur durch leere Zellen
                      if (dragResId === res.id && dayBlocks.length === 0) {
                        setDragEndIdx(dayIdx);
                      }
                    }}
                  >
                    {dayBlocks.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {dayBlocks.map((b) => {
                          const proj = projects.find((p) => p.id === b.project_id);
                          // Block-Renderring: erste Zelle des Blocks rendert den Inhalt; mittlere/letzte Zelle nur Hintergrund
                          const isFirst = b.start_date === datum;
                          if (!isFirst) {
                            return (
                              <div
                                key={b.id}
                                className="h-5 rounded-sm"
                                style={{ backgroundColor: farbe + "33", borderTop: `2px solid ${farbe}`, borderBottom: `2px solid ${farbe}` }}
                              />
                            );
                          }
                          return (
                            <div
                              key={b.id}
                              className="text-[10px] px-1 py-0.5 rounded flex items-center gap-1 group"
                              style={{
                                backgroundColor: farbe + "33",
                                borderLeft: `3px solid ${farbe}`,
                                color: "#1f2937",
                              }}
                              title={proj?.name || b.label || ""}
                            >
                              <span className="truncate flex-1">{proj?.name || b.label || "—"}</span>
                              {canEdit && (
                                <button
                                  className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteBlock(b.id);
                                  }}
                                  title="Block entfernen"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

      {/* Erstell-Dialog nach Drag-Select */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {(() => {
                const res = masterResources.find((m) => m.id === createResId);
                return res ? `${res.name} zuweisen` : "Ressource zuweisen";
              })()}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {createStart === createEnd ? createStart : `${createStart} – ${createEnd}`}
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Projekt (optional)</Label>
              <Select value={createProjectId} onValueChange={setCreateProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ohne Projekt</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={submitCreate}>Block erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
