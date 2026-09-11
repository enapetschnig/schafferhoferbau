import { describe, it, expect } from "vitest";
import {
  minutenSeitMitternacht,
  arbeiterDesBlocks,
  bloeckeJeArbeiter,
  arbeiterOhneBlock,
  findeBlockUeberschneidung,
  findeBestandsUeberschneidung,
  type ArbeitszeitBlock,
} from "./blockArbeiter";

const b = (
  id: string,
  startTime: string,
  endTime: string,
  workerIds?: string[]
): ArbeitszeitBlock => ({ id, startTime, endTime, workerIds });

const A = "user-a";
const B = "user-b";
const C = "user-c";

describe("minutenSeitMitternacht", () => {
  it("rechnet normale Zeiten um", () => {
    expect(minutenSeitMitternacht("07:00")).toBe(420);
    expect(minutenSeitMitternacht("13:30")).toBe(810);
    expect(minutenSeitMitternacht("00:00")).toBe(0);
    expect(minutenSeitMitternacht("7:15")).toBe(435);
  });

  it("verwirft Sekunden aus der Datenbank", () => {
    // time_entries liefert "07:00:00"
    expect(minutenSeitMitternacht("07:00:00")).toBe(420);
    expect(minutenSeitMitternacht("13:30:45")).toBe(810);
  });

  it("liefert null bei Unsinn", () => {
    expect(minutenSeitMitternacht("")).toBeNull();
    expect(minutenSeitMitternacht("abc")).toBeNull();
    expect(minutenSeitMitternacht("25:00")).toBeNull();
    expect(minutenSeitMitternacht("10:75")).toBeNull();
  });
});

describe("arbeiterDesBlocks", () => {
  it("ohne eigene Auswahl gelten alle", () => {
    expect(arbeiterDesBlocks(b("1", "07:00", "17:00"), [A, B])).toEqual([A, B]);
    expect(arbeiterDesBlocks(b("1", "07:00", "17:00", []), [A, B])).toEqual([A, B]);
  });

  it("mit eigener Auswahl gilt nur diese", () => {
    expect(arbeiterDesBlocks(b("1", "07:00", "17:00", [B]), [A, B])).toEqual([B]);
  });

  it("filtert oben abgewaehlte Arbeiter heraus", () => {
    expect(arbeiterDesBlocks(b("1", "07:00", "17:00", [A, C]), [A, B])).toEqual([A]);
  });

  it("faellt auf alle zurueck, wenn nichts mehr gueltig ist", () => {
    expect(arbeiterDesBlocks(b("1", "07:00", "17:00", [C]), [A, B])).toEqual([A, B]);
  });

  it("aendert die Vorgabeliste nicht", () => {
    const alle = [A, B];
    arbeiterDesBlocks(b("1", "07:00", "17:00"), alle).push(C);
    expect(alle).toEqual([A, B]);
  });
});

describe("bloeckeJeArbeiter", () => {
  it("Fall Franz: jeder bekommt nur seinen Block", () => {
    const bloecke = [b("1", "07:00", "17:00", [A]), b("2", "13:00", "17:00", [B])];
    const karte = bloeckeJeArbeiter(bloecke, [A, B]);
    expect(karte.get(A)).toEqual([0]);
    expect(karte.get(B)).toEqual([1]);
  });

  it("ohne Einschraenkung bekommt jeder alle Bloecke", () => {
    const karte = bloeckeJeArbeiter([b("1", "07:00", "12:00"), b("2", "13:00", "17:00")], [A, B]);
    expect(karte.get(A)).toEqual([0, 1]);
    expect(karte.get(B)).toEqual([0, 1]);
  });

  it("behaelt die Block-Reihenfolge", () => {
    const bloecke = [
      b("1", "07:00", "09:00", [A]),
      b("2", "09:00", "12:00", [B]),
      b("3", "13:00", "17:00", [A]),
    ];
    expect(bloeckeJeArbeiter(bloecke, [A, B]).get(A)).toEqual([0, 2]);
  });

  it("kommt mit leerer Blockliste zurecht", () => {
    expect(bloeckeJeArbeiter([], [A]).size).toBe(0);
  });
});

