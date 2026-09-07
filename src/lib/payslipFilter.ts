/**
 * Lohnzettel nach Zeitraum filtern.
 *
 * Kundenwunsch 07.09.2026: Die Liste wird mit den Jahren immer laenger.
 * Standardmaessig soll nur das laufende Jahr erscheinen, dazu eine gezielte
 * Suche nach Jahr und Monat.
 *
 * Der Zeitraum steckt im Dateinamen, den der Sammel-Upload vergibt:
 *   Vorname_Nachname_Lohnzettel_MM_JJJJ.pdf
 * Aeltere Dateien haben nur einen Zeitstempel-Praefix - fuer die wird auf das
 * Hochladedatum zurueckgegriffen.
 */

export interface PayslipLike {
  name: string;
  created_at?: string;
}

export interface Zeitraum {
  jahr: number;
  /** 1-12, oder null wenn nur das Jahr bekannt ist */
  monat: number | null;
}

/**
 * Monat/Jahr aus dem Dateinamen. Bewusst auf `_MM_JJJJ` verankert, damit der
 * Zeitstempel-Praefix aelterer Dateien (13-stellig) nicht mitgelesen wird.
 * Bei mehreren Treffern gilt der letzte - der steht am Dateiende.
 */
export function zeitraumAusName(name: string): Zeitraum | null {
  const ohneEndung = name.replace(/\.[^.]+$/, "");
  const treffer = [...ohneEndung.matchAll(/_(0[1-9]|1[0-2])_(20\d{2})(?!\d)/g)];
  if (treffer.length === 0) return null;
  const letzter = treffer[treffer.length - 1];
  return { jahr: Number(letzter[2]), monat: Number(letzter[1]) };
}

/** Zeitraum eines Lohnzettels; faellt auf das Hochladedatum zurueck. */
export function zeitraumVon(doc: PayslipLike): Zeitraum | null {
  const ausName = zeitraumAusName(doc.name);
  if (ausName) return ausName;
  if (!doc.created_at) return null;
  const d = new Date(doc.created_at);
  if (Number.isNaN(d.getTime())) return null;
  return { jahr: d.getFullYear(), monat: d.getMonth() + 1 };
}

/** Alle vorkommenden Jahre, neueste zuerst. */
export function verfuegbareJahre(docs: PayslipLike[]): number[] {
  const jahre = new Set<number>();
  for (const d of docs) {
    const z = zeitraumVon(d);
    if (z) jahre.add(z.jahr);
  }
  return [...jahre].sort((a, b) => b - a);
}

export const ALLE = "alle";

export interface FilterEinstellung {
  /** Jahr als Text, oder ALLE */
  jahr: string;
  /** Monat als Text (1-12), oder ALLE */
  monat: string;
  /** Freitext ueber den Dateinamen */
  suche: string;
}

/**
 * Wendet Jahr, Monat und Suchtext an.
 *
 * Dateien ohne erkennbaren Zeitraum verschwinden bei einer Jahres- oder
 * Monatsauswahl NICHT stillschweigend - sie tauchen unter "Alle" auf, damit
 * nichts unauffindbar wird.
 */
export function filterPayslips<T extends PayslipLike>(
  docs: T[],
  filter: FilterEinstellung
): T[] {
  const suche = filter.suche.trim().toLowerCase();

  return docs.filter((d) => {
    if (suche && !d.name.toLowerCase().includes(suche)) return false;

    if (filter.jahr === ALLE && filter.monat === ALLE) return true;

    const z = zeitraumVon(d);
    if (!z) return false; // ohne Zeitraum nur unter "Alle" sichtbar

    if (filter.jahr !== ALLE && z.jahr !== Number(filter.jahr)) return false;
    if (filter.monat !== ALLE && z.monat !== Number(filter.monat)) return false;
    return true;
  });
}

export const MONATE = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Anzeige "August 2026" bzw. nur das Jahr, wenn der Monat unbekannt ist. */
export function zeitraumLabel(doc: PayslipLike): string {
  const z = zeitraumVon(doc);
  if (!z) return "Ohne Zeitraum";
  if (!z.monat) return String(z.jahr);
  return `${MONATE[z.monat - 1]} ${z.jahr}`;
}
