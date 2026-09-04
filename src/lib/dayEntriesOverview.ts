/**
 * "Bereits gebuchte Zeiten" in der Zeiterfassung.
 *
 * Gemeldet von Franz (31.08.2026): Der Kasten zeigte die Stunden des
 * ANGEMELDETEN Benutzers - auch dann, wenn gar niemand ausgewaehlt war. Beim
 * Erfassen fuer Kollegen ist das irrefuehrend: Man sieht die eigenen Zeiten,
 * obwohl man fuer jemand anderen bucht.
 *
 * Regel: Im Mehrfach-Modus gehoert der Kasten zur AUSWAHL. Ist niemand
 * ausgewaehlt, gibt es nichts zu zeigen.
 */

export interface DayEntryLike {
  user_id?: string | null;
  stunden: number | string;
}

export interface PersonEntries<T extends DayEntryLike> {
  userId: string;
  name: string;
  /** Der Erfasser selbst - wird zuerst gezeigt und darf bearbeitet werden. */
  istIchSelbst: boolean;
  entries: T[];
  summe: number;
}

/** Stundensumme; toleriert Zahlen als Text (kommt so aus der Datenbank). */
export function summeStunden(entries: DayEntryLike[]): number {
  return entries.reduce((s, e) => s + (Number(e.stunden) || 0), 0);
}

/**
 * Gruppiert die Tageseintraege nach Person - aber NUR fuer die ausgewaehlten
 * Mitarbeiter und nur, wenn sie an dem Tag ueberhaupt schon Stunden haben.
 *
 * Der Erfasser steht immer oben, der Rest alphabetisch.
 */
export function gruppiereNachPerson<T extends DayEntryLike>(
  entries: T[],
  selectedIds: string[],
  nameVon: (userId: string) => string | undefined,
  myUserId: string | null | undefined
): PersonEntries<T>[] {
  const erlaubt = new Set(selectedIds);
  const nachPerson = new Map<string, T[]>();

  for (const e of entries) {
    const uid = e.user_id || "";
    if (!uid || !erlaubt.has(uid)) continue;
    const liste = nachPerson.get(uid);
    if (liste) liste.push(e);
    else nachPerson.set(uid, [e]);
  }

  const gruppen: PersonEntries<T>[] = [];
  for (const [userId, liste] of nachPerson) {
    gruppen.push({
      userId,
      name: nameVon(userId) || "Unbekannt",
      istIchSelbst: !!myUserId && userId === myUserId,
      entries: liste,
      summe: summeStunden(liste),
    });
  }

  return gruppen.sort((a, b) => {
    if (a.istIchSelbst !== b.istIchSelbst) return a.istIchSelbst ? -1 : 1;
    return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
  });
}

/**
 * Soll der Kasten ueberhaupt erscheinen?
 *
 * Ausserhalb des Mehrfach-Modus (normaler Mitarbeiter, oder Admin der fuer
 * EINE bestimmte Person bucht) bleibt es beim bisherigen Verhalten - dort
 * gehoeren die Zeiten eindeutig zur Person, deren Tag bearbeitet wird.
 */
export function zeigeTagesuebersicht(
  istMehrfachModus: boolean,
  selectedIds: string[],
  gruppen: { length: number }
): boolean {
  if (!istMehrfachModus) return true;
  if (selectedIds.length === 0) return false;
  return gruppen.length > 0;
}
