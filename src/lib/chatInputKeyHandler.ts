import type React from "react";

/**
 * onKeyDown-Handler fuer die Chat-Eingabezeile, angelehnt an WhatsApp:
 *
 * - Touch-Geraete: Enter = neue Zeile (gar nicht abfangen). Gesendet wird
 *   ausschliesslich ueber den Sende-Knopf.
 * - Desktop: Enter = senden. Umschalt/Strg/Alt/Cmd + Enter = neue Zeile.
 *
 * WICHTIG (gemeldet von Franz, 10.09.2026): Nur Umschalt+Enter erzeugt im
 * Textfeld von sich aus eine neue Zeile. Bei Strg+Enter und Alt+Enter tut der
 * Browser NICHTS - den Handler einfach zurueckkehren zu lassen genuegt also
 * nicht. Fuer diese Tasten fuegen wir den Zeilenumbruch selbst an der
 * Cursorposition ein.
 *
 * @param send        wird bei Enter ohne Zusatztaste aufgerufen
 * @param setzeText   Setter des kontrollierten Eingabefelds. Ohne ihn bleibt
 *                    es beim alten Verhalten (nur Umschalt+Enter bricht um).
 */
export function handleChatInputKeyDown(
  send: () => void,
  setzeText?: (wert: string) => void
) {
  return (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    // Touch-Primary-Geraete (Handy, Tablet ohne Hardware-Tastatur) → niemals
    // abfangen, damit Enter wie auf WhatsApp eine Zeile macht.
    const isTouch =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) return;

    // Umschalt+Enter: der Browser macht die neue Zeile selbst.
    if (e.shiftKey) return;

    // Strg/Alt/Cmd+Enter: Umbruch selbst einfuegen.
    if (e.ctrlKey || e.altKey || e.metaKey) {
      const feld = e.currentTarget as HTMLTextAreaElement | HTMLInputElement;
      // Bei einzeiligen Feldern gibt es nichts umzubrechen.
      const mehrzeilig = feld?.tagName === "TEXTAREA";
      if (!mehrzeilig || !setzeText) return;

      e.preventDefault();
      const start = feld.selectionStart ?? feld.value.length;
      const ende = feld.selectionEnd ?? start;
      const neu = feld.value.slice(0, start) + "\n" + feld.value.slice(ende);
      setzeText(neu);

      // Cursor hinter den Umbruch setzen, nachdem React neu gerendert hat.
      const position = start + 1;
      requestAnimationFrame(() => {
        try {
          feld.selectionStart = position;
          feld.selectionEnd = position;
        } catch {
          // Feld kann inzwischen weg sein - dann ist die Position egal.
        }
      });
      return;
    }

    e.preventDefault();
    send();
  };
}
