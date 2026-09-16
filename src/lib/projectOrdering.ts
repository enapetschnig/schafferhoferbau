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

/**
 * Ganz nach oben oder ganz nach unten - mit einem Klick.
 *
 * Bei zwanzig Projekten waren fuer "ganz nach oben" bis zu neunzehn
 * Einzelschritte noetig (Kundenwunsch Franz, 15.09.2026). Liefert wie
 * moveItem die komplette, lueckenlos durchnummerierte Reihenfolge.
 */
export function moveItemToEdge<T extends { id: string }>(
  items: T[],
  id: string,
  edge: "top" | "bottom"
): { id: string; sort_order: number }[] {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return items.map((i, idx) => ({ id: i.id, sort_order: idx }));
  const ziel = edge === "top" ? 0 : items.length - 1;
  return reorderItems(items, index, ziel);
}

/**
 * Element von einer Position an eine andere ziehen (Drag & Drop).
 * Alles dazwischen rueckt um eins nach; Ergebnis wie bei moveItem.
 */
export function reorderItems<T extends { id: string }>(
  items: T[],
  fromIndex: number,
  toIndex: number
): { id: string; sort_order: number }[] {
  const neu = [...items];
  const gueltig =
    fromIndex >= 0 && fromIndex < neu.length && toIndex >= 0 && toIndex < neu.length;
  if (gueltig && fromIndex !== toIndex) {
    const [element] = neu.splice(fromIndex, 1);
    neu.splice(toIndex, 0, element);
  }
  return neu.map((i, idx) => ({ id: i.id, sort_order: idx }));
}

/**
 * Prioritaet fuer ein NEUES Projekt: vor allen bestehenden.
 *
 * Ohne Wert landete ein neues Projekt ganz unten bei den Unpriorisierten -
 * dabei ist das neue meist gerade das aktuelle. Favoriten sind persoenlich
 * und bleiben ohnehin angepinnt, das neue Projekt erscheint also direkt
 * darunter (Kundenwunsch Franz, 15.09.2026).
 */
export function topSortOrder(items: PrioritizedItem[]): number {
  let kleinste: number | null = null;
  for (const item of items) {
    const p = item.sort_order;
    if (p === null || p === undefined) continue;
    if (kleinste === null || p < kleinste) kleinste = p;
  }
  return kleinste === null ? 0 : kleinste - 1;
}
