import { describe, it, expect } from "vitest";
import {
  planRowKey,
  blockLabel,
  blockWeekSpan,
  blocksOverlap,
  assignStackLevels,
  groupPlanBlocksByRow,
  istAktuelleKalenderwoche,
  type PlanBlockLike,
} from "./yearPlanning";

const b = (
  id: string,
  project_id: string | null,
  start_week: number,
  end_week: number,
  extra: Partial<PlanBlockLike> = {}
): PlanBlockLike => ({
  id,
  project_id,
  title: extra.title ?? "Titel",
  start_week,
  end_week,
  sort_order: extra.sort_order ?? 0,
  ...extra,
});

const namen: Record<string, string> = {
  p1: "Schwelberger WH-ZB Veitsch",
  p2: "Derler Michael Stallumbau",
};
const nameVon = (id: string) => namen[id];

describe("blockLabel", () => {
  it("bevorzugt den individuellen Namen", () => {
    expect(blockLabel(b("1", "p1", 1, 4, { individual_name: "Rohbau" }))).toBe("Rohbau");
  });

  it("faellt auf den Titel zurueck", () => {
    expect(blockLabel(b("1", "p1", 1, 4, { title: "Putzarbeiten" }))).toBe("Putzarbeiten");
    expect(
      blockLabel(b("1", "p1", 1, 4, { title: "Putz", individual_name: "  " }))
    ).toBe("Putz");
    expect(blockLabel(b("1", "p1", 1, 4, { title: "Putz", individual_name: null }))).toBe("Putz");
  });
});

describe("blockWeekSpan", () => {
  it("zaehlt beide Randwochen mit", () => {
    expect(blockWeekSpan(b("1", null, 10, 15))).toBe(6);
    expect(blockWeekSpan(b("1", null, 10, 10))).toBe(1);
  });

  it("wird nie kleiner als 1", () => {
    expect(blockWeekSpan(b("1", null, 10, 5))).toBe(1);
  });
});

describe("blocksOverlap", () => {
  it("erkennt Ueberschneidungen", () => {
    expect(blocksOverlap(b("1", null, 1, 6), b("2", null, 5, 8))).toBe(true);
    expect(blocksOverlap(b("1", null, 1, 6), b("2", null, 6, 8))).toBe(true);
  });

  it("getrennte Bloecke ueberschneiden sich nicht", () => {
    // 6 Wochen vor Ort, 2 Wochen Pause, dann weiter
    expect(blocksOverlap(b("1", null, 1, 6), b("2", null, 9, 14))).toBe(false);
    expect(blocksOverlap(b("1", null, 1, 6), b("2", null, 7, 8))).toBe(false);
  });
});

describe("assignStackLevels", () => {
  it("legt zeitlich getrennte Bloecke auf dieselbe Ebene", () => {
    const blocks = [b("a", "p1", 1, 6), b("b", "p1", 9, 14), b("c", "p1", 17, 22)];
    const ebenen = assignStackLevels(blocks);
    expect(ebenen.get("a")).toBe(0);
    expect(ebenen.get("b")).toBe(0);
    expect(ebenen.get("c")).toBe(0);
  });

  it("stapelt ueberschneidende Bloecke", () => {
    const blocks = [b("a", "p1", 1, 10), b("b", "p1", 5, 15)];
    const ebenen = assignStackLevels(blocks);
    expect(ebenen.get("a")).toBe(0);
    expect(ebenen.get("b")).toBe(1);
  });

  it("nutzt frei gewordene Ebenen wieder", () => {
    const blocks = [b("a", "p1", 1, 10), b("b", "p1", 5, 15), b("c", "p1", 20, 25)];
    const ebenen = assignStackLevels(blocks);
    expect(ebenen.get("c")).toBe(0);
  });

  it("kommt mit leerer Liste zurecht", () => {
    expect(assignStackLevels([]).size).toBe(0);
  });
});

