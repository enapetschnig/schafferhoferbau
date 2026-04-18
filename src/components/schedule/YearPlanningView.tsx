import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  startOfYear,
  endOfYear,
  startOfISOWeek,
  addWeeks,
  getISOWeek,
  format,
  isSameDay,
  parseISO,
  isWithinInterval,
  isBefore,
  isAfter,
} from "date-fns";
import { de } from "date-fns/locale";
import { Plus, Trash2, GripVertical, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getProjectColor } from "./scheduleUtils";
import { YearPlanExcelIO } from "./YearPlanExcelIO";
import type {
  Project,
  Assignment,
  CompanyHoliday,
  LeaveRequest,
} from "./scheduleTypes";

interface PlanBlock {
  id: string;
  project_id: string | null;
  title: string;
  color: string;
  start_week: number;
  end_week: number;
  year: number;
  partie: string | null;
  individual_name: string | null;
  sort_order: number;
}

interface Resource {
  id: string;
  name: string;
  kategorie: string;
  einheit: string | null;
  farbe: string | null;
  is_active: boolean | null;
  sort_order: number | null;
}

interface ResourceBlock {
  id: string;
  resource_id: string;
  project_id: string | null;
  year: number;
  start_week: number;
  end_week: number;
  color: string;
  label: string | null;
  sort_order: number;
}

interface Props {
  year: number;
  projects: Project[];
  assignments: Assignment[];
  holidays: CompanyHoliday[];
  leaveRequests: LeaveRequest[];
  onSelectWeek?: (weekStart: Date) => void;
}

const BLOCK_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#84CC16",
];

type DragState = {
  id: string;
  kind: "plan" | "resource";
  mode: "move" | "resize-start" | "resize-end";
  startPointerX: number;
  originalStartWeek: number;
  originalEndWeek: number;
  deltaWeeks: number;
};