describe("arbeiterOhneBlock", () => {
  it("findet den vergessenen Arbeiter", () => {
    const bloecke = [b("1", "07:00", "17:00", [A])];
    expect(arbeiterOhneBlock(bloecke, [A, B])).toEqual([B]);
  });

  it("meldet nichts, wenn jeder drankommt", () => {
    const bloecke = [b("1", "07:00", "17:00", [A]), b("2", "13:00", "17:00", [B])];
    expect(arbeiterOhneBlock(bloecke, [A, B])).toEqual([]);
  });

  it("meldet nichts ohne Einschraenkung", () => {
    expect(arbeiterOhneBlock([b("1", "07:00", "17:00")], [A, B])).toEqual([]);
  });
});

describe("findeBlockUeberschneidung", () => {
  it("Fall Franz wird NICHT mehr abgelehnt", () => {
    // 07:00-17:00 (A) und 13:00-17:00 (B) ueberlappen zeitlich, aber
    // verschiedene Leute - genau das war bisher unmoeglich.
    const bloecke = [b("1", "07:00", "17:00", [A]), b("2", "13:00", "17:00", [B])];
    expect(findeBlockUeberschneidung(bloecke, [A, B])).toBeNull();
  });

  it("derselbe Arbeiter darf sich nicht selbst ueberschneiden", () => {
    const bloecke = [b("1", "07:00", "17:00", [A]), b("2", "13:00", "17:00", [A, B])];
    expect(findeBlockUeberschneidung(bloecke, [A, B])).toEqual({ a: 0, b: 1, userId: A });
  });

  it("ohne Einschraenkung bleibt es bei der alten strengen Pruefung", () => {
    const bloecke = [b("1", "07:00", "17:00"), b("2", "13:00", "17:00")];
    expect(findeBlockUeberschneidung(bloecke, [A])).toEqual({ a: 0, b: 1, userId: A });
  });

  it("anschliessende Bloecke ueberschneiden sich nicht", () => {
    const bloecke = [b("1", "07:00", "12:00"), b("2", "12:00", "17:00")];
    expect(findeBlockUeberschneidung(bloecke, [A])).toBeNull();
  });

  it("ueberspringt Bloecke ohne gueltige Zeiten", () => {
    const bloecke = [b("1", "", "", [A]), b("2", "13:00", "17:00", [A])];
    expect(findeBlockUeberschneidung(bloecke, [A])).toBeNull();
  });

  it("findet die Ueberschneidung auch bei drei Bloecken", () => {
    const bloecke = [
      b("1", "07:00", "12:00", [A]),
      b("2", "13:00", "17:00", [B]),
      b("3", "14:00", "18:00", [B]),
    ];
    expect(findeBlockUeberschneidung(bloecke, [A, B])).toEqual({ a: 1, b: 2, userId: B });
  });
});

describe("findeBestandsUeberschneidung", () => {
  const bloecke = [b("1", "07:00", "17:00", [A]), b("2", "13:00", "17:00", [B])];

  it("trifft nur den Arbeiter, dem der Block gehoert", () => {
    // Bestandseintrag 08:00-09:00 fuer B - Bs Block laeuft erst ab 13:00.
    expect(findeBestandsUeberschneidung(bloecke, [A, B], B, "08:00", "09:00")).toBeNull();
    // Fuer A schlaegt derselbe Eintrag an.
    expect(findeBestandsUeberschneidung(bloecke, [A, B], A, "08:00", "09:00")).toBe(0);
  });

  it("liefert den richtigen Blockindex", () => {
    expect(findeBestandsUeberschneidung(bloecke, [A, B], B, "14:00", "15:00")).toBe(1);
  });

  it("Beruehrung ist keine Ueberschneidung", () => {
    expect(findeBestandsUeberschneidung(bloecke, [A, B], A, "06:00", "07:00")).toBeNull();
    expect(findeBestandsUeberschneidung(bloecke, [A, B], A, "17:00", "18:00")).toBeNull();
  });

  it("liefert null fuer einen unbeteiligten Arbeiter", () => {
    expect(findeBestandsUeberschneidung(bloecke, [A, B], C, "08:00", "09:00")).toBeNull();
  });

  it("versteht die Sekundenform aus der Datenbank", () => {
    // time_entries liefert "07:00:00" - darf nicht stillschweigend
    // durchrutschen, sonst faende man die Ueberschneidung nie.
    expect(findeBestandsUeberschneidung(bloecke, [A, B], A, "08:00:00", "09:00:00")).toBe(0);
  });
});
