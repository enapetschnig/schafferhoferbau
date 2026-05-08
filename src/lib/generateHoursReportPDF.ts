import { jsPDF } from "jspdf";
import { addPdfHeader } from "./pdfHelpers";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// Daten-Zeile fuer die Stundenauswertung-PDF.
// Pro Tag mit Eintrag eine Zeile (mehrere Eintraege werden vorher zusammengefasst).
export interface HoursReportPdfRow {
  datum: string;             // ISO YYYY-MM-DD
  beginn: string | null;
  ende: string | null;
  pauseMinutes: number;
  stunden: number;           // Geleistete Arbeitszeit
  lohnstunden: number;       // = min(stunden, schwellenwert)
  zaStunden: number;         // = max(0, stunden - schwellenwert)
  kilometer: number;
  diaetenLabel: string;      // "Klein"/"Gross"/"Anfahrt"/"" (leer wenn keine)
  projekt: string;           // Projektname (oder "—")
  taetigkeit: string;        // Tätigkeit / Anmerkung (Urlaub, Krankenstand, etc.)
}

export interface HoursReportPdfParams {
  employeeName: string;
  month: string;
  year: number;
  rows: HoursReportPdfRow[];
  totalStunden: number;
  totalZA: number;
  totalKilometer: number;
  totalDiaetenTage: number;
  /** Wenn true: zeigt Spalte 'ZA-Std'. Wenn false: Stunden-Spalte zeigt nur Lohnstunden. */
  includeZA: boolean;
}

