export interface WorkTimePreset {
  startTime: string;
  endTime: string;
  pauseStart: string;
  pauseEnd: string;
  pauseMinutes: number;
  totalHours: number;
}

export interface DaySchedule {
  start: string | null;
  end: string | null;
  pause: number;
  pause_start?: string;
  pause_end?: string;
  hours: number;
}

export interface WeekSchedule {
  mo: DaySchedule;
  di: DaySchedule;
  mi: DaySchedule;
  do: DaySchedule;
  fr: DaySchedule;
  sa: DaySchedule;
  so: DaySchedule;
}

/**
 * Schwellenwert = Tages-Obergrenze fuer Lohnstunden.
 * Stunden bis zum Schwellenwert = Lohnverrechnung (ausbezahlt).
 * Stunden ueber dem Schwellenwert = Zeitausgleich (nicht ausbezahlt).
 */
export interface Schwellenwert {
  mo: number;
  di: number;
  mi: number;
  do: number;
  fr: number;
  sa: number;
  so: number;
}

export interface HoursSplit {
  lohnstunden: number;
  zeitausgleich: number;
}

// Standard-Regelarbeitszeit für Facharbeiter bei Schafferhofer Bau
// Mo/Di: 06:30-17:00 (Pause 30min → 10h), Mi/Do: 07:00-17:00 (Pause 30min → 9,5h)
// Wochenregelarbeitszeit: 39h
export const DEFAULT_SCHEDULE: WeekSchedule = {
  mo: { start: "06:30", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 10 },
  di: { start: "06:30", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 10 },
  mi: { start: "07:00", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 9.5 },
  do: { start: "07:00", end: "17:00", pause: 30, pause_start: "12:00", pause_end: "12:30", hours: 9.5 },
  fr: { start: null, end: null, pause: 0, hours: 0 },
  sa: { start: null, end: null, pause: 0, hours: 0 },
  so: { start: null, end: null, pause: 0, hours: 0 },
};

// Standard für Lehrlinge (kürzere Arbeitszeiten)
export const LEHRLING_SCHEDULE: WeekSchedule = {
  mo: { start: "07:00", end: "16:00", pause: 30, hours: 8.5 },
  di: { start: "07:00", end: "16:00", pause: 30, hours: 8.5 },
  mi: { start: "07:00", end: "16:00", pause: 30, hours: 8.5 },
  do: { start: "07:00", end: "16:00", pause: 30, hours: 8.5 },
  fr: { start: "07:00", end: "12:00", pause: 0, hours: 5 },
  sa: { start: null, end: null, pause: 0, hours: 0 },
  so: { start: null, end: null, pause: 0, hours: 0 },
};

const DAY_KEYS: Record<number, keyof WeekSchedule> = {
  0: "so",
  1: "mo",
  2: "di",
  3: "mi",
  4: "do",
  5: "fr",
  6: "sa",
};

function getDayKey(date: Date): keyof WeekSchedule {
  return DAY_KEYS[date.getDay()];
}

/**
 * Gibt die Normalarbeitszeit für einen Tag zurück, basierend auf individuellem Zeitplan
 */
export function getNormalWorkingHours(date: Date, schedule?: WeekSchedule | null): number {
  const s = schedule || DEFAULT_SCHEDULE;
  const dayKey = getDayKey(date);
  return s[dayKey]?.hours ?? 0;
}

/**
 * Gibt die Freitags-Überstunde zurück (nicht mehr relevant, bleibt für Kompatibilität)
 */
export function getFridayOvertime(_date: Date): number {
  return 0;
}

/**
 * Gibt die tatsächlichen Arbeitsstunden für einen Wochentag zurück
 */
export function getTotalWorkingHours(date: Date, schedule?: WeekSchedule | null): number {
  return getNormalWorkingHours(date, schedule);
}

/**
 * Gibt das Wochensoll zurück basierend auf individuellem Zeitplan
 */
export function getWeeklyTargetHours(schedule?: WeekSchedule | null): number {
  const s = schedule || DEFAULT_SCHEDULE;
  return Object.values(s).reduce((sum, day) => sum + (day?.hours ?? 0), 0);
}

/**
 * Gibt Standard-Arbeitszeiten für einen Tag zurück basierend auf individuellem Zeitplan
 */
