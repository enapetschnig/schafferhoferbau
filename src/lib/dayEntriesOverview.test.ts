import { describe, it, expect } from "vitest";
import {
  summeStunden,
  gruppiereNachPerson,
  zeigeTagesuebersicht,
} from "./dayEntriesOverview";

const ICH = "ich-uuid";
const MARKUS = "markus-uuid";
const ANNA = "anna-uuid";

const e = (user_id: string, stunden: number | string) => ({ user_id, stunden });

const namen: Record<string, string> = {
  [ICH]: "Franz Schafferhofer",
  [MARKUS]: "Markus Friesenbichler",
  [ANNA]: "Anna Huber",
};
const nameVon = (id: string) => namen[id];

describe("summeStunden", () => {
  it("addiert Zahlen", () => {
    expect(summeStunden([e(ICH, 5), e(ICH, 2.5)])).toBe(7.5);
  });

  it("toleriert Text aus der Datenbank", () => {
    expect(summeStunden([e(ICH, "5.00"), e(ICH, "2.50")])).toBe(7.5);
  });

  it("leere Liste ergibt 0", () => {
    expect(summeStunden([])).toBe(0);
  });
});

describe("gruppiereNachPerson", () => {
  it("zeigt nur ausgewaehlte Personen", () => {
    const gruppen = gruppiereNachPerson(
      [e(ICH, 5), e(MARKUS, 8)],
      [MARKUS],
      nameVon,
      ICH
    );
    expect(gruppen.map((g) => g.userId)).toEqual([MARKUS]);
  });

  it("der Fall Franz: niemand ausgewaehlt -> nichts", () => {
    const gruppen = gruppiereNachPerson([e(ICH, 5)], [], nameVon, ICH);
    expect(gruppen).toHaveLength(0);
  });

  it("stellt den Erfasser nach oben", () => {
    const gruppen = gruppiereNachPerson(
      [e(MARKUS, 8), e(ICH, 5)],
      [MARKUS, ICH],
      nameVon,
      ICH
    );
    expect(gruppen[0].istIchSelbst).toBe(true);
    expect(gruppen[0].name).toBe("Franz Schafferhofer");
  });

  it("sortiert die uebrigen alphabetisch", () => {
    const gruppen = gruppiereNachPerson(
      [e(MARKUS, 8), e(ANNA, 4)],
      [MARKUS, ANNA],
      nameVon,
      ICH
    );
    expect(gruppen.map((g) => g.name)).toEqual([
      "Anna Huber",
      "Markus Friesenbichler",
    ]);
  });

  it("fasst mehrere Eintraege einer Person zusammen", () => {
    const gruppen = gruppiereNachPerson(
      [e(MARKUS, 4), e(MARKUS, 3.5)],
      [MARKUS],
      nameVon,
      ICH
    );
    expect(gruppen[0].entries).toHaveLength(2);
    expect(gruppen[0].summe).toBe(7.5);
  });

  it("laesst Ausgewaehlte ohne Stunden weg", () => {
    // Anna ist ausgewaehlt, hat aber keine Eintraege -> keine leere Gruppe
    const gruppen = gruppiereNachPerson([e(MARKUS, 8)], [MARKUS, ANNA], nameVon, ICH);
    expect(gruppen.map((g) => g.userId)).toEqual([MARKUS]);
  });

  it("ignoriert Eintraege ohne user_id", () => {
    const gruppen = gruppiereNachPerson(
      [{ user_id: null, stunden: 5 }],
      [MARKUS],
      nameVon,
      ICH
    );
    expect(gruppen).toHaveLength(0);
  });

  it("faellt bei unbekanntem Namen nicht um", () => {
    const gruppen = gruppiereNachPerson([e("fremd", 5)], ["fremd"], nameVon, ICH);
    expect(gruppen[0].name).toBe("Unbekannt");
  });
});

describe("zeigeTagesuebersicht", () => {
  it("ausserhalb des Mehrfach-Modus immer", () => {
    expect(zeigeTagesuebersicht(false, [], { length: 0 })).toBe(true);
  });

  it("Mehrfach-Modus ohne Auswahl: nein (der gemeldete Fall)", () => {
    expect(zeigeTagesuebersicht(true, [], { length: 0 })).toBe(false);
  });

  it("Mehrfach-Modus mit Auswahl, aber niemand hat Stunden: nein", () => {
    expect(zeigeTagesuebersicht(true, [MARKUS], { length: 0 })).toBe(false);
  });

  it("Mehrfach-Modus mit Auswahl und Stunden: ja", () => {
    expect(zeigeTagesuebersicht(true, [MARKUS], { length: 1 })).toBe(true);
  });
});
