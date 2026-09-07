/**
 * Eigene Aenderungswuensche fuer den Melder.
 *
 * Kundenwunsch (Franz, 06.09.2026): "Es waere schoen, wenn ein
 * Aenderungswunsch, den man eintraegt, auch weiterhin fuer mich ersichtlich
 * bleibt und zunaechst unter 'Offen' gelistet wird. Sobald der
 * Aenderungswunsch tatsaechlich umgesetzt wurde, koennte der Status auf
 * 'Erledigt' gesetzt werden."
 *
 * Bisher sah der Melder NUR erledigte Wuensche, und die auch nur einmalig.
 * Nach dem Absenden verschwand die Meldung aus seiner Sicht.
 */

export interface WunschLike {
  id: string;
  status: string;
  melder_gesehen_am?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export type Anzeigestatus = "offen" | "erledigt" | "abgelehnt";

/** Fasst die vier DB-Zustaende zu dem zusammen, was den Melder interessiert. */
export function anzeigestatus(status: string): Anzeigestatus {
  if (status === "umgesetzt") return "erledigt";
  if (status === "abgelehnt") return "abgelehnt";
  return "offen"; // neu, gesehen
}

export const STATUS_LABEL: Record<Anzeigestatus, string> = {
  offen: "Offen",
  erledigt: "Erledigt",
  abgelehnt: "Nicht umgesetzt",
};

/**
 * Frisch erledigt und noch nicht zur Kenntnis genommen - diese bekommen die
 * Hervorhebung. Das Kenntnisnehmen blendet den Wunsch NICHT aus, es nimmt ihm
 * nur die Hervorhebung; er bleibt unter "Erledigt" stehen.
 */
export function istNeuErledigt(w: WunschLike): boolean {
  return anzeigestatus(w.status) !== "offen" && !w.melder_gesehen_am;
}

export interface WunschGruppen<T extends WunschLike> {
  offen: T[];
  erledigt: T[];
  /** Teilmenge von erledigt, die hervorgehoben wird */
  neuErledigt: T[];
}

/** Offene zuerst (neueste oben), darunter die erledigten. */
export function gruppiereWuensche<T extends WunschLike>(wuensche: T[]): WunschGruppen<T> {
  const zeit = (w: T) => new Date(w.updated_at || w.created_at || 0).getTime();
  const neueste = (a: T, b: T) => zeit(b) - zeit(a);

  const offen = wuensche.filter((w) => anzeigestatus(w.status) === "offen").sort(neueste);
  const erledigt = wuensche.filter((w) => anzeigestatus(w.status) !== "offen").sort(neueste);

  return { offen, erledigt, neuErledigt: erledigt.filter(istNeuErledigt) };
}
