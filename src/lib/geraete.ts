/**
 * Geraeteliste: Reihung und Archiv (Kundenwunsch Franz, 16.09.2026).
 *
 * Die Reihung funktioniert wie bei den Projekten (sortByPriority), das
 * Archiv wie "Abgeschlossene Projekte": archivierte Geraete verschwinden
 * aus der Hauptliste und aus Auswahlfeldern, bleiben aber samt Dokumenten
 * und Verlauf erhalten.
 */

import { sortByPriority, type PrioritizedItem } from "./projectOrdering";

export interface ArchivierbaresGeraet extends PrioritizedItem {
  archiviert_am?: string | null;
}

/** Liegt das Geraet im Archiv? Fehlender Wert = aktiv. */
export function istArchiviert(geraet: ArchivierbaresGeraet): boolean {
  return !!geraet.archiviert_am;
}

/** Aktive Geraete in Anzeigereihenfolge: Prioritaet, dann Name. */
export function aktiveGeraete<T extends ArchivierbaresGeraet>(geraete: T[]): T[] {
  return sortByPriority(geraete.filter((g) => !istArchiviert(g)));
}

/** Archivierte Geraete, zuletzt archivierte zuerst. */
export function archivierteGeraete<T extends ArchivierbaresGeraet>(geraete: T[]): T[] {
  return geraete
    .filter(istArchiviert)
    .sort((a, b) => {
      const ta = Date.parse(a.archiviert_am as string) || 0;
      const tb = Date.parse(b.archiviert_am as string) || 0;
      if (ta !== tb) return tb - ta;
      return (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" });
    });
}
