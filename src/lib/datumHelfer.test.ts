import { describe, it, expect } from "vitest";
import { localDateString, dashboardWeekWindow, datumMitUhrzeit } from "./datumHelfer";

describe("localDateString", () => {
  it("liefert den lokalen Kalendertag", () => {
    expect(localDateString(new Date(2026, 8, 10))).toBe("2026-09-10");
  });

  it("kippt an lokaler Mitternacht NICHT auf den Vortag", () => {
    // Genau der Fehler aus der Plantafel: toISOString haette hier
    // "2026-09-09" geliefert (Sommerzeit, UTC+2).
    const mitternacht = new Date(2026, 8, 10, 0, 0, 0);
    expect(localDateString(mitternacht)).toBe("2026-09-10");
  });

  it("stimmt auch spaet abends noch", () => {
    expect(localDateString(new Date(2026, 8, 10, 23, 59))).toBe("2026-09-10");
  });

  it("fuellt Monat und Tag zweistellig auf", () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("funktioniert ueber den Jahreswechsel", () => {
    expect(localDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
    expect(localDateString(new Date(2027, 0, 1))).toBe("2027-01-01");
  });
});

describe("dashboardWeekWindow", () => {
  const tage = (d: Date) => dashboardWeekWindow(d).days.map(localDateString);

  it("beginnt am Sonntag und umfasst 8 Tage bis zum naechsten Sonntag", () => {
    // Sonntag, 06.09.2026
    const w = dashboardWeekWindow(new Date(2026, 8, 6, 10, 0));
    expect(w.days).toHaveLength(8);
    expect(localDateString(w.start)).toBe("2026-09-06");
    expect(localDateString(w.end)).toBe("2026-09-13");
  });

  it("springt in der Nacht Samstag->Sonntag um", () => {
    // Samstag 05.09. spaetabends -> noch das alte Fenster
    expect(tage(new Date(2026, 8, 5, 23, 59))[0]).toBe("2026-08-30");
    // Sonntag 06.09. kurz nach Mitternacht -> neues Fenster
    expect(tage(new Date(2026, 8, 6, 0, 1))[0]).toBe("2026-09-06");
  });

  it("bleibt die ganze Arbeitswoche ueber stabil", () => {
    for (const tag of [7, 8, 9, 10, 11, 12]) {
      expect(tage(new Date(2026, 8, tag, 12, 0))[0]).toBe("2026-09-06");
    }
  });

  it("nennt als Arbeitswoche den Montag nach dem Start-Sonntag", () => {
    const w = dashboardWeekWindow(new Date(2026, 8, 6));
    expect(localDateString(w.arbeitswocheStart)).toBe("2026-09-07");
  });

  it("funktioniert ueber den Monatswechsel", () => {
    const w = dashboardWeekWindow(new Date(2026, 8, 30)); // Mi 30.09.
    expect(localDateString(w.start)).toBe("2026-09-27");
    expect(localDateString(w.end)).toBe("2026-10-04");
  });

  it("liefert lueckenlos aufeinanderfolgende Tage", () => {
    const w = dashboardWeekWindow(new Date(2026, 8, 6));
    for (let i = 1; i < w.days.length; i++) {
      const diff = (w.days[i].getTime() - w.days[i - 1].getTime()) / 86400000;
      expect(Math.round(diff)).toBe(1);
    }
  });
});

describe("datumMitUhrzeit", () => {
  it("zeigt Datum und Uhrzeit", () => {
    const t = datumMitUhrzeit(new Date(2026, 8, 8, 14, 23));
    expect(t).toContain("08.09.2026");
    expect(t).toContain("14:23");
  });

  it("fuellt zweistellig auf", () => {
    expect(datumMitUhrzeit(new Date(2026, 0, 5, 9, 5))).toContain("05.01.2026");
  });

  it("nimmt auch einen ISO-Text", () => {
    expect(datumMitUhrzeit("2026-09-08T12:00:00")).toContain("08.09.2026");
  });

  it("liefert bei Unsinn einen leeren Text statt Invalid Date", () => {
    expect(datumMitUhrzeit(null)).toBe("");
    expect(datumMitUhrzeit("")).toBe("");
    expect(datumMitUhrzeit("kaputt")).toBe("");
  });
});
