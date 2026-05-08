import { describe, expect, it } from "vitest";
import {
  calculateOvertime,
  getEntrySplit,
  getSchwellenwert,
  splitHours,
  DEFAULT_SCHEDULE,
  DEFAULT_SCHWELLENWERT,
  type Schwellenwert,
  type WeekSchedule,
} from "./workingHours";

// Hilfs-Daten
const mondayDate = new Date("2026-05-04"); // Montag
const tuesdayDate = new Date("2026-05-05");
const wednesdayDate = new Date("2026-05-06");
const fridayDate = new Date("2026-05-08"); // Freitag (Regelarbeitszeit 0h, Schwellenwert 0h)
const saturdayDate = new Date("2026-05-09");

describe("getSchwellenwert", () => {
  it("bei NULL Schwellenwert -> faellt auf Regelarbeitszeit-Stunden zurueck", () => {
    // DEFAULT_SCHEDULE: Mo 10h
    expect(getSchwellenwert(mondayDate, null, DEFAULT_SCHEDULE)).toBe(10);
    // Mi 9.5h
    expect(getSchwellenwert(wednesdayDate, null, DEFAULT_SCHEDULE)).toBe(9.5);
    // Fr 0h (frei)
    expect(getSchwellenwert(fridayDate, null, DEFAULT_SCHEDULE)).toBe(0);
  });

  it("bei expliziten Schwellenwerten -> diese werden genutzt", () => {
    const sw: Schwellenwert = { mo: 8, di: 8, mi: 8, do: 8, fr: 8, sa: 0, so: 0 };
    expect(getSchwellenwert(mondayDate, sw, DEFAULT_SCHEDULE)).toBe(8);
    expect(getSchwellenwert(fridayDate, sw, DEFAULT_SCHEDULE)).toBe(8);
    expect(getSchwellenwert(saturdayDate, sw, DEFAULT_SCHEDULE)).toBe(0);
  });

  it("bei biweekly: schaltet zwischen Woche A und B basierend auf Anker", () => {
    const sw: Schwellenwert = {
      mo: 10, di: 10, mi: 10, do: 10, fr: 10, sa: 0, so: 0,
      zyklus: "biweekly",
      woche_b: { mo: 8, di: 8, mi: 8, do: 8, fr: 8, sa: 0, so: 0 },
      zyklus_anker: "2026-05-04", // Anker = 4.5.2026 (Mo) = Woche A
    };
    // 4.5.2026 (Anker-Mo) = Woche A
    expect(getSchwellenwert(new Date("2026-05-04"), sw, DEFAULT_SCHEDULE)).toBe(10);
    // 11.5.2026 (Anker + 7 Tage) = Woche B
    expect(getSchwellenwert(new Date("2026-05-11"), sw, DEFAULT_SCHEDULE)).toBe(8);
    // 18.5.2026 (Anker + 14 Tage) = Woche A
    expect(getSchwellenwert(new Date("2026-05-18"), sw, DEFAULT_SCHEDULE)).toBe(10);
  });

  it("bei biweekly OHNE woche_b -> faellt auf Hauptwerte zurueck (kein Crash)", () => {
    // isBiweekly-Check verlangt zyklus + woche_b + anker. Wenn woche_b fehlt,
    // wird der Code so robust dass er auf die Hauptwerte zurueckfaellt
    // statt zu crashen oder 0 zurueckzugeben.
    const sw: Schwellenwert = {
      mo: 10, di: 10, mi: 10, do: 10, fr: 10, sa: 0, so: 0,
      zyklus: "biweekly",
      zyklus_anker: "2026-05-04",
    };
    const result = getSchwellenwert(new Date("2026-05-11"), sw, DEFAULT_SCHEDULE);
    expect(result).toBe(10); // Hauptwert Mo (kein Crash, kein 0)
  });
});

