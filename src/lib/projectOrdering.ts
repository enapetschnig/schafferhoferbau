/**
 * Reihenfolge und Sichtbarkeit von Projekten und Plantafel-Mitarbeitern.
 *
 * Beides sind Admin-Einstellungen, die fuer ALLE gelten - auch fuer die
 * Mitarbeiter-Apps am Handy. Damit die Listen ueberall gleich aussehen, laeuft
 * jede Anzeige durch diese Funktionen.
 */

export interface PrioritizedItem {
  /** Kleinere Zahl = weiter oben. NULL/undefined = keine Prioritaet. */
  sort_order?: number | null;
  name?: string | null;
}

export interface HideableProject extends PrioritizedItem {
  in_app_sichtbar?: boolean | null;
}

/**
 * Sortiert nach Prioritaet, dann alphabetisch.
 *
 * Projekte ohne Prioritaet landen IMMER hinter den priorisierten - eine
 * fehlende Prioritaet ist "nicht eingeordnet", nicht "Prioritaet 0".
 */
export function sortByPriority<T extends PrioritizedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pa = a.sort_order;
    const pb = b.sort_order;
    const hasA = pa !== null && pa !== undefined;
    const hasB = pb !== null && pb !== undefined;

    if (hasA && hasB && pa !== pb) return (pa as number) - (pb as number);
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;

    return (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" });
  });
}

/** Ist das Projekt fuer normale Ansichten sichtbar? Fehlender Wert = sichtbar. */
export function isProjectVisible(project: HideableProject): boolean {
  return project.in_app_sichtbar !== false;
}

/**
 * Blendet ausgeblendete Projekte aus und sortiert nach Prioritaet.
 *
 * @param includeHidden Administratoren koennen ausgeblendete mit einblenden -
 *   sonst gaebe es keinen Weg, sie wieder sichtbar zu schalten.
 */
export function visibleSortedProjects<T extends HideableProject>(
  projects: T[],
  includeHidden = false
): T[] {
  const relevant = includeHidden ? projects : projects.filter(isProjectVisible);
  return sortByPriority(relevant);
}

export interface HideableProfile extends PrioritizedItem {
  plantafel_sichtbar?: boolean | null;
  vorname?: string | null;
  nachname?: string | null;
}

/** Anzeigename fuer die Sortierung: "Nachname Vorname". */
export function profileSortName(profile: HideableProfile): string {
  return `${profile.nachname || ""} ${profile.vorname || ""}`.trim();
}

/**
 * Plantafel-Mitarbeiter: ausgeblendete raus, Rest nach profiles.sort_order,
 * bei Gleichstand nach Nachname.
 */
export function visibleSortedProfiles<T extends HideableProfile>(
  profiles: T[],
  includeHidden = false
): T[] {
  const relevant = includeHidden
    ? profiles
    : profiles.filter((p) => p.plantafel_sichtbar !== false);

  return [...relevant].sort((a, b) => {
    const pa = a.sort_order;
    const pb = b.sort_order;
    const hasA = pa !== null && pa !== undefined;
    const hasB = pb !== null && pb !== undefined;

    if (hasA && hasB && pa !== pb) return (pa as number) - (pb as number);
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;

    return profileSortName(a).localeCompare(profileSortName(b), "de", {
      sensitivity: "base",
    });
  });
}

/**
 * Neue Prioritaet beim Verschieben um eine Position.
 * Gibt die komplette neue Reihenfolge als [id, sort_order] zurueck - so wird
 * die Liste beim Speichern lueckenlos neu durchnummeriert.
 */
export function moveItem<T extends { id: string }>(
  items: T[],
  id: string,
  direction: "up" | "down"
): { id: string; sort_order: number }[] {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return items.map((i, idx) => ({ id: i.id, sort_order: idx }));

  const ziel = direction === "up" ? index - 1 : index + 1;
  if (ziel < 0 || ziel >= items.length) {
    // Am Rand: Reihenfolge unveraendert, aber sauber durchnummeriert
    return items.map((i, idx) => ({ id: i.id, sort_order: idx }));
  }

  const neu = [...items];
  [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
  return neu.map((i, idx) => ({ id: i.id, sort_order: idx }));
}
