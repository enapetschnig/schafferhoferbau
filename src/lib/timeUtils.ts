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