export function YearPlanningView({
  year,
  projects,
  assignments,
  holidays,
  onSelectWeek,
}: Props) {
  const { toast } = useToast();
  const [planBlocks, setPlanBlocks] = useState<PlanBlock[]>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  // Create-Drag: Ziehen auf leerer Flaeche um neuen Block zu erstellen
  const [createDrag, setCreateDrag] = useState<{
    kind: "plan" | "resource";
    resourceId?: string;
    startWeek: number;
    endWeek: number;
    active: boolean;
  } | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [editingBlock, setEditingBlock] = useState<PlanBlock | null>(null);
  const [blockForm, setBlockForm] = useState({
    title: "", projectId: "", color: BLOCK_COLORS[0],
    startWeek: "1", endWeek: "4", partie: "", individualName: "",
  });

  // Ressourcen-Bloecke
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceBlocks, setResourceBlocks] = useState<ResourceBlock[]>([]);
  const [showResourceDialog, setShowResourceDialog] = useState(false);
  const [editingResourceBlock, setEditingResourceBlock] = useState<ResourceBlock | null>(null);
  const [resourceForm, setResourceForm] = useState({
    resourceId: "", projectId: "", color: BLOCK_COLORS[3],
    startWeek: "1", endWeek: "4", label: "",
  });

  useEffect(() => {
    fetchPlanBlocks();
    fetchResources();
    fetchResourceBlocks();
  }, [year]);

  const fetchPlanBlocks = async () => {
    const { data } = await supabase
      .from("yearly_plan_blocks")
      .select("*")
      .eq("year", year)
      .order("sort_order");
    if (data) setPlanBlocks(data as PlanBlock[]);
  };

  const fetchResources = async () => {
    const { data } = await supabase
      .from("resources")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    if (data) setResources(data as Resource[]);
  };

  const fetchResourceBlocks = async () => {
    const { data } = await supabase
      .from("yearly_resource_blocks")
      .select("*")
      .eq("year", year)
      .order("sort_order");
    if (data) setResourceBlocks(data as ResourceBlock[]);
  };

  // Spaltenbreite messen fuer Drag-Berechnung
  const getColumnWidthPx = useCallback((): number => {
    if (!gridRef.current) return 24;
    const firstRow = gridRef.current.querySelector("[data-yp-row='true']") as HTMLElement | null;
    if (!firstRow) return 24;
    const width = firstRow.getBoundingClientRect().width;
    const labelWidth = 200; // approx sticky label column width
    const weekCount = weeks.length;
    if (weekCount === 0) return 24;
    return Math.max(10, (width - labelWidth) / weekCount);
  }, []);

  const startDrag = (
    e: React.PointerEvent,
    id: string,
    kind: "plan" | "resource",
    mode: "move" | "resize-start" | "resize-end",
    startWeek: number,
    endWeek: number
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      id,
      kind,
      mode,
      startPointerX: e.clientX,
      originalStartWeek: startWeek,
      originalEndWeek: endWeek,
      deltaWeeks: 0,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    const colW = getColumnWidthPx();
    const deltaPx = e.clientX - dragState.startPointerX;
    const deltaWeeks = Math.round(deltaPx / colW);
    if (deltaWeeks !== dragState.deltaWeeks) {
      setDragState({ ...dragState, deltaWeeks });
    }
  };

  const endDrag = async (e: React.PointerEvent) => {
    if (!dragState) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const { id, kind, mode, originalStartWeek, originalEndWeek, deltaWeeks } = dragState;
    setDragState(null);

    if (deltaWeeks === 0) return;

    let newStart = originalStartWeek;
    let newEnd = originalEndWeek;
    if (mode === "move") {
      newStart = originalStartWeek + deltaWeeks;
      newEnd = originalEndWeek + deltaWeeks;
    } else if (mode === "resize-start") {
      newStart = originalStartWeek + deltaWeeks;
      if (newStart > originalEndWeek) newStart = originalEndWeek;
    } else if (mode === "resize-end") {
      newEnd = originalEndWeek + deltaWeeks;
      if (newEnd < originalStartWeek) newEnd = originalStartWeek;
    }

    // Clamp to 1..53
    newStart = Math.max(1, Math.min(53, newStart));
    newEnd = Math.max(1, Math.min(53, newEnd));
    if (newStart > newEnd) newStart = newEnd;

    const table = kind === "plan" ? "yearly_plan_blocks" : "yearly_resource_blocks";
    const { error } = await supabase
      .from(table)
      .update({ start_week: newStart, end_week: newEnd })
      .eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    }
    if (kind === "plan") fetchPlanBlocks();
    else fetchResourceBlocks();
  };

  // Create-Drag: auf leerer Flaeche ziehen um neuen Block zu erstellen
  const startCreateDrag = (e: React.PointerEvent, kind: "plan" | "resource", weekNum: number, resourceId?: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setCreateDrag({ kind, resourceId, startWeek: weekNum, endWeek: weekNum, active: true });
  };

  const updateCreateDrag = (weekNum: number) => {
    if (!createDrag || !createDrag.active) return;
    if (createDrag.endWeek !== weekNum) {
      setCreateDrag({ ...createDrag, endWeek: weekNum });
    }
  };

  const endCreateDrag = () => {
    if (!createDrag) return;
    const sw = Math.min(createDrag.startWeek, createDrag.endWeek);
    const ew = Math.max(createDrag.startWeek, createDrag.endWeek);
    if (createDrag.kind === "plan") {
      setEditingBlock(null);
      setBlockForm({
        title: "",
        projectId: "__none__",
        color: BLOCK_COLORS[0],
        startWeek: String(sw),
        endWeek: String(ew),
        partie: "",
        individualName: "",
      });
      setShowBlockDialog(true);
    } else {
      setEditingResourceBlock(null);
      setResourceForm({
        resourceId: createDrag.resourceId || "",
        projectId: "__none__",
        color: BLOCK_COLORS[3],
        startWeek: String(sw),
        endWeek: String(ew),
        label: "",
      });
      setShowResourceDialog(true);
    }
    setCreateDrag(null);
  };

  // Helper: bekommt effektive start/end_week waehrend Drag
  const getEffectiveRange = (
    id: string,
    kind: "plan" | "resource",
    originalStart: number,
    originalEnd: number
  ): { start: number; end: number } => {
    if (!dragState || dragState.id !== id || dragState.kind !== kind) {
      return { start: originalStart, end: originalEnd };
    }
    const { mode, deltaWeeks } = dragState;
    if (mode === "move") return { start: originalStart + deltaWeeks, end: originalEnd + deltaWeeks };
    if (mode === "resize-start") return { start: Math.min(originalStart + deltaWeeks, originalEnd), end: originalEnd };
    if (mode === "resize-end") return { start: originalStart, end: Math.max(originalEnd + deltaWeeks, originalStart) };
    return { start: originalStart, end: originalEnd };
  };

  // Check: Ressource darf nur Projekten zugewiesen werden, die im gleichen Zeitraum
  // im oberen Planungssystem (planBlocks) eingeplant sind
  const getAvailableProjectsForResource = (startWeek: number, endWeek: number) => {
    const activeProjectIds = new Set<string>();
    // Projekte mit Assignments in diesem Zeitraum
    for (const a of assignments) {
      const d = parseISO(a.datum);
      const w = getISOWeek(d);
      if (d.getFullYear() === year && w >= startWeek && w <= endWeek) {
        activeProjectIds.add(a.project_id);
      }
    }
    // Projekte mit Grobplanungsbloecken in diesem Zeitraum
    for (const b of planBlocks) {
      if (b.project_id && !(b.end_week < startWeek || b.start_week > endWeek)) {
        activeProjectIds.add(b.project_id);
      }
    }
    return projects.filter((p) => activeProjectIds.has(p.id));
  };

  const handleSaveBlock = async () => {
    if (!blockForm.title.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      title: blockForm.title.trim(),
      project_id: (!blockForm.projectId || blockForm.projectId === "__none__") ? null : blockForm.projectId,
      color: blockForm.color,
      start_week: parseInt(blockForm.startWeek),
      end_week: parseInt(blockForm.endWeek),
      year,
      partie: blockForm.partie.trim() || null,
      individual_name: blockForm.individualName.trim() || null,
      created_by: user.id,
    };

    if (editingBlock) {
      await supabase.from("yearly_plan_blocks").update(payload).eq("id", editingBlock.id);
    } else {
      await supabase.from("yearly_plan_blocks").insert(payload);
    }
    setShowBlockDialog(false);
    setEditingBlock(null);
    setBlockForm({ title: "", projectId: "", color: BLOCK_COLORS[0], startWeek: "1", endWeek: "4", partie: "", individualName: "" });
    fetchPlanBlocks();
  };

  const handleDeleteBlock = async (id: string) => {
    await supabase.from("yearly_plan_blocks").delete().eq("id", id);
    fetchPlanBlocks();
  };

  const openEditBlock = (block: PlanBlock) => {
    setEditingBlock(block);
    setBlockForm({
      title: block.title,
      projectId: block.project_id || "__none__",
      color: block.color || BLOCK_COLORS[0],
      startWeek: block.start_week.toString(),
      endWeek: block.end_week.toString(),
      partie: block.partie || "",
      individualName: block.individual_name || "",
    });
    setShowBlockDialog(true);
  };

  const handleSaveResourceBlock = async () => {
    if (!resourceForm.resourceId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      resource_id: resourceForm.resourceId,
      project_id: (!resourceForm.projectId || resourceForm.projectId === "__none__") ? null : resourceForm.projectId,
      color: resourceForm.color,
      start_week: parseInt(resourceForm.startWeek),
      end_week: parseInt(resourceForm.endWeek),
      year,
      label: resourceForm.label.trim() || null,
      created_by: user.id,
    };

    if (editingResourceBlock) {
      await supabase.from("yearly_resource_blocks").update(payload).eq("id", editingResourceBlock.id);
    } else {
      await supabase.from("yearly_resource_blocks").insert(payload);
    }
    setShowResourceDialog(false);
    setEditingResourceBlock(null);
    setResourceForm({ resourceId: "", projectId: "", color: BLOCK_COLORS[3], startWeek: "1", endWeek: "4", label: "" });
    fetchResourceBlocks();
  };

  const handleDeleteResourceBlock = async (id: string) => {
    await supabase.from("yearly_resource_blocks").delete().eq("id", id);
    fetchResourceBlocks();
  };

  const openEditResourceBlock = (block: ResourceBlock) => {
    setEditingResourceBlock(block);
    setResourceForm({
      resourceId: block.resource_id,
      projectId: block.project_id || "__none__",
      color: block.color || BLOCK_COLORS[3],
      startWeek: block.start_week.toString(),
      endWeek: block.end_week.toString(),
      label: block.label || "",
    });
    setShowResourceDialog(true);
  };
  // Generate all ISO weeks for the year
  const weeks = useMemo(() => {
    const result: { weekNum: number; start: Date; month: string }[] = [];
    let current = startOfISOWeek(new Date(year, 0, 4)); // First ISO week
    const yearEnd = endOfYear(new Date(year, 0, 1));

    while (isBefore(current, yearEnd) || isSameDay(current, yearEnd)) {
      const weekNum = getISOWeek(current);
      result.push({
        weekNum,
        start: current,
        month: format(current, "MMM", { locale: de }),
      });
      current = addWeeks(current, 1);
      // Stop if we've gone past 53 weeks
      if (result.length > 53) break;
    }
    return result;
  }, [year]);

  // Group weeks by month for header
  const monthGroups = useMemo(() => {
    const groups: { month: string; span: number }[] = [];
    let lastMonth = "";
    for (const w of weeks) {
      if (w.month !== lastMonth) {
        groups.push({ month: w.month, span: 1 });
        lastMonth = w.month;
      } else {
        groups[groups.length - 1].span++;
      }
    }
    return groups;
  }, [weeks]);

  // Active projects (those with assignments this year)
  const activeProjectIds = [
    ...new Set(assignments.map((a) => a.project_id)),
  ];
  const activeProjects = projects.filter((p) =>
    activeProjectIds.includes(p.id)
  );

  // Check if a project has assignments in a given week
  const hasAssignmentsInWeek = (
    projectId: string,
    weekStart: Date
  ): number => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    return assignments.filter((a) => {
      if (a.project_id !== projectId) return false;
      const d = parseISO(a.datum);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    }).length;
  };

  const isHolidayWeek = (weekStart: Date): boolean => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4);
    return holidays.some((h) => {
      const d = parseISO(h.datum);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    });
  };

  return (
    <>
    <div
      ref={gridRef}
      className="border rounded-lg overflow-x-auto"
      onPointerMove={onPointerMove}
      onPointerUp={(e) => { endDrag(e); endCreateDrag(); }}
      onPointerCancel={(e) => { endDrag(e); setCreateDrag(null); }}
    >
      {/* Month header */}
      <div
        className="grid sticky top-0 z-20 bg-card border-b"
        style={{
          gridTemplateColumns: `minmax(140px, 200px) ${monthGroups
            .map((g) => `repeat(${g.span}, minmax(24px, 1fr))`)
            .join(" ")}`,
        }}
      >
        <div className="p-1 border-r sticky left-0 bg-card z-30" />
        {monthGroups.map((g, i) => (
          <div
            key={i}
            className="text-xs font-medium text-center py-1 border-r"
            style={{ gridColumn: `span ${g.span}` }}
          >
            {g.month}
          </div>
        ))}
      </div>

      {/* KW header */}
      <div
        className="grid sticky top-[28px] z-20 bg-card border-b"
        style={{
          gridTemplateColumns: `minmax(140px, 200px) repeat(${weeks.length}, minmax(24px, 1fr))`,
        }}
      >
        <div className="p-1 border-r text-xs text-muted-foreground sticky left-0 bg-card z-30">
          KW
        </div>
        {weeks.map((w) => (
          <button
            type="button"
            key={w.weekNum}
            onClick={() => onSelectWeek?.(w.start)}
            className={`text-[10px] text-center py-0.5 border-r ${
              isHolidayWeek(w.start)
                ? "bg-gray-200 text-gray-400"
                : "text-muted-foreground"
            } ${onSelectWeek ? "hover:bg-primary/20 hover:text-primary cursor-pointer" : ""}`}
            title={onSelectWeek ? `Zur Wochenansicht KW ${w.weekNum}` : undefined}
          >
            {w.weekNum}
          </button>
        ))}
      </div>

      {/* Project rows */}
      {activeProjects.map((project) => {
        const color = getProjectColor(project.id);
        return (
          <div
            key={project.id}
            className="grid border-b"
            style={{
              gridTemplateColumns: `minmax(140px, 200px) repeat(${weeks.length}, minmax(24px, 1fr))`,
            }}
          >
            <div className="p-1.5 border-r text-xs font-medium truncate sticky left-0 bg-card z-10">
              {project.name}
            </div>
            {weeks.map((w) => {
              const count = hasAssignmentsInWeek(project.id, w.start);
              const holiday = isHolidayWeek(w.start);
              return (
                <div
                  key={w.weekNum}
                  className={`border-r min-h-[24px] ${
                    holiday ? "bg-gray-100" : ""
                  }`}
                >
                  {count > 0 && (
                    <div
                      className={`h-full ${color.bg} ${color.border} border-y`}
                      title={`${project.name} – KW ${w.weekNum}: ${count} Zuweisungen`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {activeProjects.length === 0 && (
        <div className="px-3 py-8 text-sm text-muted-foreground text-center">
          Keine Projekte mit Zuweisungen in {year}
        </div>
      )}

      {/* Grobplanung Separator */}
      <div className="border-t-2 border-primary/30">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 flex-wrap gap-2">
          <h3 className="text-sm font-semibold">Jahresgrobplanung</h3>
          <div className="flex gap-1.5 flex-wrap">
            <YearPlanExcelIO
              year={year}
              projects={projects}
              resources={resources.map(r => ({ id: r.id, name: r.name, farbe: r.farbe }))}
              onImported={() => { fetchPlanBlocks(); fetchResourceBlocks(); }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingBlock(null);
                setBlockForm({ title: "", projectId: "", color: BLOCK_COLORS[0], startWeek: "1", endWeek: "4", partie: "", individualName: "" });
                setShowBlockDialog(true);
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Block
            </Button>
          </div>
        </div>
      </div>

      {/* Plan blocks */}
      {planBlocks.map((block) => {
        const { start: effStart, end: effEnd } = getEffectiveRange(block.id, "plan", block.start_week, block.end_week);
        return (
        <div
          key={block.id}
          data-yp-row="true"
          className="grid border-b hover:bg-muted/20"
          style={{
            gridTemplateColumns: `minmax(140px, 200px) repeat(${weeks.length}, minmax(24px, 1fr))`,
          }}
        >
          <div
            className="p-1.5 border-r text-xs font-medium truncate sticky left-0 bg-card z-10 flex items-center gap-1 cursor-pointer"
            onClick={() => openEditBlock(block)}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span>{block.title}</span>
            {block.individual_name && <span className="text-primary font-semibold"> · {block.individual_name}</span>}
            {block.partie && <span className="text-muted-foreground">({block.partie})</span>}
          </div>
          {weeks.map((w) => {
            const inRange = w.weekNum >= effStart && w.weekNum <= effEnd;
            const holiday = isHolidayWeek(w.start);
            const isStartWeek = w.weekNum === effStart;
            const isEndWeek = w.weekNum === effEnd;
            return (
              <div
                key={w.weekNum}
                className={`border-r min-h-[24px] relative ${holiday ? "bg-gray-100" : ""}`}
              >
                {inRange && (
                  <div
                    className="absolute inset-0 border-y touch-none select-none flex items-stretch"
                    style={{
                      backgroundColor: block.color + "40",
                      borderColor: block.color,
                      cursor: dragState?.id === block.id ? "grabbing" : "grab",
                    }}
                    onPointerDown={(e) => startDrag(e, block.id, "plan", "move", block.start_week, block.end_week)}
                    onClick={(e) => {
                      if (dragState?.deltaWeeks === 0 || !dragState) openEditBlock(block);
                    }}
                    title={`${block.title}${block.partie ? ` (${block.partie})` : ""} – KW ${effStart}-${effEnd} · ziehen zum Verschieben`}
                  >
                    {isStartWeek && (
                      <div
                        className="w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/60"
                        onPointerDown={(e) => startDrag(e, block.id, "plan", "resize-start", block.start_week, block.end_week)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="flex-1" />
                    {isEndWeek && (
                      <div
                        className="w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/60"
                        onPointerDown={(e) => startDrag(e, block.id, "plan", "resize-end", block.start_week, block.end_week)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        );
      })}

      {/* Neuer-Plan-Block-Zeile: Klick+Ziehen um neuen Block anzulegen */}
      <div
        data-yp-row="true"
        className="grid border-b bg-primary/5"
        style={{
          gridTemplateColumns: `minmax(140px, 200px) repeat(${weeks.length}, minmax(24px, 1fr))`,
        }}
      >
        <div className="p-1.5 border-r text-xs text-muted-foreground truncate sticky left-0 bg-card z-10 flex items-center gap-1">
          <Plus className="h-3 w-3 text-primary" />
          <span>Neuer Block (ziehen)</span>
        </div>
        {weeks.map((w) => {
          const isCreateHere = createDrag?.kind === "plan"
            && w.weekNum >= Math.min(createDrag.startWeek, createDrag.endWeek)
            && w.weekNum <= Math.max(createDrag.startWeek, createDrag.endWeek);
          return (
            <div
              key={w.weekNum}
              className={`border-r min-h-[24px] cursor-crosshair hover:bg-primary/10 ${isCreateHere ? "bg-primary/30" : ""}`}
              onPointerDown={(e) => startCreateDrag(e, "plan", w.weekNum)}
              onPointerEnter={() => { if (createDrag?.kind === "plan") updateCreateDrag(w.weekNum); }}
              title="Ziehen zum Anlegen eines neuen Blocks"
            />
          );
        })}
      </div>

      {planBlocks.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          Noch keine Grobplanungsblöcke angelegt — ziehe oben in der Zeile um einen zu erstellen
        </div>
      )}

      {/* Ressourcen Separator */}
      <div className="border-t-2 border-orange-400/50">
        <div className="flex items-center justify-between px-3 py-2 bg-orange-50 dark:bg-orange-950/20">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" /> Ressourcen
          </h3>
          <Button
            size="sm"
            variant="outline"
            disabled={resources.length === 0}
            title={resources.length === 0 ? "Zuerst Ressource anlegen" : ""}
            onClick={() => {
              setEditingResourceBlock(null);
              setResourceForm({ resourceId: "", projectId: "", color: BLOCK_COLORS[3], startWeek: "1", endWeek: "4", label: "" });
              setShowResourceDialog(true);
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Ressource einplanen
          </Button>
        </div>
      </div>

      {/* Ressourcen-Zeilen: eine Zeile pro Ressource */}
      {resources.map((resource) => {
        const blocks = resourceBlocks.filter((b) => b.resource_id === resource.id);
        return (
          <div
            key={resource.id}
            data-yp-row="true"
            className="grid border-b"
            style={{
              gridTemplateColumns: `minmax(140px, 200px) repeat(${weeks.length}, minmax(24px, 1fr))`,
            }}
          >
            <div className="p-1.5 border-r text-xs font-medium truncate sticky left-0 bg-card z-10 flex items-center gap-1.5">
              <div className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: resource.farbe || "#94A3B8" }} />
              <span className="truncate">{resource.name}</span>
            </div>
            {weeks.map((w) => {
              const holiday = isHolidayWeek(w.start);
              const cells = blocks.map((b) => {
                const { start: s, end: e } = getEffectiveRange(b.id, "resource", b.start_week, b.end_week);
                return { b, s, e };
              }).filter(({ s, e }) => w.weekNum >= s && w.weekNum <= e);
              const isCreateDragHere = createDrag?.kind === "resource"
                && createDrag.resourceId === resource.id
                && w.weekNum >= Math.min(createDrag.startWeek, createDrag.endWeek)
                && w.weekNum <= Math.max(createDrag.startWeek, createDrag.endWeek);
              const isEmpty = cells.length === 0;
              return (
                <div
                  key={w.weekNum}
                  className={`border-r min-h-[24px] relative ${holiday ? "bg-gray-100" : ""} ${isCreateDragHere ? "bg-orange-200/50" : isEmpty ? "hover:bg-orange-100/40 cursor-crosshair" : ""}`}
                  onPointerDown={(e) => { if (isEmpty) startCreateDrag(e, "resource", w.weekNum, resource.id); }}
                  onPointerEnter={() => { if (createDrag?.resourceId === resource.id) updateCreateDrag(w.weekNum); }}
                  title={isEmpty ? "Ziehen zum Einplanen" : undefined}
                >
                  {cells.map(({ b, s, e }, idx) => {
                    const projectName = b.project_id
                      ? projects.find((p) => p.id === b.project_id)?.name || "?"
                      : null;
                    const isStart = w.weekNum === s;
                    const isEnd = w.weekNum === e;
                    return (
                      <div
                        key={b.id}
                        className="absolute inset-0 border-y flex items-stretch overflow-hidden touch-none select-none"
                        style={{
                          backgroundColor: (b.color || "#F97316") + "40",
                          borderColor: b.color || "#F97316",
                          top: `${idx * 4}px`,
                          cursor: dragState?.id === b.id ? "grabbing" : "grab",
                        }}
                        onPointerDown={(event) => startDrag(event, b.id, "resource", "move", b.start_week, b.end_week)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!dragState || dragState.deltaWeeks === 0) openEditResourceBlock(b);
                        }}
                        title={`${resource.name}${projectName ? " → " + projectName : ""}${b.label ? ": " + b.label : ""} – KW ${s}-${e} · ziehen zum Verschieben`}
                      >
                        {isStart && (
                          <div
                            className="w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/60"
                            onPointerDown={(event) => startDrag(event, b.id, "resource", "resize-start", b.start_week, b.end_week)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        )}
                        <div className="flex-1 flex items-center justify-center">
                          {isStart && (
                            <span className="text-[9px] font-medium truncate px-1 text-white drop-shadow-sm">
                              {b.label || projectName || ""}
                            </span>
                          )}
                        </div>
                        {isEnd && (
                          <div
                            className="w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/60"
                            onPointerDown={(event) => startDrag(event, b.id, "resource", "resize-end", b.start_week, b.end_week)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}

      {resources.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          Noch keine Ressourcen angelegt — über "Ressourcen"-Button im Header anlegen
        </div>
      )}
    </div>

    {/* Block Editor Dialog */}
    <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editingBlock ? "Block bearbeiten" : "Neuer Planungsblock"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titel *</Label>
            <Input value={blockForm.title} onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })} placeholder="z.B. Rohbau Graz Nord" />
          </div>
          <div>
            <Label>Projekt (optional)</Label>
            <Select value={blockForm.projectId} onValueChange={(v) => setBlockForm({ ...blockForm, projectId: v })}>
              <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Kein Projekt</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Partie</Label>
              <Input value={blockForm.partie} onChange={(e) => setBlockForm({ ...blockForm, partie: e.target.value })} placeholder="Partie 1, Partie 2..." />
            </div>
            <div>
              <Label>Individueller Name</Label>
              <Input value={blockForm.individualName} onChange={(e) => setBlockForm({ ...blockForm, individualName: e.target.value })} placeholder="z.B. SEPP, MAX" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Von KW</Label>
              <Input type="number" min="1" max="53" value={blockForm.startWeek} onChange={(e) => setBlockForm({ ...blockForm, startWeek: e.target.value })} />
            </div>
            <div>
              <Label>Bis KW</Label>
              <Input type="number" min="1" max="53" value={blockForm.endWeek} onChange={(e) => setBlockForm({ ...blockForm, endWeek: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Farbe</Label>
            <div className="flex gap-1.5 mt-1">
              {BLOCK_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 ${blockForm.color === c ? "border-gray-900 ring-2 ring-offset-1 ring-gray-400" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setBlockForm({ ...blockForm, color: c })}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {editingBlock && (
            <Button variant="destructive" size="sm" onClick={() => { handleDeleteBlock(editingBlock.id); setShowBlockDialog(false); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Loeschen
            </Button>
          )}
          <Button size="sm" onClick={handleSaveBlock} disabled={!blockForm.title.trim()}>
            {editingBlock ? "Speichern" : "Block erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Resource Block Dialog */}
    <Dialog open={showResourceDialog} onOpenChange={setShowResourceDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editingResourceBlock ? "Ressource bearbeiten" : "Ressource einplanen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ressource *</Label>
            <Select value={resourceForm.resourceId} onValueChange={(v) => setResourceForm({ ...resourceForm, resourceId: v })}>
              <SelectTrigger><SelectValue placeholder="Ressource wählen..." /></SelectTrigger>
              <SelectContent>
                {resources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Von KW</Label>
              <Input type="number" min="1" max="53" value={resourceForm.startWeek} onChange={(e) => setResourceForm({ ...resourceForm, startWeek: e.target.value })} />
            </div>
            <div>
              <Label>Bis KW</Label>
              <Input type="number" min="1" max="53" value={resourceForm.endWeek} onChange={(e) => setResourceForm({ ...resourceForm, endWeek: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Projekt (nur im gleichen Zeitraum eingeplante)</Label>
            <Select value={resourceForm.projectId} onValueChange={(v) => setResourceForm({ ...resourceForm, projectId: v })}>
              <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Kein Projekt</SelectItem>
                {(() => {
                  const sw = parseInt(resourceForm.startWeek) || 1;
                  const ew = parseInt(resourceForm.endWeek) || 1;
                  const avail = getAvailableProjectsForResource(sw, ew);
                  if (avail.length === 0) {
                    return <SelectItem value="__none" disabled>Keine Projekte in diesem Zeitraum eingeplant</SelectItem>;
                  }
                  return avail.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>);
                })()}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Label (optional)</Label>
            <Input value={resourceForm.label} onChange={(e) => setResourceForm({ ...resourceForm, label: e.target.value })} placeholder="z.B. Partie 1" />
          </div>
          <div>
            <Label>Farbe</Label>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {BLOCK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`w-7 h-7 rounded-full border-2 ${resourceForm.color === c ? "border-gray-900 ring-2 ring-offset-1 ring-gray-400" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setResourceForm({ ...resourceForm, color: c })}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {editingResourceBlock && (
            <Button variant="destructive" size="sm" onClick={() => { handleDeleteResourceBlock(editingResourceBlock.id); setShowResourceDialog(false); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Löschen
            </Button>
          )}
          <Button size="sm" onClick={handleSaveResourceBlock} disabled={!resourceForm.resourceId}>
            {editingResourceBlock ? "Speichern" : "Einplanen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
