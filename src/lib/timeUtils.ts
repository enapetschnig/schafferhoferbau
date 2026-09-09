// Schnappt einen Time-String "HH:MM" auf den naechsten 15-Min-Schritt.
// Leerstring oder ungueltige Werte werden unveraendert zurueckgegeben,
// damit der User waehrend des Tippens nicht "festsitzt".
export function snapTimeTo15(timeStr: string): string {
  if (!timeStr) return timeStr;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return timeStr;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return timeStr;
  const total = h * 60 + min;
  const snapped = Math.round(total / 15) * 15;
  const newH = Math.min(23, Math.floor(snapped / 60));
  const newM = snapped % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/**
 * Minuten aus "HH:MM". Ungueltige Eingaben ergeben null.
 */
export function minutenAusZeit(zeit: string | null | undefined): number | null {
  if (!zeit) return null;
  const m = zeit.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Tatsaechlich abzuziehende Pausenminuten.
 *
 * GEMELDET (Franz, 09.09.2026): Beginn 07:00, Ende 12:00, Pause 12:00-12:30 -
 * angezeigt wurden 4,50 h statt 5,00 h. Die Pause lag komplett NACH der
 * Arbeitszeit, wurde aber trotzdem abgezogen.
 *
 * Richtig ist die Schnittmenge: Nur der Teil der Pause, der wirklich INNERHALB
 * der Arbeitszeit liegt, zaehlt. Eine Pause davor oder danach zieht nichts ab,
 * eine teilweise ueberlappende nur anteilig.
 */
export function pausenAbzugMinuten(
  beginn: string | null | undefined,
  ende: string | null | undefined,
  pauseVon: string | null | undefined,
  pauseBis: string | null | undefined
): number {
  const start = minutenAusZeit(beginn);
  const stop = minutenAusZeit(ende);
  const pStart = minutenAusZeit(pauseVon);
  const pStop = minutenAusZeit(pauseBis);

  if (start === null || stop === null || pStart === null || pStop === null) return 0;
  if (stop <= start) return 0;   // keine Arbeitszeit
  if (pStop <= pStart) return 0; // keine oder verdrehte Pause

  // Schnittmenge von Arbeitszeit und Pause
  const von = Math.max(start, pStart);
  const bis = Math.min(stop, pStop);
  return Math.max(0, bis - von);
}

/**
 * Liegt die eingetragene Pause ganz oder teilweise ausserhalb der Arbeitszeit?
 * Dient nur dem Hinweis in der Oberflaeche - gerechnet wird ueber
 * pausenAbzugMinuten.
 */
export function pauseAusserhalbArbeitszeit(
  beginn: string | null | undefined,
  ende: string | null | undefined,
  pauseVon: string | null | undefined,
  pauseBis: string | null | undefined
): boolean {
  const pStart = minutenAusZeit(pauseVon);
  const pStop = minutenAusZeit(pauseBis);
  if (pStart === null || pStop === null || pStop <= pStart) return false;

  const gesamt = pStop - pStart;
  return pausenAbzugMinuten(beginn, ende, pauseVon, pauseBis) < gesamt;
}

/**
 * Netto-Stunden eines Zeitblocks: Arbeitszeit minus der Pause, die wirklich
 * hineinfaellt.
 */
export function blockStunden(
  beginn: string | null | undefined,
  ende: string | null | undefined,
  pauseVon: string | null | undefined,
  pauseBis: string | null | undefined
): number {
  const start = minutenAusZeit(beginn);
  const stop = minutenAusZeit(ende);
  if (start === null || stop === null || stop <= start) return 0;
  const netto = stop - start - pausenAbzugMinuten(beginn, ende, pauseVon, pauseBis);
  return Math.max(0, netto / 60);
}
