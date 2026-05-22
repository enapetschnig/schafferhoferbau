import * as XLSX from "xlsx-js-style";

// Eine Excel-Zeile pro Rechnungsposition — Format der Vorlage
// "Eingangsrechnungen 2026" von Schafferhofer Bau.
export interface BuchhaltungExcelRow {
  baustelle: string;
  menge: number | null;
  einheit: string;
  artikelbezeichnung: string;
  ekPreis: number | null;
  aufschlag: number;
  /** ISO-Datum "YYYY-MM-DD" oder null. */
  rechnungsdatum: string | null;
  /** ISO-Datum "YYYY-MM-DD" oder null. */
  lieferdatum: string | null;
  lieferant: string;
}

// Parst "YYYY-MM-DD" robust zu einem lokalen Date (Mitternacht) — vermeidet
// Zeitzonen-Verschiebung. Liefert null bei ungueltigem/leerem Input.
function parseISODate(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Erzeugt die Eingangsrechnungen-Excel-Datei und startet den Download.
 * Zeilen werden nach Baustelle, dann Rechnungsdatum sortiert — passend
 * fuer die Abrechnung pro Baustelle.
 */
export function generateBuchhaltungExcel(rows: BuchhaltungExcelRow[], jahr: number): void {
  // Sortierung: Baustelle alphabetisch (leere ans Ende), dann Rechnungsdatum
  const sorted = [...rows].sort((a, b) => {
    const ba = (a.baustelle || "").trim().toLowerCase();
    const bb = (b.baustelle || "").trim().toLowerCase();
    if (ba !== bb) {
      if (!ba) return 1;
      if (!bb) return -1;
      return ba.localeCompare(bb, "de");
    }
    const da = a.rechnungsdatum || "";
    const db = b.rechnungsdatum || "";
    return da.localeCompare(db);
  });

  const headerRow = [
    "Baustelle", "Menge", "Einheit", "Artikelbezeichnung", "EK Preis",
    "Aufschlag", "Rechnungsdatum", "Lieferdatum", "Lieferant",
    "Einzelpreis EURO", "Gesamtpreis EURO", "Einzelpreis EURO", "Gesamtpreis EURO",
  ];

  // aoa: Titel (Zeile 1), Header (Zeile 2), Daten ab Zeile 3.
  // Date-Objekte werden via cellDates:true zu echten Datums-Zellen.
  const aoa: (string | number | Date | null)[][] = [
    [`Eingangsrechnungen Schafferhofer Bau GmbH ${jahr}`],
    headerRow,
  ];

  for (const r of sorted) {
    aoa.push([
      r.baustelle || "",
      r.menge != null && Number.isFinite(r.menge) ? r.menge : "",
      r.einheit || "",
      r.artikelbezeichnung || "",
      r.ekPreis != null && Number.isFinite(r.ekPreis) ? r.ekPreis : "",
      Number.isFinite(r.aufschlag) ? r.aufschlag : 0,
      parseISODate(r.rechnungsdatum) ?? "",
      parseISODate(r.lieferdatum) ?? "",
      r.lieferant || "",
      // J/K/L/M werden unten als Formeln gesetzt
      "", "", "", "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

  const firstDataRow = 3;                       // 1-basiert (Excel)
  const lastDataRow = 2 + sorted.length;        // 1-basiert
  // Spalten-Index 0-basiert: B=1, E=4, F=5, G=6, H=7, J=9, K=10, L=11, M=12

  // Pro Datenzeile: Formeln J/K/L/M + Zahlen-/Datums-Formate.
  // Cached value `v` wird mitgegeben, damit auch Viewer ohne Formel-
  // Evaluation den Wert zeigen (Excel rechnet beim Bearbeiten neu).
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const ri = r - 1; // 0-basiert
    const src = sorted[r - firstDataRow];
    const e = src.ekPreis != null && Number.isFinite(src.ekPreis) ? src.ekPreis : 0;
    const f = Number.isFinite(src.aufschlag) ? src.aufschlag : 0;
    const b = src.menge != null && Number.isFinite(src.menge) ? src.menge : 0;
    const jVal = Math.round((e + e * f) * 100) / 100;
    const lVal = e + e * f;
    // J = ROUND(E+(E*F),2)
    ws[XLSX.utils.encode_cell({ r: ri, c: 9 })] = { t: "n", f: `ROUND(E${r}+(E${r}*F${r}),2)`, v: jVal, z: "0.00" };
    // K = J*B
    ws[XLSX.utils.encode_cell({ r: ri, c: 10 })] = { t: "n", f: `J${r}*B${r}`, v: Math.round(jVal * b * 100) / 100, z: "0.00" };
    // L = (E+(E*F))
    ws[XLSX.utils.encode_cell({ r: ri, c: 11 })] = { t: "n", f: `(E${r}+(E${r}*F${r}))`, v: lVal, z: "0.00" };
    // M = L*B
    ws[XLSX.utils.encode_cell({ r: ri, c: 12 })] = { t: "n", f: `L${r}*B${r}`, v: Math.round(lVal * b * 100) / 100, z: "0.00" };

    // Zahlen-Formate fuer EK Preis (E) + Aufschlag (F)
    for (const c of [4, 5]) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c })];
      if (cell && typeof cell.v === "number") cell.z = "0.00";
    }
    // Datums-Formate fuer Rechnungsdatum (G) + Lieferdatum (H)
    for (const c of [6, 7]) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c })];
      if (cell && cell.t === "d") cell.z = "dd.mm.yyyy";
    }
  }

  // Summenzeile fuer Gesamtpreis (K) — eine Zeile unter den Daten
  if (sorted.length > 0) {
    const sumRow = lastDataRow + 2; // 1-basiert, eine Leerzeile dazwischen
    const sumRi = sumRow - 1;
    const sumK = sorted.reduce((s, r) => {
      const e = r.ekPreis != null && Number.isFinite(r.ekPreis) ? r.ekPreis : 0;
      const f = Number.isFinite(r.aufschlag) ? r.aufschlag : 0;
      const b = r.menge != null && Number.isFinite(r.menge) ? r.menge : 0;
      return s + Math.round((e + e * f) * 100) / 100 * b;
    }, 0);
    ws[XLSX.utils.encode_cell({ r: sumRi, c: 3 })] = { t: "s", v: "Summe Netto:", s: { font: { bold: true } } };
    ws[XLSX.utils.encode_cell({ r: sumRi, c: 10 })] = {
      t: "n", f: `SUM(K${firstDataRow}:K${lastDataRow})`, v: Math.round(sumK * 100) / 100, z: "0.00", s: { font: { bold: true } },
    };
    // Sheet-Range erweitern, damit die Summenzeile enthalten ist
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    range.e.r = Math.max(range.e.r, sumRi);
    range.e.c = Math.max(range.e.c, 12);
    ws["!ref"] = XLSX.utils.encode_range(range);
  }

  // Spaltenbreiten
  ws["!cols"] = [
    { wch: 20 }, { wch: 9 }, { wch: 9 }, { wch: 40 }, { wch: 11 },
    { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 20 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
  ];

  // Header (Zeile 2 = Index 1) fett
  for (let c = 0; c < headerRow.length; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 1, c })];
    if (cell) cell.s = { font: { bold: true } };
  }
  // Titel (Zeile 1) fett + groesser
  const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 13 } };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Eingangsrechnungen ${jahr}`);
  XLSX.writeFile(wb, `Eingangsrechnungen_${jahr}.xlsx`);
}
