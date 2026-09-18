import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronsUp, ChevronsDown, GripVertical, Star, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { moveItemToEdge, reorderItems } from "@/lib/projectOrdering";

export type ReihenfolgeEintrag = {
  id: string;
  name: string;
  adresse?: string | null;
  /** Persoenlicher Favorit des Betrachters - bleibt in der Liste oben angepinnt. */
  favorit?: boolean;
  /** Fuer alle ausgeblendet (nur sichtbar, wenn der Admin sie einblendet). */
  versteckt?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In der Reihenfolge, wie sie gerade angezeigt wird. */
  eintraege: ReihenfolgeEintrag[];
  /** Bekommt die komplette neue Reihenfolge, lueckenlos durchnummeriert. */
  onReihenfolge: (updates: { id: string; sort_order: number }[]) => void;
  titel?: string;
  beschreibung?: string;
  /** Text, wenn die Liste leer ist. */
  leerText?: string;
};

/**
 * Kompakte Liste zum Umsortieren vieler Eintraege auf einmal - Projekte
 * (Franz, 15.09.2026) und Geraete (Franz, 16.09.2026).
 *
 * Die Karten selbst sind zu hoch, um zwanzig davon bequem zu ziehen - hier
 * steht jeder Eintrag in einer Zeile: Griff zum Ziehen, dazu "ganz nach
 * oben"/"ganz nach unten" fuer den haeufigsten Fall. Jede Aenderung wird
 * sofort gespeichert, wie die Pfeile an den Karten.
 */
export function ReihenfolgeDialog({
  open,
  onOpenChange,
  eintraege,
  onReihenfolge,
  titel = "Reihenfolge der Projekte",
  beschreibung = "Ziehen am Griff oder mit den Doppelpfeilen ganz nach oben bzw. unten. Die Reihenfolge gilt für alle – auch in der Plantafel und am Handy der Mitarbeiter.",
  leerText = "Keine aktiven Projekte.",
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const von = eintraege.findIndex((e) => e.id === active.id);
    const nach = eintraege.findIndex((e) => e.id === over.id);
    if (von < 0 || nach < 0) return;
    onReihenfolge(reorderItems(eintraege, von, nach));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
          <DialogDescription>{beschreibung}</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto -mx-1 px-1 flex-1 min-h-0">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={eintraege.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-1.5">
                {eintraege.map((eintrag, index) => (
                  <Zeile
                    key={eintrag.id}
                    eintrag={eintrag}
                    position={index + 1}
                    ganzOben={index === 0}
                    ganzUnten={index === eintraege.length - 1}
                    nachOben={() => onReihenfolge(moveItemToEdge(eintraege, eintrag.id, "top"))}
                    nachUnten={() => onReihenfolge(moveItemToEdge(eintraege, eintrag.id, "bottom"))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {eintraege.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">{leerText}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Zeile({
  eintrag,
  position,
  ganzOben,
  ganzUnten,
  nachOben,
  nachUnten,
}: {
  eintrag: ReihenfolgeEintrag;
  position: number;
  ganzOben: boolean;
  ganzUnten: boolean;
  nachOben: () => void;
  nachUnten: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: eintrag.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-card pr-1 ${
        isDragging ? "shadow-lg opacity-80 z-10 relative" : ""
      } ${eintrag.favorit ? "border-red-300 bg-red-50/60 dark:bg-red-950/20" : ""} ${
        eintrag.versteckt ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex items-center self-stretch px-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
        title="Ziehen zum Sortieren"
        aria-label={`${eintrag.name} ziehen zum Sortieren`}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <span className="w-6 text-xs text-muted-foreground tabular-nums text-right shrink-0">{position}.</span>

      <div className="flex-1 min-w-0 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {eintrag.favorit && <Star className="h-3.5 w-3.5 fill-red-500 text-red-500 shrink-0" />}
          {eintrag.versteckt && <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-sm font-medium truncate">{eintrag.name}</span>
        </div>
        {eintrag.adresse && (
          <p className="text-xs text-muted-foreground truncate">{eintrag.adresse}</p>
        )}
      </div>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={nachOben}
          disabled={ganzOben}
          className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30"
          title="Ganz nach oben"
          aria-label={`${eintrag.name} ganz nach oben`}
        >
          <ChevronsUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={nachUnten}
          disabled={ganzUnten}
          className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30"
          title="Ganz nach unten"
          aria-label={`${eintrag.name} ganz nach unten`}
        >
          <ChevronsDown className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
