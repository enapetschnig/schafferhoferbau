/**
 * Jahresgrobplanung: mehrere zeitlich getrennte Bloecke pro Projekt.
 *
 * Frueher ergab jeder Block eine eigene Zeile - ein Projekt mit 6 Bauabschnitten
 * belegte also 6 Zeilen. Hier werden alle Bloecke desselben Projekts zu EINER
 * Zeile zusammengefasst, so wie es die Ressourcen-Sektion schon macht.
 *
 * Bloecke ohne Projekt (freie Bloecke) behalten je eine eigene Zeile.
 */

export interface PlanBlockLike {
  id: string;
  project_id: string | null;
  title: string;
  individual_name?: string | null;
  partie?: string | null;
  start_week: number;
  end_week: number;
  sort_order: number;
  color?: string | null;
}

export interface PlanRow<T extends PlanBlockLike> {
  /** project_id, oder bei freien Bloecken die Block-ID */
  key: string;
  /** Projektname bzw. Blocktitel */
  label: string;
  /** Zeile gehoert zu einem Projekt (dann sind mehrere Bloecke moeglich) */
  isProject: boolean;
  blocks: T[];
  sortOrder: number;
}

/** Beschriftung, die direkt IM Farbblock steht. */
export function blockLabel(block: PlanBlockLike): string {
  return (block.individual_name || "").trim() || block.title || "";
}

/** Ein Block belegt so viele Wochen - bestimmt, ob Text hineinpasst. */
export function blockWeekSpan(block: PlanBlockLike): number {
  return Math.max(1, block.end_week - block.start_week + 1);
}

/**
 * Ueberschneiden sich zwei Bloecke zeitlich? Innerhalb einer Projektzeile
 * werden ueberlappende Bloecke gestapelt statt uebereinandergelegt.
 */
export function blocksOverlap(a: PlanBlockLike, b: PlanBlockLike): boolean {
  return a.start_week <= b.end_week && b.start_week <= a.end_week;
}

/**
 * Weist jedem Block innerhalb einer Zeile eine Stapel-Ebene zu. Bloecke, die
 * sich nicht ueberschneiden, teilen sich Ebene 0 - der Normalfall bei zeitlich
 * getrennten Bauabschnitten.
 */
export function assignStackLevels<T extends PlanBlockLike>(blocks: T[]): Map<string, number> {
  const sortiert = [...blocks].sort((a, b) => a.start_week - b.start_week);
  const ebenen: T[][] = [];
  const zuordnung = new Map<string, number>();

  for (const block of sortiert) {
    let platziert = false;
    for (let i = 0; i < ebenen.length; i++) {
      if (!ebenen[i].some((vorhanden) => blocksOverlap(vorhanden, block))) {
        ebenen[i].push(block);
        zuordnung.set(block.id, i);
        platziert = true;
        break;
      }
    }
    if (!platziert) {
      ebenen.push([block]);
      zuordnung.set(block.id, ebenen.length - 1);
    }
  }

  return zuordnung;
}

/**
 * Fasst Bloecke zu Zeilen zusammen: eine Zeile je Projekt, freie Bloecke je
 * eigene Zeile. Sortierung nach der kleinsten sort_order der Zeile, bei
 * Gleichstand alphabetisch.
 */
export function groupPlanBlocksByRow<T extends PlanBlockLike>(
  blocks: T[],
  projectName: (projectId: string) => string | undefined
): PlanRow<T>[] {
  const rows = new Map<string, PlanRow<T>>();

  for (const block of blocks) {
    const key = block.project_id || block.id;
    const isProject = !!block.project_id;
    const label = isProject
      ? projectName(block.project_id as string) || block.title || "Unbekanntes Projekt"
      : block.title || "Ohne Titel";

    const vorhanden = rows.get(key);
    if (vorhanden) {
      vorhanden.blocks.push(block);
      vorhanden.sortOrder = Math.min(vorhanden.sortOrder, block.sort_order ?? 0);
    } else {
      rows.set(key, {
        key,
        label,
        isProject,
        blocks: [block],
        sortOrder: block.sort_order ?? 0,
      });
    }
  }

  const liste = [...rows.values()];
  for (const row of liste) {
    row.blocks.sort((a, b) => a.start_week - b.start_week);
  }

  return liste.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.label.localeCompare(b.label, "de", { sensitivity: "base" })
  );
}