describe("calculateOvertime", () => {
  it("ohne Schwellenwert -> nutzt Regelarbeitszeit (alte Logik bleibt fuer Backwards-Compat)", () => {
    // Mo 10h Regelarbeitszeit. Arbeitet 11h -> 1h Ueberstunden
    expect(calculateOvertime(11, mondayDate, DEFAULT_SCHEDULE)).toBe(1);
    // Mo 10h, arbeitet 8h -> 0 Ueberstunden
    expect(calculateOvertime(8, mondayDate, DEFAULT_SCHEDULE)).toBe(0);
  });

  it("mit Schwellenwert -> nutzt diesen statt Regelarbeitszeit", () => {
    // Regelarbeitszeit Mo 10h, Schwellenwert 8h. 9h arbeit -> 1h ZA
    const sw: Schwellenwert = { mo: 8, di: 8, mi: 8, do: 8, fr: 0, sa: 0, so: 0 };
    expect(calculateOvertime(9, mondayDate, DEFAULT_SCHEDULE, sw)).toBe(1);
    // 7h -> 0 ZA
    expect(calculateOvertime(7, mondayDate, DEFAULT_SCHEDULE, sw)).toBe(0);
    // 12h -> 4h ZA
    expect(calculateOvertime(12, mondayDate, DEFAULT_SCHEDULE, sw)).toBe(4);
  });

  it("Wochenend-Arbeit gegen Schwellenwert 0 -> alles ZA", () => {
    const sw: Schwellenwert = { mo: 8, di: 8, mi: 8, do: 8, fr: 8, sa: 0, so: 0 };
    expect(calculateOvertime(5, saturdayDate, DEFAULT_SCHEDULE, sw)).toBe(5);
  });

  it("0 Stunden Arbeit -> 0 ZA, egal welcher Schwellenwert", () => {
    expect(calculateOvertime(0, mondayDate, DEFAULT_SCHEDULE, null)).toBe(0);
    expect(calculateOvertime(0, mondayDate, DEFAULT_SCHEDULE, DEFAULT_SCHWELLENWERT)).toBe(0);
  });

  it("Negative Stunden -> 0 ZA (defensive)", () => {
    expect(calculateOvertime(-2, mondayDate, DEFAULT_SCHEDULE, null)).toBe(0);
  });
});

describe("splitHours", () => {
  it("teilt korrekt in lohnstunden + zeitausgleich", () => {
    // Mo 10h Regelarbeitszeit, kein expliziter Schwellenwert -> 10h Schwelle
    const result = splitHours(11, mondayDate, DEFAULT_SCHEDULE, null);
    expect(result.lohnstunden).toBe(10);
    expect(result.zeitausgleich).toBe(1);
  });

  it("mit explizitem Schwellenwert", () => {
    const sw: Schwellenwert = { mo: 8, di: 8, mi: 8, do: 8, fr: 0, sa: 0, so: 0 };
    const result = splitHours(9.5, mondayDate, DEFAULT_SCHEDULE, sw);
    expect(result.lohnstunden).toBe(8);
    expect(result.zeitausgleich).toBe(1.5);
  });

  it("Stunden unter Schwelle -> alles in lohnstunden", () => {
    const sw: Schwellenwert = { mo: 8, di: 8, mi: 8, do: 8, fr: 0, sa: 0, so: 0 };
    const result = splitHours(6, mondayDate, DEFAULT_SCHEDULE, sw);
    expect(result.lohnstunden).toBe(6);
    expect(result.zeitausgleich).toBe(0);
  });

  it("0h -> alles 0", () => {
    const result = splitHours(0, mondayDate, DEFAULT_SCHEDULE, null);
    expect(result.lohnstunden).toBe(0);
    expect(result.zeitausgleich).toBe(0);
  });
});

