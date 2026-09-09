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
  /** Siehe planRowKey */
  key: string;
  /** Projektname bzw. Blocktitel */
  label: string;
  /** Zeile gehoert zu einem Projekt (dann sind mehrere Bloecke moeglich) */
  isProject: boolean;
  blocks: T[];
  sortOrder: number;
}

/**
 * Woran haengt eine Zeile?
 *
 * In der Praxis wird die Jahresgrobplanung ueberwiegend mit FREIEN Titeln
 * gefuellt ("Derler", "Krandemontage", "Putzarbeiten") - das sind keine
 * Projekte im System, und sie sollen auch keine werden. Deshalb gruppiert
 * die Zeile nach Projekt ODER, wenn keines gesetzt ist, nach dem Titel.
 *
 * So landen "Derler KW 18-20" und "Derler KW 26-28" in einer Zeile, ohne dass
 * jemand ein Projekt anlegen muss. Gross-/Kleinschreibung und Leerzeichen am
 * Rand spielen keine Rolle. Ohne Titel bleibt es bei einer eigenen Zeile.
 */
export function planRowKey(block: PlanBlockLike): string {
  if (block.project_id) return `projekt:${block.project_id}`;
  const titel = (block.title || "").trim().toLowerCase();
  return titel ? `titel:${titel}` : `block:${block.id}`;
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
    const key = planRowKey(block);
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

/**
 * Ist die Spalte die laufende Kalenderwoche?
 *
 * Kundenwunsch (Franz, 08.09.2026): Die aktuelle Woche soll in der
 * Jahresgrobplanung dezent hervorgehoben sein.
 *
 * Verglichen wird gegen das ISO-Wochenjahr, nicht gegen das Kalenderjahr:
 * Der 01.01. kann noch zur KW 52/53 des Vorjahres gehoeren - ohne diesen
 * Vergleich waere in der Jahresansicht 2027 faelschlich die KW 53 markiert.
 */
export function istAktuelleKalenderwoche(
  weekNum: number,
  ansichtsJahr: number,
  heuteKw: number,
  heuteKwJahr: number
): boolean {
  return weekNum === heuteKw && ansichtsJahr === heuteKwJahr;
}
