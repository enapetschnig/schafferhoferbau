import { jsPDF } from "jspdf";
import { addPdfHeader } from "./pdfHelpers";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface DayRow {
  datum: string;
  beginn: string | null;
  ende: string | null;
  pauseMinutes: number;
  arbeitszeit: number;
  anmerkung: string | null;
  schlechtwetterStunden: number;
}

interface LegalWorkTimePDFParams {
  employeeName: string;
  month: string;
  year: number;
  rows: DayRow[];
  totalHours: number;
  totalPause: number;
  workingDays: number;
  totalBadWeatherHours?: number;
}

const formatPause = (minutes: number) => {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

const ANMERKUNG_LABELS: Record<string, string> = {
  SW: "Schlechtwetter",
  U: "Urlaub",
  K: "Krankenstand",
  F: "Feiertag",
  ZA: "Zeitausgleich",
};

export async function generateLegalWorkTimePDF(params: LegalWorkTimePDFParams) {
  const { employeeName, month, year, rows, totalHours, totalPause, workingDays, totalBadWeatherHours = 0 } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 15;
  let y = await addPdfHeader(doc, { startY: 20, margin });

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text("Arbeitszeitaufzeichnung", margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`gemäß § 26 AZG`, margin, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  // Employee info
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Mitarbeiter: ${employeeName}`, margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Zeitraum: ${month} ${year}`, margin, y);
  y += 10;

  // Table header — with Anmerkung column
  const colX = [margin, margin + 22, margin + 44, margin + 64, margin + 82, margin + 104, margin + 130];
  const colLabels = ["Datum", "Wochentag", "Beginn", "Ende", "Pause", "Arbeitszeit", "Anmerkung"];

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 4, pageWidth - 2 * margin, 7, "F");

  for (let i = 0; i < colLabels.length; i++) {
    doc.text(colLabels[i], colX[i], y);
  }
  y += 7;

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  for (const row of rows) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    const date = new Date(row.datum);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    if (isWeekend) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 3.5, pageWidth - 2 * margin, 5, "F");
    }

    if (row.arbeitszeit === 0 && !row.anmerkung) {
      doc.setTextColor(160, 160, 160);
    } else {
      doc.setTextColor(0, 0, 0);
    }

    doc.text(format(date, "dd.MM.yyyy"), colX[0], y);
    doc.text(format(date, "EEEE", { locale: de }), colX[1], y);
    doc.text(row.beginn || "–", colX[2], y);
    doc.text(row.ende || "–", colX[3], y);
    doc.text(row.pauseMinutes > 0 ? formatPause(row.pauseMinutes) : "–", colX[4], y);
    doc.text(row.arbeitszeit > 0 ? `${row.arbeitszeit.toFixed(2)} h` : "–", colX[5], y);

    // Anmerkung
    if (row.anmerkung) {
      if (row.anmerkung === "SW") {
        doc.setTextColor(37, 99, 235); // blue
        doc.text(`SW (${row.schlechtwetterStunden.toFixed(1)}h)`, colX[6], y);
      } else {
        doc.setTextColor(100, 100, 100);
        doc.text(row.anmerkung, colX[6], y);
      }
    }

    y += 5;
  }

  // Divider
  doc.setTextColor(0, 0, 0);
  y += 3;
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
  doc.text(`Arbeitstage: ${workingDays}`, margin, y);
  y += 5;
  doc.text(`Gesamtpause: ${formatPause(totalPause)}`, margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(`Gesamtarbeitszeit: ${totalHours.toFixed(2)} Stunden`, margin, y);
  y += 5;

  if (totalBadWeatherHours > 0) {
    doc.setTextColor(37, 99, 235);
    doc.text(`Schlechtwetterstunden: ${totalBadWeatherHours.toFixed(1)} Stunden`, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  }

  y += 10;

  // Legend
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const legendItems = Object.entries(ANMERKUNG_LABELS).map(([k, v]) => `${k} = ${v}`).join("  |  ");
  doc.text(`Legende: ${legendItems}`, margin, y);
  y += 10;

  // Signature lines
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.line(margin, y, margin + 60, y);
  doc.text("Datum, Unterschrift Arbeitnehmer", margin, y + 4);

  doc.line(margin + 80, y, margin + 140, y);
  doc.text("Datum, Unterschrift Arbeitgeber", margin + 80, y + 4);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(130, 130, 130);
  doc.text(
    `Erstellt am ${format(new Date(), "dd.MM.yyyy HH:mm")} — Schafferhofer Bau GmbH`,
    margin,
    287
  );

  doc.save(`Arbeitszeitaufzeichnung_${employeeName.replace(/\s/g, "_")}_${month}_${year}.pdf`);
}