export function getDefaultWorkTimes(date: Date, schedule?: WeekSchedule | null): WorkTimePreset | null {
  const s = schedule || DEFAULT_SCHEDULE;
  const dayKey = getDayKey(date);
  const day = s[dayKey];

  if (!day || !day.start || !day.end || day.hours === 0) return null;

  // Pausenzeit: direkt aus Schedule verwenden wenn vorhanden, sonst Mitte der Arbeitszeit
  let pauseStart: string;
  let pauseEnd: string;
  if (day.pause_start && day.pause_end) {
    pauseStart = day.pause_start;
    pauseEnd = day.pause_end;
  } else if (day.pause > 0) {
    const startMinutes = timeToMinutes(day.start);
    const endMinutes = timeToMinutes(day.end);
    const midpoint = Math.floor((startMinutes + endMinutes) / 2);
    const pauseStartMinutes = midpoint - Math.floor(day.pause / 2);
    pauseStart = minutesToTime(pauseStartMinutes);
    pauseEnd = minutesToTime(pauseStartMinutes + day.pause);
  } else {
    pauseStart = "";
    pauseEnd = "";
  }

  return {
    startTime: day.start,
    endTime: day.end,
    pauseStart,
    pauseEnd,
    pauseMinutes: day.pause,
    totalHours: day.hours,
  };
}

/**
 * Prüft ob ein Tag ein arbeitsfreier Tag ist basierend auf individuellem Zeitplan
 */
export function isNonWorkingDay(date: Date, schedule?: WeekSchedule | null): boolean {
  return getNormalWorkingHours(date, schedule) === 0;
}

/**
 * Berechnet Überstunden für einen Zeitblock
 */
export function calculateOvertime(actualHours: number, date: Date, schedule?: WeekSchedule | null): number {
  const normalHours = getNormalWorkingHours(date, schedule);
  return Math.max(0, actualHours - normalHours);
}

/**
 * Berechnet Diäten basierend auf Arbeitsstunden
 * Österreichische Regelung:
 * - 3-9 Stunden: Tagesgebühr "klein" (derzeit 2,20 EUR pro angefangene Stunde nach 3h)
 * - Über 9 Stunden: Tagesgebühr "groß" (26,40 EUR pauschal)
 * - Baustellenanfahrt: einmal täglich (4,40 EUR)
 */
export function calculateDiaeten(
  totalHoursOnDay: number,
  isConstructionSite: boolean
): { typ: 'keine' | 'klein' | 'gross' | 'anfahrt'; betrag: number } {
  let typ: 'keine' | 'klein' | 'gross' | 'anfahrt' = 'keine';
  let betrag = 0;

  if (totalHoursOnDay > 9) {
    typ = 'gross';
    betrag = 26.40;
  } else if (totalHoursOnDay >= 3) {
    typ = 'klein';
    betrag = 2.20 * Math.min(totalHoursOnDay, 9);
  }

  // Baustellenanfahrt-Pauschale
  if (isConstructionSite && totalHoursOnDay > 0) {
    betrag += 4.40;
    if (typ === 'keine') typ = 'anfahrt';
  }

  return { typ, betrag: Math.round(betrag * 100) / 100 };
}

/**
 * Berechnet Kilometergeld (amtliches Kilometergeld Österreich 2025: 0,42 EUR/km)
 * Rate kann ueber Admin-Einstellungen konfiguriert werden.
 */
export function calculateKilometergeld(km: number, rate: number = 0.42): number {
  return Math.round(km * rate * 100) / 100;
}

/**
 * Gibt den Schwellenwert fuer einen bestimmten Tag zurueck.
 * Wenn kein Schwellenwert gesetzt ist, werden die Regelarbeitszeit-Stunden verwendet.
 */
export function getSchwellenwert(
  date: Date,
  schwellenwert?: Schwellenwert | null,
  schedule?: WeekSchedule | null
): number {
  if (schwellenwert) {
    const dayKey = getDayKey(date);
    return schwellenwert[dayKey] ?? 0;
  }
  // Fallback: Regelarbeitszeit-Stunden als Schwellenwert
  return getNormalWorkingHours(date, schedule);
}

/**
 * Teilt die Gesamtstunden eines Tages in Lohnstunden und Zeitausgleich auf.
 * - Lohnstunden: Stunden bis zum Schwellenwert (werden ausbezahlt)
 * - Zeitausgleich: Stunden ueber dem Schwellenwert (nicht ausbezahlt, gehen ins ZA-Konto)
 */
export function splitHours(
  totalHours: number,
  date: Date,
  schedule?: WeekSchedule | null,
  schwellenwert?: Schwellenwert | null
): HoursSplit {
  if (totalHours <= 0) return { lohnstunden: 0, zeitausgleich: 0 };

  const threshold = getSchwellenwert(date, schwellenwert, schedule);

  if (totalHours <= threshold) {
    return { lohnstunden: totalHours, zeitausgleich: 0 };
  }

  return {
    lohnstunden: threshold,
    zeitausgleich: Math.round((totalHours - threshold) * 100) / 100,
  };
}

// Hilfsfunktionen
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
