import { describe, it, expect } from "vitest";
import {
  snapTimeTo15,
  minutenAusZeit,
  pausenAbzugMinuten,
  pauseAusserhalbArbeitszeit,
  blockStunden,
} from "./timeUtils";

describe("snapTimeTo15", () => {
  it("rundet auf den naechsten Viertelstundenschritt", () => {
    expect(snapTimeTo15("07:07")).toBe("07:00");
    expect(snapTimeTo15("07:08")).toBe("07:15");
  });

  it("laesst Unfertiges unveraendert", () => {
    expect(snapTimeTo15("")).toBe("");
    expect(snapTimeTo15("7")).toBe("7");
  });
});

describe("minutenAusZeit", () => {
  it("rechnet um", () => {
    expect(minutenAusZeit("07:00")).toBe(420);
    expect(minutenAusZeit("00:00")).toBe(0);
    expect(minutenAusZeit("23:59")).toBe(1439);
  });

  it("weist Unsinn ab", () => {
    expect(minutenAusZeit(null)).toBeNull();
    expect(minutenAusZeit("")).toBeNull();
    expect(minutenAusZeit("25:00")).toBeNull();
    expect(minutenAusZeit("07:99")).toBeNull();
    expect(minutenAusZeit("abc")).toBeNull();
  });
});

describe("pausenAbzugMinuten", () => {
  it("der gemeldete Fall: Pause direkt nach Arbeitsende zieht nichts ab", () => {
    // Franz, 09.09.2026: 07:00-12:00, Pause 12:00-12:30 -> 5,00 h statt 4,50 h
    expect(pausenAbzugMinuten("07:00", "12:00", "12:00", "12:30")).toBe(0);
  });

  it("Pause komplett davor zieht nichts ab", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", "06:00", "06:30")).toBe(0);
    expect(pausenAbzugMinuten("07:00", "12:00", "06:30", "07:00")).toBe(0);
  });

  it("Pause komplett danach zieht nichts ab", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", "13:00", "13:30")).toBe(0);
  });

  it("Pause mitten drin zieht voll ab", () => {
    expect(pausenAbzugMinuten("07:00", "16:00", "12:00", "12:30")).toBe(30);
  });

  it("Pause ragt vorne heraus - nur der innere Teil", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", "06:45", "07:15")).toBe(15);
  });

  it("Pause ragt hinten heraus - nur der innere Teil", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", "11:45", "12:15")).toBe(15);
  });

  it("Pause umschliesst die ganze Arbeitszeit", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", "06:00", "13:00")).toBe(300);
  });

  it("verdrehte Pause zieht nichts ab", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", "12:30", "12:00")).toBe(0);
  });

  it("gleiche Pausenzeiten ziehen nichts ab", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", "09:00", "09:00")).toBe(0);
  });

  it("ohne Pause nichts", () => {
    expect(pausenAbzugMinuten("07:00", "12:00", null, null)).toBe(0);
    expect(pausenAbzugMinuten("07:00", "12:00", "09:00", null)).toBe(0);
  });

  it("ohne gueltige Arbeitszeit nichts", () => {
    expect(pausenAbzugMinuten(null, "12:00", "09:00", "09:30")).toBe(0);
    expect(pausenAbzugMinuten("12:00", "07:00", "09:00", "09:30")).toBe(0);
  });
});

describe("pauseAusserhalbArbeitszeit", () => {
  it("erkennt eine Pause ausserhalb", () => {
    expect(pauseAusserhalbArbeitszeit("07:00", "12:00", "12:00", "12:30")).toBe(true);
  });

  it("erkennt eine teilweise herausragende Pause", () => {
    expect(pauseAusserhalbArbeitszeit("07:00", "12:00", "11:45", "12:15")).toBe(true);
  });

  it("eine Pause mitten drin ist nicht ausserhalb", () => {
    expect(pauseAusserhalbArbeitszeit("07:00", "16:00", "12:00", "12:30")).toBe(false);
  });

  it("ohne Pause kein Hinweis", () => {
    expect(pauseAusserhalbArbeitszeit("07:00", "12:00", null, null)).toBe(false);
  });
});

describe("blockStunden", () => {
  it("der gemeldete Fall ergibt 5 Stunden", () => {
    expect(blockStunden("07:00", "12:00", "12:00", "12:30")).toBe(5);
  });

  it("mit echter Pause dazwischen", () => {
    expect(blockStunden("07:00", "16:00", "12:00", "12:30")).toBe(8.5);
  });

  it("ohne Pause", () => {
    expect(blockStunden("07:00", "12:00", null, null)).toBe(5);
  });

  it("Pause laenger als die Arbeitszeit ergibt 0", () => {
    expect(blockStunden("07:00", "12:00", "06:00", "13:00")).toBe(0);
  });

  it("unvollstaendige Angaben ergeben 0", () => {
    expect(blockStunden(null, "12:00", null, null)).toBe(0);
    expect(blockStunden("07:00", null, null, null)).toBe(0);
  });

  it("Ende vor Beginn ergibt 0", () => {
    expect(blockStunden("12:00", "07:00", null, null)).toBe(0);
  });
});
