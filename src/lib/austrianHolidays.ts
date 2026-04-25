/**
 * Berechnet alle gesetzlichen Feiertage in Oesterreich fuer ein gegebenes Jahr.
 * Beinhaltet fixe und osterabhaengige (bewegliche) Feiertage.
 */

interface Holiday {
  datum: string; // YYYY-MM-DD
  bezeichnung: string;
}

/**
 * Berechnet das Osterdatum nach der Gauss'schen Osterformel.
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Gibt alle gesetzlichen Feiertage fuer Oesterreich zurueck.
 */
export function getAustrianHolidays(year: number): Holiday[] {
  const easter = getEasterDate(year);

  // Bewegliche Feiertage (osterabhaengig)
  const osterMontag = addDays(easter, 1);
  const christiHimmelfahrt = addDays(easter, 39);
  const pfingstMontag = addDays(easter, 50);
  const fronleichnam = addDays(easter, 60);

  return [
    { datum: `${year}-01-01`, bezeichnung: "Neujahr" },
    { datum: `${year}-01-06`, bezeichnung: "Heilige Drei Könige" },
    { datum: formatDate(osterMontag), bezeichnung: "Ostermontag" },
    { datum: `${year}-05-01`, bezeichnung: "Staatsfeiertag" },
    { datum: formatDate(christiHimmelfahrt), bezeichnung: "Christi Himmelfahrt" },
    { datum: formatDate(pfingstMontag), bezeichnung: "Pfingstmontag" },
    { datum: formatDate(fronleichnam), bezeichnung: "Fronleichnam" },
    { datum: `${year}-08-15`, bezeichnung: "Maria Himmelfahrt" },
    { datum: `${year}-10-26`, bezeichnung: "Nationalfeiertag" },
    { datum: `${year}-11-01`, bezeichnung: "Allerheiligen" },
    { datum: `${year}-12-08`, bezeichnung: "Maria Empfängnis" },
    { datum: `${year}-12-25`, bezeichnung: "Christtag" },
    { datum: `${year}-12-26`, bezeichnung: "Stefanitag" },
  ];
}

/**
 * Prueft ob ein Datum ein oesterreichischer Feiertag ist.
 */
export function isAustrianHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const dateStr = formatDate(date);
  return getAustrianHolidays(year).some((h) => h.datum === dateStr);
}

/**
 * Prueft ob ein Datum in einer Liste von Firmen-Feiertagen/Betriebsurlaub enthalten ist.
 */
export function isCompanyHoliday(date: Date, companyHolidays: string[]): boolean {
  const dateStr = formatDate(date);
  return companyHolidays.includes(dateStr);
}
