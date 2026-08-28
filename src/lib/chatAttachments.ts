/**
 * Anhaenge im Chat (Projekt- und Firmen-Chat).
 *
 * Die Spalte `image_url` haelt historisch alle Anhangstypen - beim Rendern
 * wird anhand der Dateiendung unterschieden. Diese Unterscheidung lag frueher
 * mehrfach inline in den Chat-Komponenten; hier steht sie einmal zentral.
 */

export type AttachmentKind = "image" | "pdf" | "video";

/** Im Browser abspielbar bzw. zumindest herunterladbar. */
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp|3g2)$/i;
const PDF_EXT = /\.pdf$/i;

/** Endungen, die als Anhang erlaubt sind. */
export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

/** Wert fuer das accept-Attribut des Datei-Dialogs. */
export const CHAT_FILE_ACCEPT =
  "image/*,video/*,application/pdf,.pdf,.mp4,.mov,.m4v,.webm,.3gp";

/**
 * Supabase begrenzt Uploads zusaetzlich projektweit (Standard 50 MB). Ein
 * hoeherer Wert hier bringt nichts, solange das Projektlimit nicht ebenfalls
 * angehoben wird - deshalb bewusst gleich gewaehlt.
 */
export const MAX_CHAT_FILE_SIZE = 50 * 1024 * 1024;

/** Anhangstyp aus einer gespeicherten URL (oder einem Storage-Pfad). */
export function attachmentKindFromUrl(url: string): AttachmentKind {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Kein absoluter URL - dann direkt auf dem uebergebenen String pruefen
  }
  if (PDF_EXT.test(path)) return "pdf";
  if (VIDEO_EXT.test(path)) return "video";
  return "image";
}

/** Anhangstyp einer noch nicht hochgeladenen Datei. */
export function attachmentKindFromFile(file: File): AttachmentKind {
  if (file.type === "application/pdf" || PDF_EXT.test(file.name)) return "pdf";
  if (file.type.startsWith("video/") || VIDEO_EXT.test(file.name)) return "video";
  return "image";
}

export function isVideoUrl(url: string): boolean {
  return attachmentKindFromUrl(url) === "video";
}

export function isPdfUrl(url: string): boolean {
  return attachmentKindFromUrl(url) === "pdf";
}

export interface RejectedFile {
  name: string;
  reason: string;
}

export interface ValidationResult {
  accepted: File[];
  rejected: RejectedFile[];
}

/** Menschenlesbare Groesse fuer Fehlermeldungen. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Prueft eine Mehrfachauswahl. Gute Dateien werden durchgelassen, schlechte
 * einzeln gemeldet - eine zu grosse Datei soll die anderen vier nicht
 * mitreissen.
 */
export function validateChatFiles(
  files: File[],
  maxSize = MAX_CHAT_FILE_SIZE
): ValidationResult {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    const kind = attachmentKindFromFile(file);
    const extOk =
      IMAGE_EXT.test(file.name) || VIDEO_EXT.test(file.name) || PDF_EXT.test(file.name);
    const typeOk =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type === "application/pdf" ||
      file.type === ""; // Handy-Kamera liefert teils einen leeren MIME-Typ

    if (!extOk || !typeOk) {
      rejected.push({ name: file.name, reason: "Dateityp nicht unterstützt" });
      continue;
    }
    if (file.size > maxSize) {
      rejected.push({
        name: file.name,
        reason: `zu groß (${formatFileSize(file.size)}, max. ${formatFileSize(maxSize)})`,
      });
      continue;
    }
    // kind wird spaeter fuer Spiegelung/Rendering gebraucht - hier nur validiert
    void kind;
    accepted.push(file);
  }

  return { accepted, rejected };
}

/** Kurztext fuer Benachrichtigungen bei einer Mehrfachauswahl. */
export function attachmentSummary(files: File[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) {
    const kind = attachmentKindFromFile(files[0]);
    if (kind === "pdf") return "📎 PDF gesendet";
    if (kind === "video") return "🎥 Video gesendet";
    return "📷 Foto gesendet";
  }
  return `📎 ${files.length} Dateien gesendet`;
}
