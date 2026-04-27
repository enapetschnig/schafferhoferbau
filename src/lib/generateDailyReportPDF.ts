import { jsPDF } from "jspdf";
import { addPdfHeader, addSectionHeader } from "./pdfHelpers";

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
  zeit_auf_pdf?: boolean;
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

export interface TimeEntryForPDF {
  user_name?: string;
  start_time: string | null;
  end_time: string | null;
  pause_minutes: number | null;
  stunden: number;
  taetigkeit: string | null;
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
  options: { returnAsBlob?: boolean; timeEntries?: TimeEntryForPDF[] } = {}
): Promise<void | Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const checkPageBreak = (needed: number) => {
    if (y + needed > 270) { doc.addPage(); y = margin; }
  };

  // Section-Header-Helper: dezent (siehe pdfHelpers)
  const sectionHeader = (label: string) => {
    checkPageBreak(10);
    y = addSectionHeader(doc, label, y, margin, contentWidth);
  };

  // Standardisierter Header mit Logo + Akzent-Linie
  y = await addPdfHeader(doc, { startY: y, margin });

  // Titel
  const title = report.report_type === "tagesbericht" ? "Tagesbericht"
    : report.report_type === "regiebericht" ? "Regiebericht"
    : "Zwischenbericht";
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text(title, margin, y);
  y += 8;
  doc.setTextColor(0, 0, 0);

  // Projekt-Info — Zwei-Spalten ohne Card, dezent
  if (report.project) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.text("Projekt", margin, y);
    doc.text("Datum", pageWidth / 2, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(report.project.name, margin, y);
    doc.text(formatDate(report.datum), pageWidth / 2, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    if (report.project.adresse) {
      doc.text(`${report.project.adresse}${report.project.plz ? `, ${report.project.plz}` : ""}`, margin, y);
      y += 5;
    }
    doc.setTextColor(0, 0, 0);
    y += 4;
  } else {
    doc.setFontSize(10);
    doc.text(`Datum: ${formatDate(report.datum)}`, margin, y);
    y += 8;
  }

  // Wetter
  if ((report.wetter && report.wetter.length > 0) || report.temperatur_min != null) {
    sectionHeader("Wetter");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const parts: string[] = [];
    if (report.wetter && report.wetter.length > 0) {
      parts.push(report.wetter.map((w) => WETTER_LABELS_PDF[w] || w).join(", "));
    }
    if (report.temperatur_min != null || report.temperatur_max != null) {
      parts.push(`${report.temperatur_min ?? "–"}° / ${report.temperatur_max ?? "–"}°C`);
    }
    doc.text(parts.join("  ·  "), margin, y + 4);
    y += 9;
  }

  // Tätigkeiten
  if (activities.length > 0) {
    sectionHeader("Tätigkeiten");

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

  // Beschreibung
  if (report.beschreibung) {
    sectionHeader("Beschreibung");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(report.beschreibung, contentWidth);
    checkPageBreak(lines.length * 4.5);
    doc.text(lines, margin, y + 3);
    y += lines.length * 4.5 + 5;
  }

  if (report.notizen) {
    sectionHeader("Notizen");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(report.notizen, contentWidth);
    checkPageBreak(lines.length * 4.5);
    doc.text(lines, margin, y + 3);
    y += lines.length * 4.5 + 5;
  }

  // Zeiterfassung als Tabelle (User / Zeit / Pause / Tätigkeit / Stunden)
  if (report.zeit_auf_pdf && options.timeEntries && options.timeEntries.length > 0) {
    const total = options.timeEntries.reduce((s, e) => s + Number(e.stunden || 0), 0);
    sectionHeader(`Zeiterfassung  (${total.toFixed(2)} h gesamt)`);

    // Spalten-Breiten
    const colUser = 38;
    const colTime = 28;
    const colPause = 18;
    const colTaet = contentWidth - colUser - colTime - colPause - 18;

    // Tabellen-Header — dezent, hellgraue Linie unten statt voll-gefuellt
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    let x = margin + 1;
    doc.text("Mitarbeiter", x, y + 3); x += colUser;
    doc.text("Zeit", x, y + 3); x += colTime;
    doc.text("Pause", x, y + 3); x += colPause;
    doc.text("Tätigkeit", x, y + 3); x += colTaet;
    doc.text("Stunden", x, y + 3, { align: "left" });
    y += 5;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    y += 1;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (const e of options.timeEntries) {
      checkPageBreak(5);
      const range = e.start_time && e.end_time
        ? `${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)}`
        : `${Number(e.stunden).toFixed(2)} h`;
      const pause = e.pause_minutes ? `${e.pause_minutes} min` : "—";
      const taet = e.taetigkeit || "";
      const sum = `${Number(e.stunden || 0).toFixed(2)} h`;

      x = margin + 1;
      doc.text((e.user_name || "—").substring(0, 22), x, y + 4); x += colUser;
      doc.text(range, x, y + 4); x += colTime;
      doc.text(pause, x, y + 4); x += colPause;
      const taetTrim = doc.splitTextToSize(taet, colTaet - 2)[0] || "";
      doc.text(taetTrim, x, y + 4); x += colTaet;
      doc.text(sum, x, y + 4);
      y += 5;
    }
    // Summen-Zeile
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, margin + contentWidth, y);
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text(`Gesamt: ${total.toFixed(2)} h`, margin + contentWidth, y, { align: "right" });
    y += 6;
    doc.setFont("helvetica", "normal");
  }

  // Photos
  if (photos.length > 0) {
    doc.addPage();
    y = margin;
    sectionHeader(`Fotos (${photos.length})`);
    y += 2;

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
    sectionHeader("Sicherheitscheckliste");
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    y += 2;

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
