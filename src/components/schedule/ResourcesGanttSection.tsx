import { useState } from "react";
import { ChevronDown, ChevronRight, Package, Plus, X } from "lucide-react";
import { isSameDay, parseISO, format } from "date-fns";
import { isCompanyHoliday } from "./scheduleUtils";
import type { Resource, MasterResource, Project, CompanyHoliday } from "./scheduleTypes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Props {
  masterResources: MasterResource[];
  resources: Resource[]; // assignment_resources
  projects: Project[];
  days: Date[];
  holidays: CompanyHoliday[];
  canEdit: boolean;
  onAssignResource: (resourceName: string, projectId: string, datum: string) => Promise<void> | void;
  onRemoveResource: (resourceId: string) => Promise<void> | void;
}

/**
 * Wochen-Gantt für Master-Ressourcen.
 * - Zeile pro aktiver Ressource (aus `resources`-Tabelle)
 * - Zelle pro Tag: Liste aller Projekte denen die Ressource an dem Tag zugeordnet ist
 * - Cell-Hintergrund nutzt die in der Master-Ressource hinterlegte Farbe
 * - Klick auf leere Zelle (nur Admin/Vorarbeiter): Projekt auswählen → assignment_resources
 */
export function ResourcesGanttSection({
  masterResources,
  resources,
  projects,
  days,
  holidays,
  canEdit,
  onAssignResource,
  onRemoveResource,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [openCellKey, setOpenCellKey] = useState<string | null>(null);

  // Ressourcen-Name → Master-Datensatz (für Farbe-Lookup)
  const masterByName = new Map<string, MasterResource>();
  for (const m of masterResources) {
    masterByName.set(m.name.toLowerCase(), m);
  }

  // Auch Ressourcen anzeigen, die zugewiesen aber nicht in der Master-Liste sind
  const allNames = Array.from(
    new Set([
      ...masterResources.filter((m) => m.is_active).map((m) => m.name),
      ...resources.map((r) => r.resource_name).filter(Boolean),
    ])
  ).sort();

  return (
    <div className="border-b">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        <Package className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="font-semibold text-sm">Ressourcen</span>
        <span className="text-xs text-muted-foreground">{allNames.length} verfügbar</span>
      </button>

      {!collapsed && allNames.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
          Keine Ressourcen angelegt.
        </div>
      )}

      {!collapsed &&
        allNames.map((name) => {
          const master = masterByName.get(name.toLowerCase());
          const farbe = master?.farbe || "#94A3B8";
          return (
            <div
              key={name}
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
                <span className="truncate">{name}</span>
                {master?.einheit && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{master.einheit}</span>
                )}
              </div>

              {days.map((day) => {
                const datum = format(day, "yyyy-MM-dd");
                const holiday = isCompanyHoliday(holidays, day);
                const dow = day.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const cellAssignments = resources.filter(
                  (r) =>
                    r.resource_name.toLowerCase() === name.toLowerCase() &&
                    isSameDay(parseISO(r.datum), day)
                );
                const cellKey = `${name}|${datum}`;
                const isOpen = openCellKey === cellKey;

                return (
                  <div
                    key={datum}
                    className={`p-0.5 border-r min-h-[40px] ${
                      holiday ? "bg-gray-100" : isWeekend ? "bg-muted/30" : ""
                    }`}
                  >
                    {cellAssignments.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {cellAssignments.map((r) => {
                          const proj = projects.find((p) => p.id === r.project_id);
                          return (
                            <div
                              key={r.id}
                              className="text-[10px] px-1 py-0.5 rounded flex items-center gap-1 group"
                              style={{
                                backgroundColor: farbe + "33", // 20% Alpha
                                borderLeft: `3px solid ${farbe}`,
                                color: "#1f2937",
                              }}
                              title={proj?.name}
                            >
                              <span className="truncate flex-1">{proj?.name || "?"}</span>
                              {canEdit && (
                                <button
                                  className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveResource(r.id);
                                  }}
                                  title="Zuweisung entfernen"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {canEdit && (
                      <Popover
                        open={isOpen}
                        onOpenChange={(o) => setOpenCellKey(o ? cellKey : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            className="w-full text-[10px] text-muted-foreground hover:text-primary hover:bg-muted/40 rounded py-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Plus className="h-3 w-3 inline" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-1" align="start">
                          <p className="text-xs font-medium px-2 py-1 text-muted-foreground">
                            {name} → Projekt zuweisen
                          </p>
                          <div className="max-h-48 overflow-y-auto">
                            {projects.length === 0 ? (
                              <p className="text-xs px-2 py-2 text-muted-foreground">
                                Keine aktiven Projekte
                              </p>
                            ) : (
                              projects.map((p) => (
                                <Button
                                  key={p.id}
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start text-xs h-7"
                                  onClick={async () => {
                                    await onAssignResource(name, p.id, datum);
                                    setOpenCellKey(null);
                                  }}
                                >
                                  {p.name}
                                </Button>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}
