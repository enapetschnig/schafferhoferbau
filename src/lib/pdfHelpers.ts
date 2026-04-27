import type { jsPDF } from "jspdf";

/**
 * Laedt das Schafferhofer-Logo als Base64-DataURL.
 */
export async function fetchLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch(`${window.location.origin}/schafferhofer-logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Standardisierter PDF-Header mit Logo links + Firmen-Adresse rechts + Akzent-Linie.
 * Setzt y auf die Position direkt unter dem Header (verwendbar fuer Titel etc.).
 *
 * @returns die neue y-Position
 */
export async function addPdfHeader(
  doc: jsPDF,
  options: { startY?: number; margin?: number } = {}
): Promise<number> {
  const margin = options.margin ?? 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 2 * margin;
  const headerStartY = options.startY ?? margin;

  const logoBase64 = await fetchLogoBase64();
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", margin, headerStartY - 2, 36, 16);
    } catch {
      /* skip */
    }
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Schafferhofer Bau GmbH", pageWidth - margin, headerStartY + 1, { align: "right" });
  doc.setFontSize(8);
  doc.text("Frojacher Straße 5, 8841 Frojach", pageWidth - margin, headerStartY + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);

  let y = headerStartY + 18;

  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.2);
  doc.line(margin, y, margin + contentWidth, y);
  y += 7;

  return y;
}

/**
 * Akzentuierter Sektion-Header (Bau-Orange-Hintergrund, weisse Schrift).
 * Ruft optional checkPageBreak auf — der Caller kann auch selbst Page-Break-Logik machen.
 */
export function addSectionHeader(
  doc: jsPDF,
  label: string,
  y: number,
  margin: number,
  contentWidth: number
): number {
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, y - 4, contentWidth, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(label, margin + 2, y + 1);
  doc.setTextColor(0, 0, 0);
  return y + 7;
}
