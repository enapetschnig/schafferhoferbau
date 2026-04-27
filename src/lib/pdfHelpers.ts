import type { jsPDF } from "jspdf";

/**
 * Markenfarbe Schafferhofer Bau (HSL 2,96%,43% ≈ rgb(215, 30, 20)).
 * Dezent eingesetzt: nur fuer Akzent-Linien und Sektions-Ueberschriften.
 */
export const BRAND_RED: [number, number, number] = [215, 30, 20];
export const TEXT_DARK: [number, number, number] = [40, 40, 40];
export const TEXT_MUTED: [number, number, number] = [110, 110, 110];
export const RULE_LIGHT: [number, number, number] = [220, 220, 220];

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
 * Standardisierter PDF-Header — dezent.
 * Logo links, Firmendaten rechts, duenne rote Akzent-Linie.
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
  // Logo-Aspect-Ratio einhalten: Hoehe fix, Breite proportional
  const logoHeight = 14;
  let logoWidth = 36; // Fallback
  if (logoBase64) {
    try {
      const props = (doc as any).getImageProperties(logoBase64);
      if (props?.width && props?.height) {
        logoWidth = (props.width / props.height) * logoHeight;
      }
      doc.addImage(logoBase64, "PNG", margin, headerStartY - 1, logoWidth, logoHeight);
    } catch {
      /* skip */
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Schafferhofer Bau GmbH", pageWidth - margin, headerStartY + 1, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Leobner Str. 58, 8600 Bruck an der Mur", pageWidth - margin, headerStartY + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);

  let y = headerStartY + Math.max(16, logoHeight + 4);

  // Duenne Akzent-Linie in Markenrot (subtil, nicht gefuellte Flaeche)
  doc.setDrawColor(...BRAND_RED);
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  return y;
}

/**
 * Section-Header — dezent: kleiner uppercase-Titel in Rot,
 * darunter eine duenne hellgraue Trennlinie.
 */
export function addSectionHeader(
  doc: jsPDF,
  label: string,
  y: number,
  margin: number,
  contentWidth: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_RED);
  doc.text(label.toUpperCase(), margin, y);
  y += 2;
  doc.setDrawColor(...RULE_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentWidth, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  return y + 4;
}
