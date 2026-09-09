/**
 * Datums-Helfer fuer die Anzeige.
 *
 * HINTERGRUND: `date.toISOString().split("T")[0]` ist in Oesterreich FALSCH.
 * toISOString rechnet nach UTC um; lokale Mitternacht wird dadurch zum Vortag
 * (Sommerzeit UTC+2, Winterzeit UTC+1). Aus Do 10.09. 00:00 lokal wird
 * "2026-09-09". Genau das war der Fehler in der Plantafel: Ein Klick auf den
 * ersten Tag eines Blocks zeigte den Vortag - und damit "kein Mitarbeiter
 * eingeteilt".
 */

/** Kalendertag als yyyy-MM-dd in LOKALER Zeit - nie ueber toISOString. */
export function localDateString(d: Date): string {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

/**
 * Zeitfenster der Dashboard-Einteilung.
 *
 * Kundenwunsch 06.09.2026: Die Ansicht soll in der Nacht Samstag->Sonntag um
 * 00:00 auf die kommende Woche umspringen, damit man schon am Sonntag sieht,
 * was ansteht. Gezeigt werden 8 Tage - Sonntag bis einschliesslich des
 * folgenden Sonntags -, das passt genau in die zwei Zeilen zu je vier Spalten.
 *
 * Die Kalenderwoche im Titel ist die der ARBEITSWOCHE im Fenster (also die des
 * Montags danach), nicht die des Start-Sonntags.
 */
export function dashboardWeekWindow(now: Date): {
  start: Date;
  end: Date;
  days: Date[];
  /** Montag der Arbeitswoche - Grundlage fuer die KW-Anzeige */
  arbeitswocheStart: Date;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay(): 0 = Sonntag. Zurueck zum letzten Sonntag (heute, falls Sonntag).
  start.setDate(start.getDate() - start.getDay());

  const days = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const arbeitswocheStart = new Date(start);
  arbeitswocheStart.setDate(start.getDate() + 1); // Montag

  return { start, end: days[days.length - 1], days, arbeitswocheStart };
}

/**
 * Datum mit Uhrzeit, oesterreichisches Format: "08.09.2026, 14:23".
 *
 * Kundenwunsch (Franz, 08.09.2026): Bei hochgeladenen Dateien stand nur das
 * Datum - bei mehreren Fotos am selben Tag half das nicht weiter.
 * Ungueltige Werte ergeben einen leeren Text statt "Invalid Date".
 */
export function datumMitUhrzeit(wert: string | Date | null | undefined): string {
  if (!wert) return "";
  const d = wert instanceof Date ? wert : new Date(wert);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
