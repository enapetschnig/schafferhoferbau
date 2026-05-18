import { supabase } from "@/integrations/supabase/client";
import { getDaysInMonth, parseISO } from "date-fns";
import {
  calculateZASaldo,
  getNormalWorkingHours,
  getSchwellenwert,
  type Schwellenwert,
  type WeekSchedule,
} from "@/lib/workingHours";

export type DiaetenTyp = "klein" | "gross" | "anfahrt" | "keine" | null;

export interface AzgDayRow {
  datum: string;
  beginn: string | null;
  ende: string | null;
  pauseMinutes: number;
  arbeitszeit: number;
  lohnstunden: number;
  normalstunden: number;
  ueberstundenLohn: number;
  ueberstunden: number; // ZA-Saldo (kann negativ)
  anmerkung: string | null;
  schlechtwetterStunden: number;
  diaetenTyp: DiaetenTyp;
}

export interface AzgSnapshot {
  employeeName: string;
  monat: number;
  jahr: number;
  rows: AzgDayRow[];
  totalPause: number;
  workingDays: number;
  totalBadWeatherHours: number;
  totalLohnstunden: number;
  totalNormalstunden: number;
  totalUeberstundenLohn: number;
  dietKlein: number;
  dietGross: number;
  dietAnfahrt: number;
  totalFeiertage: number;
  /** Wann der Snapshot eingefroren wurde — typischerweise der Zeitpunkt der ersten Unterschrift. */
  frozen_at: string;
}