describe("getEntrySplit", () => {
  it("nutzt DB-Werte wenn vorhanden", () => {
    const entry = {
      stunden: 11,
      lohnstunden: 8,
      zeitausgleich_stunden: 3,
      datum: "2026-05-04",
    };
    const result = getEntrySplit(entry, DEFAULT_SCHEDULE, null);
    // DB-Werte gewinnen, ignoriert Schwellenwert/Schedule
    expect(result.lohnstunden).toBe(8);
    expect(result.zeitausgleich).toBe(3);
  });

  it("rechnet zur Laufzeit wenn DB-Werte NULL", () => {
    const entry = {
      stunden: 11,
      lohnstunden: null,
      zeitausgleich_stunden: null,
      datum: "2026-05-04",
    };
    const sw: Schwellenwert = { mo: 8, di: 8, mi: 8, do: 8, fr: 0, sa: 0, so: 0 };
    const result = getEntrySplit(entry, DEFAULT_SCHEDULE, sw);
    expect(result.lohnstunden).toBe(8);
    expect(result.zeitausgleich).toBe(3);
  });

  it("rechnet zur Laufzeit wenn DB-Werte undefined", () => {
    const entry = { stunden: 9.5, datum: "2026-05-04" };
    const sw: Schwellenwert = { mo: 8, di: 8, mi: 8, do: 8, fr: 0, sa: 0, so: 0 };
    const result = getEntrySplit(entry, DEFAULT_SCHEDULE, sw);
    expect(result.lohnstunden).toBe(8);
    expect(result.zeitausgleich).toBe(1.5);
  });

  it("nur ein DB-Wert gesetzt -> trotzdem zur Laufzeit rechnen (nicht halb-mischen)", () => {
    const entry = {
      stunden: 11,
      lohnstunden: 8,
      zeitausgleich_stunden: null, // nur halb-gefuellt
      datum: "2026-05-04",
    };
    // getEntrySplit faellt auf splitHours zurueck wenn nicht beide DB-Werte gesetzt sind
    const result = getEntrySplit(entry, DEFAULT_SCHEDULE, null);
    // DEFAULT_SCHEDULE Mo = 10h Schwelle (kein expliziter Schwellenwert)
    expect(result.lohnstunden).toBe(10);
    expect(result.zeitausgleich).toBe(1);
  });
});

describe("Real-World-Szenarien (Franz' Bug)", () => {
  it("Mitarbeiter mit Regelarbeitszeit 8h + Schwellenwert 9h, arbeitet 9.5h", () => {
    // Aus dem Plan: 'Regelarbeitszeit Mo 8h, Schwellenwert Mo 9h, arbeitet 9.5h'
    // Erwartet: 0.5h ZA (= ueber Schwellenwert)
    const customSchedule: WeekSchedule = {
      ...DEFAULT_SCHEDULE,
      mo: { start: "08:00", end: "16:30", pause: 30, hours: 8 },
    };
    const sw: Schwellenwert = { mo: 9, di: 9, mi: 9, do: 9, fr: 0, sa: 0, so: 0 };

    expect(calculateOvertime(9.5, mondayDate, customSchedule, sw)).toBe(0.5);

    const split = splitHours(9.5, mondayDate, customSchedule, sw);
    expect(split.lohnstunden).toBe(9);
    expect(split.zeitausgleich).toBe(0.5);
  });

  it("Mitarbeiter ohne Schwellenwert (NULL) -> alte Logik gilt", () => {
    // Soll auf Regelarbeitszeit zurueckfallen
    const customSchedule: WeekSchedule = {
      ...DEFAULT_SCHEDULE,
      mo: { start: "08:00", end: "16:30", pause: 30, hours: 8 },
    };
    expect(calculateOvertime(9.5, mondayDate, customSchedule, null)).toBe(1.5);
  });

  it("Praezision: Floats wie 0.1+0.2 koennen nicht exakt sein", () => {
    // splitHours rundet auf 2 Dezimalstellen
    const split = splitHours(8.1, mondayDate, DEFAULT_SCHEDULE, {
      mo: 8, di: 8, mi: 8, do: 8, fr: 0, sa: 0, so: 0,
    });
    expect(split.lohnstunden).toBe(8);
    expect(split.zeitausgleich).toBeCloseTo(0.1, 2);
  });
});
