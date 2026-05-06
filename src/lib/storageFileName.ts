// Konvertiert einen beliebigen Dateinamen in einen Supabase-Storage-sicheren
// ASCII-Pfad-Bestandteil. Ohne diese Konvertierung schlagen Uploads mit
// Umlauten/Sonderzeichen/sehr langen Namen sporadisch fehl, oder die
// generierte Public-URL zeigt nach dem Upload auf einen abweichenden Pfad.
export function sanitizeStorageFileName(name: string): string {
  if (!name) return "datei";

  let s = name
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");

  // Akzent-/Diakritika-Entfernung (é → e, à → a, ñ → n, …)
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

  // Erlaubte Zeichen: a-z A-Z 0-9 . _ -
  s = s.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Mehrfache Underscores zu einem
  s = s.replace(/_+/g, "_");

  // Fuehrende/abschliessende _ - . entfernen
  s = s.replace(/^[_.-]+|[_.-]+$/g, "");

  if (!s) return "datei";

  // Auf 80 Zeichen kuerzen, Extension bewahren
  if (s.length > 80) {
    const lastDot = s.lastIndexOf(".");
    if (lastDot > 0 && s.length - lastDot <= 8) {
      const ext = s.slice(lastDot);
      s = s.slice(0, 80 - ext.length) + ext;
    } else {
      s = s.slice(0, 80);
    }
  }

  return s;
}
