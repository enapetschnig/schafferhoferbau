import { describe, it, expect } from "vitest";
import {
  zeitraumAusName,
  zeitraumVon,
  verfuegbareJahre,
  filterPayslips,
  zeitraumLabel,
  ALLE,
} from "./payslipFilter";

const d = (name: string, created_at?: string) => ({ name, created_at });

describe("zeitraumAusName", () => {
  it("liest den Sammel-Upload-Namen", () => {
    expect(zeitraumAusName("Franz_Schafferhofer_Lohnzettel_08_2026.pdf")).toEqual({
      jahr: 2026,
      monat: 8,
    });
  });

  it("liest auch mit Zeitstempel-Praefix", () => {
    expect(zeitraumAusName("1775035905339_Lohnzettel_04_2026.pdf")).toEqual({
      jahr: 2026,
      monat: 4,
    });
  });

  it("laesst sich vom Zeitstempel-Praefix nicht taeuschen", () => {
    // 13-stellige Zahl enthaelt Ziffernfolgen, die wie MM_JJJJ aussehen koennten
    expect(zeitraumAusName("1786653346655_brnhia_IMG_1829.jpeg")).toBeNull();
  });

  it("kennt keine Monate ausserhalb 01-12", () => {
    expect(zeitraumAusName("Lohnzettel_13_2026.pdf")).toBeNull();
    expect(zeitraumAusName("Lohnzettel_00_2026.pdf")).toBeNull();
  });

  it("nimmt bei mehreren Treffern den letzten", () => {
    expect(zeitraumAusName("Alt_01_2024_Lohnzettel_09_2026.pdf")).toEqual({
      jahr: 2026,
      monat: 9,
    });
  });

  it("Januar und Dezember", () => {
    expect(zeitraumAusName("x_Lohnzettel_01_2025.pdf")?.monat).toBe(1);
    expect(zeitraumAusName("x_Lohnzettel_12_2025.pdf")?.monat).toBe(12);
  });
});

describe("zeitraumVon", () => {
  it("faellt auf das Hochladedatum zurueck", () => {
    expect(zeitraumVon(d("IMG_1829.jpeg", "2026-03-15T10:00:00Z"))).toEqual({
      jahr: 2026,
      monat: 3,
    });
  });

  it("Dateiname sticht das Hochladedatum", () => {
    expect(
      zeitraumVon(d("Lohnzettel_08_2026.pdf", "2026-09-01T10:00:00Z"))
    ).toEqual({ jahr: 2026, monat: 8 });
  });

  it("ohne alles: null", () => {
    expect(zeitraumVon(d("irgendwas.pdf"))).toBeNull();
    expect(zeitraumVon(d("irgendwas.pdf", "kaputt"))).toBeNull();
  });
});

describe("verfuegbareJahre", () => {
  it("neueste zuerst, ohne Dubletten", () => {
    const jahre = verfuegbareJahre([
      d("a_Lohnzettel_01_2025.pdf"),
      d("b_Lohnzettel_02_2026.pdf"),
      d("c_Lohnzettel_03_2025.pdf"),
    ]);
    expect(jahre).toEqual([2026, 2025]);
  });

  it("leere Liste", () => {
    expect(verfuegbareJahre([])).toEqual([]);
  });
});

describe("filterPayslips", () => {
  const docs = [
    d("Franz_Lohnzettel_08_2026.pdf"),
    d("Franz_Lohnzettel_07_2026.pdf"),
    d("Franz_Lohnzettel_08_2025.pdf"),
    d("Alt_ohne_Zeitraum.pdf"),
  ];

  it("Standardfall: nur das laufende Jahr", () => {
    const r = filterPayslips(docs, { jahr: "2026", monat: ALLE, suche: "" });
    expect(r.map((x) => x.name)).toEqual([
      "Franz_Lohnzettel_08_2026.pdf",
      "Franz_Lohnzettel_07_2026.pdf",
    ]);
  });

  it("Jahr und Monat zusammen", () => {
    const r = filterPayslips(docs, { jahr: "2026", monat: "8", suche: "" });
    expect(r.map((x) => x.name)).toEqual(["Franz_Lohnzettel_08_2026.pdf"]);
  });

  it("Monat allein ueber alle Jahre", () => {
    const r = filterPayslips(docs, { jahr: ALLE, monat: "8", suche: "" });
    expect(r).toHaveLength(2);
  });

  it("Alle zeigt auch Dateien ohne erkennbaren Zeitraum", () => {
    const r = filterPayslips(docs, { jahr: ALLE, monat: ALLE, suche: "" });
    expect(r).toHaveLength(4);
  });

  it("Dateien ohne Zeitraum verschwinden bei Jahresauswahl", () => {
    const r = filterPayslips(docs, { jahr: "2026", monat: ALLE, suche: "" });
    expect(r.some((x) => x.name === "Alt_ohne_Zeitraum.pdf")).toBe(false);
  });

  it("Suche greift auf den Dateinamen", () => {
    const r = filterPayslips(docs, { jahr: ALLE, monat: ALLE, suche: "07" });
    expect(r.map((x) => x.name)).toEqual(["Franz_Lohnzettel_07_2026.pdf"]);
  });

  it("Suche ignoriert Gross-/Kleinschreibung", () => {
    expect(filterPayslips(docs, { jahr: ALLE, monat: ALLE, suche: "FRANZ" })).toHaveLength(3);
  });

  it("Suche und Zeitraum wirken zusammen", () => {
    const r = filterPayslips(docs, { jahr: "2025", monat: ALLE, suche: "franz" });
    expect(r.map((x) => x.name)).toEqual(["Franz_Lohnzettel_08_2025.pdf"]);
  });

  it("leere Liste bleibt leer", () => {
    expect(filterPayslips([], { jahr: "2026", monat: ALLE, suche: "" })).toEqual([]);
  });
});

describe("zeitraumLabel", () => {
  it("Monat und Jahr auf Deutsch", () => {
    expect(zeitraumLabel(d("x_Lohnzettel_01_2026.pdf"))).toBe("Jänner 2026");
    expect(zeitraumLabel(d("x_Lohnzettel_08_2026.pdf"))).toBe("August 2026");
  });

  it("ohne Zeitraum", () => {
    expect(zeitraumLabel(d("x.pdf"))).toBe("Ohne Zeitraum");
  });
});