describe("groupPlanBlocksByRow", () => {
  it("fasst mehrere Bloecke desselben Projekts zu einer Zeile zusammen", () => {
    const rows = groupPlanBlocksByRow(
      [b("a", "p1", 1, 6), b("b", "p1", 9, 14), b("c", "p1", 17, 22)],
      nameVon
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Schwelberger WH-ZB Veitsch");
    expect(rows[0].blocks).toHaveLength(3);
    expect(rows[0].isProject).toBe(true);
  });

  it("gibt Bloecken ohne Projekt je eine eigene Zeile", () => {
    const rows = groupPlanBlocksByRow(
      [b("a", null, 1, 6, { title: "Krandemontage" }), b("b", null, 9, 14, { title: "Urlaub" })],
      nameVon
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.label).sort()).toEqual(["Krandemontage", "Urlaub"]);
    expect(rows.every((r) => !r.isProject)).toBe(true);
  });

  it("trennt verschiedene Projekte", () => {
    const rows = groupPlanBlocksByRow([b("a", "p1", 1, 6), b("b", "p2", 3, 8)], nameVon);
    expect(rows).toHaveLength(2);
  });

  it("sortiert Bloecke einer Zeile chronologisch", () => {
    const rows = groupPlanBlocksByRow(
      [b("c", "p1", 17, 22), b("a", "p1", 1, 6), b("b", "p1", 9, 14)],
      nameVon
    );
    expect(rows[0].blocks.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("sortiert Zeilen nach kleinster sort_order", () => {
    const rows = groupPlanBlocksByRow(
      [
        b("a", "p1", 1, 6, { sort_order: 5 }),
        b("b", "p1", 9, 14, { sort_order: 9 }),
        b("c", "p2", 1, 6, { sort_order: 2 }),
      ],
      nameVon
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Derler Michael Stallumbau",
      "Schwelberger WH-ZB Veitsch",
    ]);
  });

  it("faellt auf den Blocktitel zurueck, wenn das Projekt unbekannt ist", () => {
    const rows = groupPlanBlocksByRow(
      [b("a", "unbekannt", 1, 6, { title: "Ersatztitel" })],
      nameVon
    );
    expect(rows[0].label).toBe("Ersatztitel");
  });

  it("verliert keinen Block", () => {
    const blocks = [
      b("a", "p1", 1, 6),
      b("b", "p1", 9, 14),
      b("c", "p2", 1, 6),
      b("d", null, 20, 22),
    ];
    const rows = groupPlanBlocksByRow(blocks, nameVon);
    const ids = rows.flatMap((r) => r.blocks.map((x) => x.id)).sort();
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("kommt mit leerer Liste zurecht", () => {
    expect(groupPlanBlocksByRow([], nameVon)).toEqual([]);
  });
});

describe("planRowKey", () => {
  it("nimmt das Projekt, wenn eines gesetzt ist", () => {
    expect(planRowKey(b("1", "p1", 1, 4))).toBe("projekt:p1");
  });

  it("gruppiert freie Bloecke ueber den Titel", () => {
    const a = b("1", null, 18, 20, { title: "Derler" });
    const c = b("2", null, 26, 28, { title: "Derler" });
    expect(planRowKey(a)).toBe(planRowKey(c));
  });

  it("ignoriert Gross-/Kleinschreibung und Leerzeichen", () => {
    expect(planRowKey(b("1", null, 1, 2, { title: "  Derler " })))
      .toBe(planRowKey(b("2", null, 5, 6, { title: "DERLER" })));
  });

  it("trennt verschiedene Titel", () => {
    expect(planRowKey(b("1", null, 1, 2, { title: "Derler" })))
      .not.toBe(planRowKey(b("2", null, 1, 2, { title: "Feistl" })));
  });

  it("ohne Titel bleibt es bei einer eigenen Zeile", () => {
    expect(planRowKey(b("1", null, 1, 2, { title: "" }))).toBe("block:1");
    expect(planRowKey(b("2", null, 1, 2, { title: "   " }))).toBe("block:2");
  });

  it("Projekt sticht den Titel", () => {
    // Gleicher Titel, aber eines mit Projekt -> getrennte Zeilen
    expect(planRowKey(b("1", "p1", 1, 2, { title: "Derler" })))
      .not.toBe(planRowKey(b("2", null, 1, 2, { title: "Derler" })));
  });
});

describe("groupPlanBlocksByRow - freie Bloecke (Fall Franz)", () => {
  it("Derler KW18-20 und KW26-28 landen in EINER Zeile", () => {
    const rows = groupPlanBlocksByRow(
      [
        b("a", null, 18, 20, { title: "Derler" }),
        b("b", null, 26, 28, { title: "Derler" }),
        b("c", null, 40, 42, { title: "Feistl" }),
      ],
      nameVon
    );
    expect(rows).toHaveLength(2);
    const derler = rows.find((r) => r.label === "Derler")!;
    expect(derler.blocks.map((x) => x.start_week)).toEqual([18, 26]);
    expect(derler.isProject).toBe(false);
  });

  it("verliert auch hier keinen Block", () => {
    const blocks = [
      b("a", null, 18, 20, { title: "Derler" }),
      b("b", null, 26, 28, { title: "derler" }),
      b("c", null, 40, 42, { title: "Feistl" }),
      b("d", "p1", 1, 6),
    ];
    const ids = groupPlanBlocksByRow(blocks, nameVon).flatMap((r) => r.blocks.map((x) => x.id));
    expect(ids.sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("istAktuelleKalenderwoche", () => {
  it("markiert die laufende Woche im passenden Jahr", () => {
    expect(istAktuelleKalenderwoche(37, 2026, 37, 2026)).toBe(true);
  });

  it("markiert andere Wochen nicht", () => {
    expect(istAktuelleKalenderwoche(36, 2026, 37, 2026)).toBe(false);
  });

  it("markiert dieselbe Wochennummer im falschen Jahr nicht", () => {
    expect(istAktuelleKalenderwoche(37, 2027, 37, 2026)).toBe(false);
  });

  it("beachtet die Jahresgrenze ueber das ISO-Wochenjahr", () => {
    // 01.01.2027 liegt noch in KW 53 des ISO-Jahres 2026. In der Ansicht 2027
    // darf die KW 53 deshalb NICHT markiert sein.
    expect(istAktuelleKalenderwoche(53, 2027, 53, 2026)).toBe(false);
    expect(istAktuelleKalenderwoche(53, 2026, 53, 2026)).toBe(true);
  });
});
