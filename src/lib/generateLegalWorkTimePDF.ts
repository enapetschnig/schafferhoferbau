import { jsPDF } from "jspdf";
import { addPdfHeader } from "./pdfHelpers";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface DayRow {
  datum: string;
  beginn: string | null;
  ende: string | null;
  pauseMinutes: number;
  /** Tatsaechlich gearbeitete Stunden (intern, nicht im PDF angezeigt). */
  arbeitszeit: number;
  /** Bezahlte Stunden bis zum Schwellenwert (= Normalarbeitszeit + Ueberstunden). */
  lohnstunden: number;
  /** Soll-Stunden fuer den Tag aus Regelarbeitszeit. */
  normalstunden: number;
  /** Bezahlte Ueberstunden = lohnstunden - normalstunden (clamped >= 0). */
  ueberstundenLohn: number;
  anmerkung: string | null; // SW, U, K, F, ZA
  schlechtwetterStunden: number;
  diaetenTyp: "klein" | "gross" | "anfahrt" | "keine" | null;
}

interface LegalWorkTimePDFParams {
  employeeName: string;
  month: string;
  year: number;
  rows: DayRow[];
  totalPause: number;
  workingDays: number;
  totalBadWeatherHours: number;
  /** Σ lohnstunden — nicht actual hours, sondern bezahlte Stunden bis Schwellenwert. */
  totalLohnstunden: number;
  /** Σ normalstunden — Normalarbeitszeit aller Arbeitstage. */
  totalNormalstunden: number;
  /** Σ ueberstundenLohn — bezahlte Ueberstunden (lohnstunden - normalstunden). */
  totalUeberstundenLohn: number;
  dietKlein: number;
  dietGross: number;
  dietAnfahrt: number;
  totalFeiertage: number;
  /** Optional: Unterschrift Mitarbeiter (data URL aus SignaturePad). */
  signatureEmployee?: string | null;
  /** Optional: Unterschrift Arbeitgeber (data URL aus SignaturePad). */
  signatureEmployer?: string | null;
}

