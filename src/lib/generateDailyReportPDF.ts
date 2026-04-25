import { jsPDF } from "jspdf";

export interface DailyReportForPDF {
  report_type: string;
  datum: string;
  temperatur_min: number | null;
  temperatur_max: number | null;
  wetter: string[] | null;
  beschreibung: string;
  notizen: string | null;
  sicherheitscheckliste: { id: string; label: string; checked: boolean }[] | null;
  sicherheit_bestaetigt: boolean;
  unterschrift_kunde: string | null;
  unterschrift_am: string | null;
  unterschrift_name: string | null;
  project: { name: string; adresse: string | null; plz: string | null } | null;
}

export interface ActivityForPDF {
  geschoss: string;
  beschreibung: string;
}

export interface PhotoForPDF {
  file_path: string;
  file_name: string;
}

const WETTER_LABELS_PDF: Record<string, string> = {
  sonnig: "Sonnig", bewoelkt: "Bewölkt", regen: "Regen",
  schnee: "Schnee", wind: "Wind", frost: "Frost",
};

const GESCHOSS_LABELS: Record<string, string> = {
  aussen: "Außen", keller: "Keller", eg: "EG", og: "OG", dg: "DG",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-AT", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
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

export async function generateDailyReportPDF(
  report: DailyReportForPDF,
  activities: ActivityForPDF[],
  photos: PhotoForPDF[],
  supabaseUrl: string,
  options: { returnAsBlob?: boolean } = {}
): Promise<void | Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const checkPageBreak = (needed: number) => {
    if (y + needed > 270) { doc.addPage(); y = margin; }
  };

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(61, 63, 71);
  doc.text("SCHAFFERHOFER BAU", margin, y);
  y += 8;

  doc.setDrawColor(61, 63, 71);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 5;

  const title = report.report_type === "tagesbericht" ? "Tagesbericht"
    : report.report_type === "regiebericht" ? "Regiebericht"
    : "Zwischenbericht";
  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text(title, margin, y);
  y += 12;
  doc.setTextColor(0, 0, 0);

  // Project info
  if (report.project) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(report.project.name, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (report.project.adresse) {
      doc.text(`${report.project.adresse}${report.project.plz ? `, ${report.project.plz}` : ""}`, margin, y);
      y += 5;
    }
  }

  // Date
  doc.setFontSize(10);
  doc.text(`Datum: ${formatDate(report.datum)}`, margin, y);
  y += 8;

  // Weather
  if ((report.wetter && report.wetter.length > 0) || report.temperatur_min != null) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Wetter", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (report.wetter && report.wetter.length > 0) {
      const wetterText = report.wetter.map((w) => WETTER_LABELS_PDF[w] || w).join(", ");
      doc.text(wetterText, margin, y);
      y += 5;
    }
    if (report.temperatur_min != null || report.temperatur_max != null) {
      doc.text(`Temperatur: ${report.temperatur_min ?? "–"}° / ${report.temperatur_max ?? "–"}°C`, margin, y);
      y += 5;
    }
    y += 5;
  }

  // Activities
  if (activities.length > 0) {
    checkPageBreak(20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Tätigkeiten", margin, y);
    y += 7;

    // Group by geschoss
    const grouped: Record<string, string[]> = {};
    for (const act of activities) {
      const key = act.geschoss;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(act.beschreibung);
    }

    doc.setFontSize(10);
    for (const [geschoss, items] of Object.entries(grouped)) {
      checkPageBreak(10 + items.length * 5);
      doc.setFont("helvetica", "bold");
      doc.text(GESCHOSS_LABELS[geschoss] || geschoss, margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      for (const item of items) {
        checkPageBreak(6);
        const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 5);
        doc.text(lines, margin + 3, y);
        y += lines.length * 4.5 + 1;
      }
      y += 3;
    }
    y += 3;
  }

  // Description
  if (report.beschreibung) {
    checkPageBreak(15);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Beschreibung", margin, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(report.beschreibung, contentWidth);
    checkPageBreak(lines.length * 4.5);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 3;
  }

  if (report.notizen) {
    checkPageBreak(15);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Notizen", margin, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(report.notizen, contentWidth);
    checkPageBreak(lines.length * 4.5);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 3;
  }

  // Photos
  if (photos.length > 0) {
    doc.addPage();
    y = margin;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Fotos (${photos.length})`, margin, y);
    y += 8;

    for (let i = 0; i < photos.length; i++) {
      const url = `${supabaseUrl}/storage/v1/object/public/daily-report-photos/${photos[i].file_path}`;
      const imageData = await fetchImageAsBase64(url);
      if (!imageData) continue;

      const col = i % 2;
      if (col === 0 && i > 0) y += 3;
      if (y > 200) { doc.addPage(); y = margin; }

      const xPos = margin + col * 85;
      try {
        doc.addImage(imageData, "JPEG", xPos, y, 78, 58);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(photos[i].file_name, xPos, y + 61);
        doc.setTextColor(0, 0, 0);
      } catch { /* skip broken images */ }

      if (col === 1) y += 65;
    }
    if (photos.length % 2 === 1) y += 65;
    y += 5;
  }

  // Safety checklist
  if (report.sicherheitscheckliste && report.sicherheitscheckliste.length > 0) {
    checkPageBreak(15 + report.sicherheitscheckliste.length * 6);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Sicherheitscheckliste", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    for (const item of report.sicherheitscheckliste) {
      checkPageBreak(6);
      const check = item.checked ? "[x]" : "[ ]";
      doc.text(`${check}  ${item.label}`, margin, y);
      y += 5.5;
    }

    if (report.sicherheit_bestaetigt) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 128, 0);
      doc.text("Sicherheitscheckliste vollständig bestätigt", margin, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
    } else {
      y += 5;
    }
  }

  // Signature
  if (report.unterschrift_kunde) {
    checkPageBreak(50);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Unterschrift", margin, y);
    y += 5;

    try {
      doc.addImage(report.unterschrift_kunde, "PNG", margin, y, 60, 25);
      y += 28;
    } catch {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("[Unterschrift konnte nicht geladen werden]", margin, y + 10);
      y += 20;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (report.unterschrift_name) {
      doc.text(report.unterschrift_name, margin, y);
      y += 4;
    }
    if (report.unterschrift_am) {
      doc.setTextColor(100, 100, 100);
      doc.text(new Date(report.unterschrift_am).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }), margin, y);
      doc.setTextColor(0, 0, 0);
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.text(`Erstellt am: ${new Date().toLocaleDateString("de-AT")} | Schafferhofer Bau`, margin, footerY);

  const projectSlug = report.project?.name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_") || "Projekt";
  const dateSlug = new Date(report.datum).toLocaleDateString("de-AT").replace(/\./g, "-");
  if (options.returnAsBlob) {
    return doc.output("blob");
  }
  doc.save(`${title}_${projectSlug}_${dateSlug}.pdf`);
}
