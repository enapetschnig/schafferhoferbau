/**
 * Sortierung der Berichteliste (Bautagesberichte).
 *
 * Datum wird serverseitig sortiert; nach Baustelle muss im Client sortiert
 * werden, weil der Projektname aus der Join-Tabelle `projects` stammt.
 */

export type SortOrder = "desc" | "asc" | "baustelle" | "baustelle_desc";

export interface SortableReport {
  datum?: string | null;
  projects?: { name?: string | null } | null;
}

/** Baustellenname eines Berichts - leer, wenn kein Projekt verknuepft ist. */
export function reportProjectName(report: SortableReport): string {
  return report.projects?.name?.trim() || "";
}

/**
 * Sortiert nach Baustelle (deutsche Sortierung, Gross-/Kleinschreibung egal).
 * Innerhalb einer Baustelle bleibt es beim neuesten Datum zuerst, damit die
 * Gruppen fuer sich wieder chronologisch lesbar sind.
 *
 * Berichte ohne Baustelle landen immer am Ende - auch bei Z-A, weil "kein
 * Projekt" keine Sortierposition im Alphabet hat.
 */
export function sortReportsByProject<T extends SortableReport>(
  reports: T[],
  direction: "asc" | "desc" = "asc"
): T[] {
  const factor = direction === "desc" ? -1 : 1;

  return [...reports].sort((a, b) => {
    const nameA = reportProjectName(a);
    const nameB = reportProjectName(b);

    if (!nameA && !nameB) return compareDateDesc(a, b);
    if (!nameA) return 1;
    if (!nameB) return -1;

    const byName = nameA.localeCompare(nameB, "de", { sensitivity: "base" });
    if (byName !== 0) return byName * factor;

    return compareDateDesc(a, b);
  });
}

/** Neuestes Datum zuerst; fehlende Daten ans Ende. */
function compareDateDesc(a: SortableReport, b: SortableReport): number {
  const dateA = a.datum || "";
  const dateB = b.datum || "";
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  return dateB.localeCompare(dateA);
}

/** Wendet die gewaehlte Reihenfolge an. Datums-Sortierung kommt vom Server. */
export function applySortOrder<T extends SortableReport>(
  reports: T[],
  sortOrder: SortOrder
): T[] {
  if (sortOrder === "baustelle") return sortReportsByProject(reports, "asc");
  if (sortOrder === "baustelle_desc") return sortReportsByProject(reports, "desc");
  return reports;
}
