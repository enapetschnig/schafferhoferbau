import { describe, it, expect } from "vitest";
import { istArchiviert, aktiveGeraete, archivierteGeraete } from "./geraete";

const g = (
  id: string,
  name: string,
  extra: { sort_order?: number | null; archiviert_am?: string | null } = {}
) => ({ id, name, ...extra });

describe("istArchiviert", () => {
  it("fehlender oder leerer Wert = aktiv", () => {
    expect(istArchiviert(g("1", "Hilti"))).toBe(false);
    expect(istArchiviert(g("1", "Hilti", { archiviert_am: null }))).toBe(false);
    expect(istArchiviert(g("1", "Hilti", { archiviert_am: "" }))).toBe(false);
  });

  it("gesetzter Zeitpunkt = archiviert", () => {
    expect(istArchiviert(g("1", "Hilti", { archiviert_am: "2026-09-16T10:00:00Z" }))).toBe(true);
  });
});

describe("aktiveGeraete", () => {
  it("laesst archivierte weg", () => {
    const liste = [
      g("1", "Bus", { archiviert_am: "2026-09-16T10:00:00Z" }),
      g("2", "Anhänger"),
    ];
    expect(aktiveGeraete(liste).map((x) => x.id)).toEqual(["2"]);
  });

  it("reiht nach Prioritaet, Unpriorisierte alphabetisch dahinter", () => {
    // Genau wie bei den Projekten: 6 Geraete, Franz setzt den Tesla nach oben
    const liste = [
      g("a", "Auto Anhänger Eduard P4"),
      g("b", "Bohrmaschine Hilti TE 70-ATC"),
      g("c", "Bus silber VW Transporter"),
      g("d", "MAN Bus TGE 180", { sort_order: 1 }),
      g("e", "Schwarzer Bus VW Crafter"),
      g("f", "Tesla y 2025", { sort_order: 0 }),
    ];
    expect(aktiveGeraete(liste).map((x) => x.id)).toEqual(["f", "d", "a", "b", "c", "e"]);
  });

  it("aendert die Eingabe nicht", () => {
    const liste = [g("b", "B"), g("a", "A")];
    aktiveGeraete(liste);
    expect(liste.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("archivierteGeraete", () => {
  it("nur archivierte, zuletzt archivierte zuerst", () => {
    const liste = [
      g("alt", "Alte Säge", { archiviert_am: "2025-01-10T08:00:00Z" }),
      g("aktiv", "Hilti"),
      g("neu", "Alter Bus", { archiviert_am: "2026-09-16T10:00:00Z" }),
    ];
    expect(archivierteGeraete(liste).map((x) => x.id)).toEqual(["neu", "alt"]);
  });

  it("bei gleichem Zeitpunkt alphabetisch", () => {
    const liste = [
      g("2", "Zange", { archiviert_am: "2026-09-16T10:00:00Z" }),
      g("1", "Bohrer", { archiviert_am: "2026-09-16T10:00:00Z" }),
    ];
    expect(archivierteGeraete(liste).map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("kommt mit leerer Liste zurecht", () => {
    expect(archivierteGeraete([])).toEqual([]);
  });
});
