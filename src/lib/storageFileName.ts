// Konvertiert einen beliebigen Dateinamen in einen Supabase-Storage-sicheren
// ASCII-Pfad-Bestandteil. Ohne diese Konvertierung schlagen Uploads mit
// Umlauten/Sonderzeichen/sehr langen Namen sporadisch fehl, oder die
// generierte Public-URL zeigt nach dem Upload auf einen abweichenden Pfad.
// Basename und Extension werden separat sanitisiert, damit die Extension
// (z.B. ".pdf", ".jpg") auch bei sehr "krummen" Filenames erhalten bleibt.
export function sanitizeStorageFileName(name: string): string {
  if (!name) return "datei";

  // Split in basename + extension (extension nur wenn 1-8 Zeichen nach letztem Punkt)
  const lastDot = name.lastIndexOf(".");
  const hasExt = lastDot > 0 && name.length - lastDot - 1 <= 8 && name.length - lastDot - 1 >= 1;
  let base = hasExt ? name.slice(0, lastDot) : name;
  let ext = hasExt ? name.slice(lastDot + 1) : "";

  const cleanPart = (s: string): string => {
    let r = s
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss");
    // Akzente/Diakritika entfernen (é → e, à → a, ñ → n, …)
    r = r.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    // Erlaubte Zeichen: a-z A-Z 0-9 _ -
    r = r.replace(/[^a-zA-Z0-9_-]/g, "_");
    // Mehrfache Underscores zu einem
    r = r.replace(/_+/g, "_");
    // Leading/Trailing _ - entfernen
    r = r.replace(/^[_-]+|[_-]+$/g, "");
    return r;
  };

  base = cleanPart(base);
  ext = cleanPart(ext);

  if (!base) base = "datei";

  // Auf 80 Zeichen Gesamtlaenge begrenzen, Extension prioritaer behalten
  const fullLen = ext ? base.length + 1 + ext.length : base.length;
  if (fullLen > 80) {
    const allowedBase = ext ? 80 - 1 - ext.length : 80;
    base = base.slice(0, Math.max(1, allowedBase));
  }

  return ext ? `${base}.${ext}` : base;
}