const formatPause = (minutes: number) => {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export async function generateHoursReportPDF(params: HoursReportPdfParams) {
  const {
    employeeName, month, year, rows,
    totalStunden, totalZA, totalKilometer, totalDiaetenTage,
    includeZA,
  } = params;

  // A4 Querformat - viele Spalten
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = 297;
  const margin = 12;
  let y = await addPdfHeader(doc, { startY: 15, margin });

  // Title
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text(`Stundenauswertung — ${employeeName}`, margin, y);
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Zeitraum: ${month} ${year}`, margin, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Spalten
  const cols = includeZA
    ? [
        { label: "Datum", x: margin, w: 18 },
        { label: "Tag", x: margin + 19, w: 10 },
        { label: "Beginn", x: margin + 30, w: 14 },
        { label: "Ende", x: margin + 45, w: 14 },
        { label: "Pause", x: margin + 60, w: 12 },
        { label: "Stunden", x: margin + 73, w: 16 },
        { label: "ZA-Std", x: margin + 90, w: 14 },
        { label: "km", x: margin + 105, w: 12 },
        { label: "Diäten", x: margin + 118, w: 14 },
        { label: "Projekt", x: margin + 133, w: 70 },
        { label: "Tätigkeit", x: margin + 204, w: 70 },
      ]
    : [
        { label: "Datum", x: margin, w: 18 },
        { label: "Tag", x: margin + 19, w: 10 },
        { label: "Beginn", x: margin + 30, w: 14 },
        { label: "Ende", x: margin + 45, w: 14 },
        { label: "Pause", x: margin + 60, w: 12 },
        { label: "Stunden", x: margin + 73, w: 18 },
        { label: "km", x: margin + 92, w: 12 },
        { label: "Diäten", x: margin + 105, w: 14 },
        { label: "Projekt", x: margin + 120, w: 80 },
        { label: "Tätigkeit", x: margin + 201, w: 80 },
      ];

  // Header-Zeile
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 4, pageWidth - 2 * margin, 7, "F");
  for (const c of cols) doc.text(c.label, c.x, y);
  y += 7;

  // Daten
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  for (const r of rows) {
    if (y > 195) { // A4-Querformat hat ~210mm Hoehe, Reserve fuer Footer
      doc.addPage();
      y = 20;
      // Header-Zeile auf neuer Seite
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 4, pageWidth - 2 * margin, 7, "F");
      for (const c of cols) doc.text(c.label, c.x, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }

    const date = new Date(r.datum);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    if (isWeekend) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 3.5, pageWidth - 2 * margin, 5, "F");
    }

    const stundenAnzeige = includeZA ? r.stunden : r.lohnstunden;

    doc.setTextColor(0, 0, 0);
    doc.text(format(date, "dd.MM."), cols[0].x, y);
    doc.text(format(date, "EEE", { locale: de }), cols[1].x, y);
    doc.text(r.beginn || "–", cols[2].x, y);
    doc.text(r.ende || "–", cols[3].x, y);
    doc.text(r.pauseMinutes > 0 ? formatPause(r.pauseMinutes) : "–", cols[4].x, y);
    doc.text(stundenAnzeige > 0 ? `${stundenAnzeige.toFixed(2)}` : "–", cols[5].x, y);

    if (includeZA) {
      if (r.zaStunden > 0) {
        doc.setTextColor(234, 88, 12); // orange
        doc.text(`+${r.zaStunden.toFixed(2)}`, cols[6].x, y);
        doc.setTextColor(0, 0, 0);
      } else if (r.zaStunden < 0) {
        doc.setTextColor(220, 38, 38); // rot
        doc.text(r.zaStunden.toFixed(2), cols[6].x, y);
        doc.setTextColor(0, 0, 0);
      } else {
        doc.text("–", cols[6].x, y);
      }
    }

    const kmCol = includeZA ? cols[7] : cols[6];
    const diaetenCol = includeZA ? cols[8] : cols[7];
    const projektCol = includeZA ? cols[9] : cols[8];
    const taetigCol = includeZA ? cols[10] : cols[9];

    doc.text(r.kilometer > 0 ? r.kilometer.toFixed(0) : "–", kmCol.x, y);
    doc.text(r.diaetenLabel || "–", diaetenCol.x, y);
    // Projekt + Taetigkeit kuerzen falls zu lang
    const projektMaxChars = Math.floor(projektCol.w * 1.8);
    const taetigMaxChars = Math.floor(taetigCol.w * 1.8);
    doc.text((r.projekt || "—").slice(0, projektMaxChars), projektCol.x, y);
    doc.text((r.taetigkeit || "").slice(0, taetigMaxChars), taetigCol.x, y);

    y += 5;
  }

  // Trennlinie
  y += 2;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Summary
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Zusammenfassung", margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Gesamtstunden: ${totalStunden.toFixed(2)} h`, margin, y);
  y += 5;
  if (includeZA) {
    if (totalZA > 0) {
      doc.setTextColor(234, 88, 12);
      doc.text(`ZA-Saldo: +${totalZA.toFixed(2)} h (gutgeschrieben)`, margin, y);
    } else if (totalZA < 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`ZA-Saldo: ${totalZA.toFixed(2)} h (vom Konto abgezogen)`, margin, y);
    } else {
      doc.text(`ZA-Saldo: 0 h`, margin, y);
    }
    doc.setTextColor(0, 0, 0);
    y += 5;
  } else {
    doc.text(`Lohnstunden (gesamt): ${totalStunden.toFixed(2)} h`, margin, y);
    y += 5;
  }
  if (totalKilometer > 0) {
    doc.text(`Kilometer gesamt: ${totalKilometer.toFixed(0)} km`, margin, y);
    y += 5;
  }
  if (totalDiaetenTage > 0) {
    doc.text(`Diäten-Tage: ${totalDiaetenTage}`, margin, y);
    y += 5;
  }

  // Signatur
  y += 8;
  doc.setFontSize(8);
  doc.line(margin, y, margin + 60, y);
  doc.text("Datum, Unterschrift", margin, y + 4);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(130, 130, 130);
  doc.text(
    `Erstellt am ${format(new Date(), "dd.MM.yyyy HH:mm")} — Schafferhofer Bau GmbH`,
    margin,
    205
  );

  const suffix = includeZA ? "_mit_ZA" : "_ohne_ZA";
  doc.save(`Stundenauswertung_${employeeName.replace(/\s/g, "_")}_${month}_${year}${suffix}.pdf`);
}
