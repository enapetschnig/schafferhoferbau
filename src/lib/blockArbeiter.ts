/**
 * Mitarbeiter je Zeitblock.
 *
 * Bis jetzt galt: alle oben ausgewaehlten Arbeiter bekommen ALLE Zeitbloecke.
 * Franz braucht aber den Fall, dass zwei Leute am selben Tag unterschiedlich
 * lang da waren:
 *
 *   Mitarbeiter A  07:00-17:00  =>  Block 1
 *   Mitarbeiter B  13:00-17:00  =>  Block 2
 *
 * Darum kann jeder Block jetzt eine eigene Arbeiterliste tragen. Leer heisst
 * "alle oben ausgewaehlten" - so verhalten sich bestehende Buchungen und der
 * Einzel-Modus unveraendert.
 *
 * Wichtig ist die Ueberschneidungspruefung: vorher wurden schlicht alle
 * Bloecke gegeneinander geprueft. Genau Franz' Beispiel waere damit
 * abgelehnt worden (07:00-17:00 und 13:00-17:00 ueberschneiden sich ja), und
 * das ist der eigentliche Grund, warum es bisher nicht ging. Geprueft wird
 * deshalb nur noch **pro Person**.
 */

export type ArbeitszeitBlock = {
  id: string;
  startTime: string;
  endTime: string;
  /** Leer/undefined = alle global ausgewaehlten Arbeiter. */
  workerIds?: string[];
};

/**
 * Minuten seit Mitternacht; null bei unbrauchbarer Eingabe.
 * Sekunden sind erlaubt und werden verworfen - `time_entries` liefert
 * "07:00:00", die Eingabefelder dagegen "07:00".
 */
export function minutenSeitMitternacht(zeit: string): number | null {
  const treffer = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((zeit || "").trim());
  if (!treffer) return null;
  const stunden = Number(treffer[1]);
  const minuten = Number(treffer[2]);
  if (stunden > 23 || minuten > 59) return null;
  return stunden * 60 + minuten;
}

/**
 * Die tatsaechlichen Arbeiter eines Blocks.
 *
 * Es wird gegen `alle` gefiltert: waehlt man oben jemanden wieder ab, darf er
 * nicht ueber eine alte Block-Auswahl zurueckkommen.
 */
export function arbeiterDesBlocks(block: ArbeitszeitBlock, alle: string[]): string[] {
  const eigene = block.workerIds;
  if (!eigene || eigene.length === 0) return [...alle];
  const erlaubt = new Set(alle);
  const gefiltert = eigene.filter((id) => erlaubt.has(id));
  // Nichts davon mehr gueltig -> wie "nicht eingeschraenkt" behandeln, damit
  // der Block nicht stillschweigend verschwindet.
  return gefiltert.length > 0 ? gefiltert : [...alle];
}

/** Pro Arbeiter die Indizes seiner Bloecke, in Block-Reihenfolge. */
export function bloeckeJeArbeiter(
  bloecke: ArbeitszeitBlock[],
  alle: string[]
): Map<string, number[]> {
  const karte = new Map<string, number[]>();
  bloecke.forEach((block, index) => {
    for (const uid of arbeiterDesBlocks(block, alle)) {
      const liste = karte.get(uid);
      if (liste) liste.push(index);
      else karte.set(uid, [index]);
    }
  });
  return karte;
}

/** Arbeiter, die in gar keinem Block vorkommen (Auswahl oben, aber nirgends zugeteilt). */
export function arbeiterOhneBlock(bloecke: ArbeitszeitBlock[], alle: string[]): string[] {
  const belegt = bloeckeJeArbeiter(bloecke, alle);
  return alle.filter((uid) => !belegt.has(uid));
}

export type Ueberschneidung = { a: number; b: number; userId: string };

/** Ueberschneiden sich zwei Zeitspannen? Beruehrung (Ende = Start) zaehlt nicht. */
function ueberlappt(aVon: number, aBis: number, bVon: number, bBis: number): boolean {
  return aVon < bBis && aBis > bVon;
}

/**
 * Erste Ueberschneidung zweier Bloecke, die sich mindestens einen Arbeiter
 * teilen - oder null. Bloecke verschiedener Leute duerfen zeitgleich laufen.
 */
export function findeBlockUeberschneidung(
  bloecke: ArbeitszeitBlock[],
  alle: string[]
): Ueberschneidung | null {
  for (let i = 0; i < bloecke.length; i++) {
    const aVon = minutenSeitMitternacht(bloecke[i].startTime);
    const aBis = minutenSeitMitternacht(bloecke[i].endTime);
    if (aVon === null || aBis === null) continue;
    const aLeute = new Set(arbeiterDesBlocks(bloecke[i], alle));

    for (let j = i + 1; j < bloecke.length; j++) {
      const bVon = minutenSeitMitternacht(bloecke[j].startTime);
      const bBis = minutenSeitMitternacht(bloecke[j].endTime);
      if (bVon === null || bBis === null) continue;
      if (!ueberlappt(aVon, aBis, bVon, bBis)) continue;

      const gemeinsam = arbeiterDesBlocks(bloecke[j], alle).find((uid) => aLeute.has(uid));
      if (gemeinsam !== undefined) return { a: i, b: j, userId: gemeinsam };
    }
  }
  return null;
}

/**
 * Ueberschneidet einer der Bloecke dieses Arbeiters einen bestehenden
 * Eintrag? Liefert den Blockindex oder null.
 */
export function findeBestandsUeberschneidung(
  bloecke: ArbeitszeitBlock[],
  alle: string[],
  userId: string,
  bestandVon: string,
  bestandBis: string
): number | null {
  const von = minutenSeitMitternacht(bestandVon);
  const bis = minutenSeitMitternacht(bestandBis);
  if (von === null || bis === null) return null;

  const indizes = bloeckeJeArbeiter(bloecke, alle).get(userId) ?? [];
  for (const index of indizes) {
    const bVon = minutenSeitMitternacht(bloecke[index].startTime);
    const bBis = minutenSeitMitternacht(bloecke[index].endTime);
    if (bVon === null || bBis === null) continue;
    if (ueberlappt(bVon, bBis, von, bis)) return index;
  }
  return null;
}
