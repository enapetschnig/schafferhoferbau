import type React from "react";

// Liefert einen onKeyDown-Handler fuer die Chat-Eingabezeile, der sich an
// WhatsApp anlehnt:
// - Mobile / Touch-Geraete: Enter = neue Zeile (gar nicht abfangen). Senden
//   geschieht ausschliesslich ueber den Sende-Button.
// - Desktop: Enter = senden. Shift/Alt/Ctrl/Cmd + Enter = neue Zeile (alle
//   Modifier — analog WhatsApp Web).
export function handleChatInputKeyDown(send: () => void) {
  return (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    // Touch-Primary-Geraete (Handy, Tablet ohne Hardware-Tastatur) → niemals
    // abfangen, damit Enter wie auf WhatsApp eine Zeile macht.
    const isTouch =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) return;
    // Desktop: jeder Modifier = neue Zeile
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    send();
  };
}