const formatPause = (minutes: number) => {
  if (minutes === 0) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

const DIET_LABELS: Record<string, string> = {
  klein: "K",   // >3h Kleine Diaet
  gross: "G",   // >9h Grosse Diaet
  anfahrt: "A", // >100km Anfahrtsdiaet
};

const ANMERKUNG_LABELS: Record<string, string> = {
  SW: "Schlechtwetter",
  U: "Urlaub",
  K: "Krankenstand",
  F: "Feiertag",
  ZA: "Zeitausgleich",
};

export async function generateLegalWorkTimePDF(params: LegalWorkTimePDFParams) {
  const {
    employeeName, month, year, rows,
    totalPause, workingDays,
    totalBadWeatherHours,
    totalLohnstunden, totalNormalstunden, totalUeberstundenLohn,
    dietKlein, dietGross, dietAnfahrt,
    totalFeiertage,
    signatureEmployee = null, signatureEmployer = null,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
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
  doc.text(`gemäß § 26 AZG · für Lohnverrechnung (bis Schwellenwert)`, margin, y);
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

  // Table layout: Datum | Tag | Beginn | Ende | Pause | Arbeitszeit | Diät | Anmerkung
  const colX = [margin, margin + 22, margin + 38, margin + 55, margin + 72, margin + 92, margin + 118, margin + 132];
  const colLabels = ["Datum", "Tag", "Beginn", "Ende", "Pause", "Arbeitszeit", "Diät", "Anmerkung"];

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 4, pageWidth - 2 * margin, 7, "F");
  for (let i = 0; i < colLabels.length; i++) {
    doc.text(colLabels[i], colX[i], y);
  }
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  for (const row of rows) {
    if (y > 258) {
      doc.addPage();
      y = 20;
    }

    const date = new Date(row.datum);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    if (isWeekend) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 3.5, pageWidth - 2 * margin, 5, "F");
    }

    if (row.lohnstunden === 0 && !row.anmerkung) {
      doc.setTextColor(160, 160, 160);
    } else {
      doc.setTextColor(0, 0, 0);
    }

    doc.text(format(date, "dd.MM.yyyy"), colX[0], y);
    doc.text(format(date, "EEE", { locale: de }), colX[1], y);
    doc.text(row.beginn || "–", colX[2], y);
    doc.text(row.ende || "–", colX[3], y);
    doc.text(row.pauseMinutes > 0 ? formatPause(row.pauseMinutes) : "–", colX[4], y);
    // Arbeitszeit-Spalte: NUR Lohnstunden (= bis Schwellenwert).
    // Mehrstunden ueber Schwellenwert sind NICHT Teil der Lohnverrechnung.
    doc.text(row.lohnstunden > 0 ? `${row.lohnstunden.toFixed(2)} h` : "–", colX[5], y);

    // Diaet-Spalte (Abkuerzung; Vollschreibweise unten in Legende)
    if (row.diaetenTyp && row.diaetenTyp !== "keine") {
      doc.text(DIET_LABELS[row.diaetenTyp] ?? "", colX[6], y);
    } else {
      doc.text("–", colX[6], y);
    }

    // Anmerkung-Spalte: Schlechtwetter mit Stundenangabe, sonst Kuerzel
    if (row.anmerkung === "SW") {
      doc.setTextColor(37, 99, 235);
      doc.text(`SW (${row.schlechtwetterStunden.toFixed(1)}h)`, colX[7], y);
      doc.setTextColor(0, 0, 0);
    } else if (row.anmerkung) {
      doc.setTextColor(100, 100, 100);
      doc.text(row.anmerkung, colX[7], y);
      doc.setTextColor(0, 0, 0);
    }

    y += 5;
  }

  // Divider
  doc.setTextColor(0, 0, 0);
  y += 4;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // Pruefen ob ggf. neue Seite fuer Summary noetig
  if (y > 235) {
    doc.addPage();
    y = 20;
  }

  // Summary — Lohnverrechnungs-Format
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Zusammenfassung", margin, y);
  y += 7;

  // 2-Spalten-Layout
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const labelX = margin;
  const valueX = margin + 55;
  const labelX2 = margin + 95;
  const valueX2 = margin + 150;

  const summaryLeft: Array<[string, string, boolean?]> = [
    ["Normalarbeitszeit:", `${totalNormalstunden.toFixed(2)} h`],
    ["Überstunden:", `${totalUeberstundenLohn.toFixed(2)} h`],
    ["Gesamtstunden:", `${totalLohnstunden.toFixed(2)} h`, true], // bold
    ["Arbeitstage:", `${workingDays}`],
    ["Gesamtpause:", formatPause(totalPause)],
  ];
  const summaryRight: Array<[string, string]> = [
    ["Diäten >3 h:", `${dietKlein}`],
    ["Diäten >9 h:", `${dietGross}`],
    ["Diäten >100 km:", `${dietAnfahrt}`],
    ["Schlechtwetterstunden:", totalBadWeatherHours > 0 ? `${totalBadWeatherHours.toFixed(1)} h` : "–"],
    ["Feiertage:", `${totalFeiertage}`],
  ];

  const startY = y;
  for (let i = 0; i < summaryLeft.length; i++) {
    const [label, value, bold] = summaryLeft[i];
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, labelX, y);
    doc.text(value, valueX, y);
    y += 5.5;
  }

  let yRight = startY;
  for (let i = 0; i < summaryRight.length; i++) {
    const [label, value] = summaryRight[i];
    doc.setFont("helvetica", "normal");
    doc.text(label, labelX2, yRight);
    doc.text(value, valueX2, yRight);
    yRight += 5.5;
  }
  y = Math.max(y, yRight) + 4;

  // Legend
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Diäten: K = klein (>3h)  ·  G = groß (>9h)  ·  A = Anfahrt (>100km)`,
    margin,
    y,
  );
  y += 4;
  const legendItems = Object.entries(ANMERKUNG_LABELS).map(([k, v]) => `${k} = ${v}`).join("  |  ");
  doc.text(`Legende: ${legendItems}`, margin, y);
  y += 8;

  // Signature lines (mit eingebetteter Unterschrift falls vorhanden)
  if (y > pageHeight - 40) {
    doc.addPage();
    y = pageHeight - 50;
  } else {
    y = Math.max(y, pageHeight - 50);
  }

  doc.setTextColor(0, 0, 0);
  const sigWidth = 60;
  const sigHeight = 18;
  const sigY = y - sigHeight + 2;

  // Mitarbeiter
  if (signatureEmployee) {
    try {
      doc.addImage(signatureEmployee, "PNG", margin, sigY, sigWidth, sigHeight);
    } catch {
      /* ignore broken data URL */
    }
  }
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + sigWidth, y);
  doc.setFontSize(8);
  doc.text(
    `Datum: ${format(new Date(), "dd.MM.yyyy")}  ·  Unterschrift Arbeitnehmer`,
    margin,
    y + 4,
  );

  // Arbeitgeber
  const sigEmployerX = margin + sigWidth + 20;
  if (signatureEmployer) {
    try {
      doc.addImage(signatureEmployer, "PNG", sigEmployerX, sigY, sigWidth, sigHeight);
    } catch {
      /* ignore */
    }
  }
  doc.line(sigEmployerX, y, sigEmployerX + sigWidth, y);
  doc.text(
    `Datum: ${format(new Date(), "dd.MM.yyyy")}  ·  Unterschrift Arbeitgeber`,
    sigEmployerX,
    y + 4,
  );

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(130, 130, 130);
  doc.text(
    `Erstellt am ${format(new Date(), "dd.MM.yyyy HH:mm")} — Schafferhofer Bau GmbH`,
    margin,
    pageHeight - 10,
  );

  doc.save(`Arbeitszeitaufzeichnung_${employeeName.replace(/\s/g, "_")}_${month}_${year}.pdf`);
}
