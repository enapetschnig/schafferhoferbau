/**
 * Normalisiert die EXIF-Orientation eines Bildes:
 * - iPhone/Android Kameras speichern die Orientation meist als EXIF-Tag statt
 *   die Pixeldaten zu drehen. In manchen Kontexten wird das ignoriert
 *   (z.B. beim Einbetten in PDFs, im Canvas-Rendering).
 * - Diese Funktion backt die Rotation in die Pixel-Daten ein, sodass das
 *   Bild in jedem Viewer korrekt dargestellt wird.
 *
 * Nutzt `createImageBitmap(file, { imageOrientation: "from-image" })` — das
 * respektiert EXIF automatisch und ist browser-nativ (keine Lib noetig).
 */
export async function normalizeImageOrientation(file: File): Promise<File> {
  // Nur Bilder bearbeiten (PDFs etc. unveraendert zurueckgeben)
  if (!file.type.startsWith("image/")) return file;
  // SVG/GIF nicht anfassen
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const quality = outputType === "image/jpeg" ? 0.92 : undefined;

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, outputType, quality)
    );
    if (!blob) return file;

    return new File([blob], file.name, {
      type: outputType,
      lastModified: Date.now(),
    });
  } catch {
    // Browser ohne createImageBitmap oder Datei-Problem: Original-File
    return file;
  }
}