export interface AzgSignatureRow {
  id: string;
  user_id: string;
  monat: number;
  jahr: number;
  snapshot: AzgSnapshot | null;
  employee_signature: string | null;
  employee_signed_at: string | null;
  employer_signature: string | null;
  employer_signed_at: string | null;
  employer_user_id: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Baut den Snapshot fuer einen Mitarbeiter+Monat aus den aktuellen DB-Daten.
 * Identische Logik wie `fetchData` in LegalWorkTimeReport — extrahiert damit
 * Mitarbeiter-Selbstunterschrift und Admin-Unterschrift exakt dieselben
 * Zahlen sehen.
 */
export async function buildAzgSnapshot(
  userId: string,
  monat: number,
  jahr: number,
  employeeName: string,
): Promise<AzgSnapshot> {
  const startDate = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  const daysInMonth = getDaysInMonth(new Date(jahr, monat - 1));
  const endDate = `${jahr}-${String(monat).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const [{ data: entries }, { data: weatherData }, { data: empData }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("datum, start_time, end_time, pause_minutes, stunden, lohnstunden, zeitausgleich_stunden, taetigkeit, diaeten_typ")
      .eq("user_id", userId)
      .gte("datum", startDate)
      .lte("datum", endDate)
      .order("datum")
      .order("start_time"),
    supabase
      .from("bad_weather_records")
      .select("datum, schlechtwetter_stunden")
      .eq("user_id", userId)
      .gte("datum", startDate)
      .lte("datum", endDate),
    supabase
      .from("employees")
      .select("regelarbeitszeit, schwellenwert")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const schedule = empData?.regelarbeitszeit ? (empData.regelarbeitszeit as unknown as WeekSchedule) : null;
  const schwellenwert = empData?.schwellenwert ? (empData.schwellenwert as unknown as Schwellenwert) : null;

  type Grouped = {
    starts: string[]; ends: string[]; pause: number; stunden: number;
    taetigkeit: string[]; diaeten: string[];
    dbLohn: number; dbZA: number; dbCount: number; entryCount: number;
  };
  const grouped: Record<string, Grouped> = {};
  for (const entry of entries || []) {
    if (!grouped[entry.datum]) {
      grouped[entry.datum] = {
        starts: [], ends: [], pause: 0, stunden: 0, taetigkeit: [], diaeten: [],
        dbLohn: 0, dbZA: 0, dbCount: 0, entryCount: 0,
      };
    }
    const g = grouped[entry.datum];
    if (entry.start_time) g.starts.push(entry.start_time);
    if (entry.end_time) g.ends.push(entry.end_time);
    g.pause += entry.pause_minutes || 0;
    g.stunden += entry.stunden || 0;
    if (entry.taetigkeit) g.taetigkeit.push(entry.taetigkeit);
    if (entry.diaeten_typ && entry.diaeten_typ !== "keine") g.diaeten.push(entry.diaeten_typ);
    g.entryCount++;
    if (entry.lohnstunden != null && entry.zeitausgleich_stunden != null) {
      g.dbLohn += Number(entry.lohnstunden);
      g.dbZA += Number(entry.zeitausgleich_stunden);
      g.dbCount++;
    }
  }

  const weatherByDate: Record<string, number> = {};
  for (const w of weatherData || []) {
    weatherByDate[w.datum] = (weatherByDate[w.datum] || 0) + (w.schlechtwetter_stunden || 0);
  }

  const rows: AzgDayRow[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const datum = `${jahr}-${String(monat).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const g = grouped[datum];
    const swHours = weatherByDate[datum] || 0;
    const dayDate = parseISO(datum);

    let anmerkung: string | null = null;
    if (swHours > 0) anmerkung = "SW";
    if (g?.taetigkeit.includes("Urlaub")) anmerkung = "U";
    if (g?.taetigkeit.includes("Krankenstand")) anmerkung = "K";
    if (g?.taetigkeit.includes("Feiertag")) anmerkung = "F";
    if (g?.taetigkeit.includes("Zeitausgleich")) anmerkung = "ZA";

    const diaetenTyp = (g?.diaeten[0] as DiaetenTyp) || null;

    if (g) {
      const beginn = g.starts.length > 0 ? g.starts.sort()[0]?.slice(0, 5) : null;
      const ende = g.ends.length > 0 ? g.ends.sort().reverse()[0]?.slice(0, 5) : null;
      const arbeitszeit = Math.round(g.stunden * 100) / 100;
      const isPureWorkDay = !["Urlaub", "Krankenstand", "Feiertag", "Zeitausgleich"]
        .some((t) => g.taetigkeit.includes(t));

      const hasFullDBSplit = g.dbCount === g.entryCount && g.entryCount > 0;
      let lohnstunden: number;
      let ueberstunden: number;
      if (hasFullDBSplit) {
        lohnstunden = Math.round(g.dbLohn * 100) / 100;
        ueberstunden = isPureWorkDay ? Math.round(g.dbZA * 100) / 100 : 0;
      } else {
        const threshold = getSchwellenwert(dayDate, schwellenwert, schedule);
        lohnstunden = Math.min(arbeitszeit, threshold);
        ueberstunden = isPureWorkDay
          ? calculateZASaldo(arbeitszeit, dayDate, schedule, schwellenwert)
          : 0;
      }
      const normalstunden = isPureWorkDay ? getNormalWorkingHours(dayDate, schedule) : 0;
      const ueberstundenLohn = Math.max(0, Math.round((lohnstunden - normalstunden) * 100) / 100);

      rows.push({
        datum, beginn, ende,
        pauseMinutes: g.pause,
        arbeitszeit,
        lohnstunden: Math.round(lohnstunden * 100) / 100,
        normalstunden: Math.round(normalstunden * 100) / 100,
        ueberstundenLohn,
        ueberstunden,
        anmerkung,
        schlechtwetterStunden: swHours,
        diaetenTyp,
      });
    } else {
      rows.push({
        datum, beginn: null, ende: null,
        pauseMinutes: 0, arbeitszeit: 0,
        lohnstunden: 0, normalstunden: 0, ueberstundenLohn: 0, ueberstunden: 0,
        anmerkung: swHours > 0 ? "SW" : null,
        schlechtwetterStunden: swHours,
        diaetenTyp: null,
      });
    }
  }

  const sum = (fn: (r: AzgDayRow) => number) =>
    Math.round(rows.reduce((s, r) => s + fn(r), 0) * 100) / 100;

  return {
    employeeName,
    monat,
    jahr,
    rows,
    totalPause: rows.reduce((s, r) => s + r.pauseMinutes, 0),
    workingDays: rows.filter((r) => r.arbeitszeit > 0).length,
    totalBadWeatherHours: sum((r) => r.schlechtwetterStunden),
    totalLohnstunden: sum((r) => r.lohnstunden),
    totalNormalstunden: sum((r) => r.normalstunden),
    totalUeberstundenLohn: sum((r) => r.ueberstundenLohn),
    dietKlein: rows.filter((r) => r.diaetenTyp === "klein").length,
    dietGross: rows.filter((r) => r.diaetenTyp === "gross").length,
    dietAnfahrt: rows.filter((r) => r.diaetenTyp === "anfahrt").length,
    totalFeiertage: rows.filter((r) => r.anmerkung === "F").length,
    frozen_at: new Date().toISOString(),
  };
}

/** Liefert den aktuellen Signature-Record fuer (user, monat, jahr) oder null. */
export async function fetchAzgSignature(
  userId: string,
  monat: number,
  jahr: number,
): Promise<AzgSignatureRow | null> {
  const { data } = await supabase
    .from("azg_signatures")
    .select("*")
    .eq("user_id", userId)
    .eq("monat", monat)
    .eq("jahr", jahr)
    .maybeSingle();
  return (data as AzgSignatureRow | null) ?? null;
}

/**
 * Mitarbeiter unterschreibt seine eigene Aufzeichnung.
 * Wenn noch kein Snapshot existiert (= noch keiner hat unterschrieben), wird
 * der Snapshot jetzt aus den Live-Daten eingefroren (Rechtssicherheit).
 */
export async function submitEmployeeSignature(
  userId: string,
  monat: number,
  jahr: number,
  employeeName: string,
  signatureDataUrl: string,
): Promise<void> {
  const existing = await fetchAzgSignature(userId, monat, jahr);
  const snapshot = existing?.snapshot ?? (await buildAzgSnapshot(userId, monat, jahr, employeeName));
  const now = new Date().toISOString();

  if (existing) {
    const { error } = await supabase
      .from("azg_signatures")
      .update({
        employee_signature: signatureDataUrl,
        employee_signed_at: now,
        snapshot: existing.snapshot ?? snapshot,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("azg_signatures")
      .insert({
        user_id: userId,
        monat,
        jahr,
        snapshot: snapshot as any,
        employee_signature: signatureDataUrl,
        employee_signed_at: now,
        created_by: user?.id ?? userId,
      });
    if (error) throw error;
  }
}

/**
 * Arbeitgeber unterschreibt. Wenn noch kein Snapshot existiert, wird er
 * jetzt eingefroren.
 */
export async function submitEmployerSignature(
  userId: string,
  monat: number,
  jahr: number,
  employeeName: string,
  signatureDataUrl: string,
): Promise<void> {
  const existing = await fetchAzgSignature(userId, monat, jahr);
  const snapshot = existing?.snapshot ?? (await buildAzgSnapshot(userId, monat, jahr, employeeName));
  const now = new Date().toISOString();
  const { data: { user } } = await supabase.auth.getUser();

  if (existing) {
    const { error } = await supabase
      .from("azg_signatures")
      .update({
        employer_signature: signatureDataUrl,
        employer_signed_at: now,
        employer_user_id: user?.id ?? null,
        snapshot: existing.snapshot ?? snapshot,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("azg_signatures")
      .insert({
        user_id: userId,
        monat,
        jahr,
        snapshot: snapshot as any,
        employer_signature: signatureDataUrl,
        employer_signed_at: now,
        employer_user_id: user?.id ?? null,
        created_by: user?.id ?? null,
      });
    if (error) throw error;
  }
}

/**
 * Liefert die Monate (vom aktuellen User), die zur Unterschrift offen sind.
 * "Offen" heisst: Mitarbeiter hat noch nicht unterschrieben, UND es gibt
 * Stunden in dem Monat, UND entweder Monat ist vorbei ODER Admin hat
 * bereits einen Datensatz angelegt.
 */
export async function fetchPendingSignaturesForEmployee(
  userId: string,
): Promise<Array<{ monat: number; jahr: number; hasAdminRequest: boolean }>> {
  // Existierende Signature-Records (Admin koennte vorbereitet haben)
  const { data: sigs } = await supabase
    .from("azg_signatures")
    .select("monat, jahr, employee_signature")
    .eq("user_id", userId);

  const signedAlready = new Set<string>();
  const adminRequested = new Map<string, true>();
  for (const s of sigs || []) {
    const key = `${s.jahr}-${s.monat}`;
    if (s.employee_signature) signedAlready.add(key);
    else adminRequested.set(key, true);
  }

  // Welche Monate gibt es Stunden? Wir schauen die letzten 6 Monate an.
  const today = new Date();
  const candidates: Array<{ monat: number; jahr: number }> = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    candidates.push({ monat: d.getMonth() + 1, jahr: d.getFullYear() });
  }

  // Nur Monate die vorbei sind (= Monatswechsel war) oder fuer die Admin-Anfrage existiert
  const isPastMonth = (m: number, j: number) => {
    return j < today.getFullYear() || (j === today.getFullYear() && m < today.getMonth() + 1);
  };

  const result: Array<{ monat: number; jahr: number; hasAdminRequest: boolean }> = [];
  for (const c of candidates) {
    const key = `${c.jahr}-${c.monat}`;
    if (signedAlready.has(key)) continue;
    const hasAdminRequest = adminRequested.has(key);
    if (!isPastMonth(c.monat, c.jahr) && !hasAdminRequest) continue;
    // Pruefen ob Stunden existieren
    const startDate = `${c.jahr}-${String(c.monat).padStart(2, "0")}-01`;
    const daysInMonth = getDaysInMonth(new Date(c.jahr, c.monat - 1));
    const endDate = `${c.jahr}-${String(c.monat).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const { count } = await supabase
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("datum", startDate)
      .lte("datum", endDate);
    if (!count || count === 0) continue;
    result.push({ monat: c.monat, jahr: c.jahr, hasAdminRequest });
  }
  return result;
}

/** Admin loest eine Unterschriftsanfrage aus (legt leeren Datensatz an). */
export async function requestEmployeeSignature(
  userId: string,
  monat: number,
  jahr: number,
): Promise<void> {
  const existing = await fetchAzgSignature(userId, monat, jahr);
  if (existing) return; // bereits angelegt
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("azg_signatures")
    .insert({
      user_id: userId,
      monat,
      jahr,
      created_by: user?.id ?? null,
    });
  if (error) throw error;
}
