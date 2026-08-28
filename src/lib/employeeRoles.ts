/**
 * Rollen von Mitarbeitern.
 *
 * WICHTIG: Das Datenbank-Enum `app_role` in `user_roles` kennt nur
 * `administrator` und `mitarbeiter`. Die feinere Abstufung (Lehrling,
 * Facharbeiter, Vorarbeiter, Extern, Bauherr) steckt in `employees.kategorie`.
 * Wer nur `user_roles` liest, sieht jeden Vorarbeiter faelschlich als
 * "Mitarbeiter" - genau das war der Fehler unter "Arbeitszeiten einstellen".
 *
 * Diese Datei ist die einzige Quelle fuer die Ableitung.
 */

export type EffectiveRole =
  | "extern"
  | "lehrling"
  | "facharbeiter"
  | "vorarbeiter"
  | "admin";

/** Rangfolge fuer Zugriffspruefungen (hoeher = mehr Rechte). */
export const ROLE_LEVEL: Record<string, number> = {
  extern: 0,
  lehrling: 1,
  facharbeiter: 2,
  vorarbeiter: 3,
  admin: 4,
};

/** Standardstufe, wenn die Rolle unbekannt ist (entspricht Facharbeiter). */
export const DEFAULT_ROLE_LEVEL = ROLE_LEVEL.facharbeiter;

/**
 * Leitet die tatsaechliche Rolle aus Admin-Flag und Kategorie ab.
 * `administrator` sticht immer, danach zaehlt die Kategorie.
 */
export function getEffectiveRole(
  isAdmin: boolean,
  kategorie: string | null | undefined
): string {
  if (isAdmin) return "admin";
  if (!kategorie) return "facharbeiter";
  if (kategorie === "extern") return "extern";
  return kategorie; // lehrling, facharbeiter, vorarbeiter, bauherr
}

/** Stufe einer Rolle; unbekannte Rollen zaehlen als Facharbeiter. */
export function roleLevel(role: string | null | undefined): number {
  if (!role) return DEFAULT_ROLE_LEVEL;
  return ROLE_LEVEL[role] ?? DEFAULT_ROLE_LEVEL;
}

/** Reicht `role` fuer die geforderte Mindestrolle? */
export function meetsMinRole(
  role: string | null | undefined,
  minRole: string
): boolean {
  return roleLevel(role) >= (ROLE_LEVEL[minRole] ?? 0);
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  administrator: "Administrator",
  vorarbeiter: "Vorarbeiter",
  facharbeiter: "Mitarbeiter",
  lehrling: "Lehrling",
  extern: "Extern",
  bauherr: "Bauherr",
};

/** Deutsche Bezeichnung einer Rolle fuer die Anzeige. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Mitarbeiter";
  return ROLE_LABELS[role] || role;
}

/**
 * Rollen hinter den Schnellauswahl-Knoepfen. "Mitarbeiter" fasst Facharbeiter
 * und Lehrlinge zusammen - beides sind gewerbliche Mitarbeiter ohne
 * Vorarbeiter-Funktion.
 */
export const ROLE_GROUPS: Record<string, string[]> = {
  administrator: ["admin"],
  vorarbeiter: ["vorarbeiter"],
  mitarbeiter: ["facharbeiter", "lehrling"],
  extern: ["extern", "bauherr"],
};

/** Gehoert die Rolle zur Schnellauswahl-Gruppe? */
export function isInRoleGroup(
  role: string | null | undefined,
  group: string
): boolean {
  const roles = ROLE_GROUPS[group];
  if (!roles) return false;
  return roles.includes(role || "facharbeiter");
}
