import { describe, it, expect } from "vitest";
import {
  anzeigestatus,
  istNeuErledigt,
  gruppiereWuensche,
  STATUS_LABEL,
} from "./meineWuensche";

const w = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  updated_at: "2026-09-01T10:00:00Z",
  ...extra,
});

describe("anzeigestatus", () => {
  it("neu und gesehen sind fuer den Melder offen", () => {
    expect(anzeigestatus("neu")).toBe("offen");
    expect(anzeigestatus("gesehen")).toBe("offen");
  });

  it("umgesetzt ist erledigt", () => {
    expect(anzeigestatus("umgesetzt")).toBe("erledigt");
  });

  it("abgelehnt bleibt unterscheidbar", () => {
    expect(anzeigestatus("abgelehnt")).toBe("abgelehnt");
  });

  it("deutsche Beschriftungen", () => {
    expect(STATUS_LABEL.offen).toBe("Offen");
    expect(STATUS_LABEL.erledigt).toBe("Erledigt");
  });
});

describe("istNeuErledigt", () => {
  it("erledigt und noch nicht zur Kenntnis genommen", () => {
    expect(istNeuErledigt(w("1", "umgesetzt"))).toBe(true);
  });

  it("nach dem Kenntnisnehmen nicht mehr hervorgehoben", () => {
    expect(istNeuErledigt(w("1", "umgesetzt", { melder_gesehen_am: "2026-09-02T08:00:00Z" }))).toBe(false);
  });

  it("offene sind nie 'neu erledigt'", () => {
    expect(istNeuErledigt(w("1", "neu"))).toBe(false);
  });
});

describe("gruppiereWuensche", () => {
  it("trennt offen und erledigt", () => {
    const g = gruppiereWuensche([
      w("a", "neu"),
      w("b", "umgesetzt"),
      w("c", "gesehen"),
      w("d", "abgelehnt"),
    ]);
    expect(g.offen.map((x) => x.id).sort()).toEqual(["a", "c"]);
    expect(g.erledigt.map((x) => x.id).sort()).toEqual(["b", "d"]);
  });

  it("der Fall Franz: die eigene Meldung bleibt sichtbar", () => {
    // Frisch abgeschickt -> steht unter Offen, verschwindet nicht
    const g = gruppiereWuensche([w("meiner", "neu")]);
    expect(g.offen).toHaveLength(1);
    expect(g.erledigt).toHaveLength(0);
  });

  it("erledigte bleiben auch nach dem Kenntnisnehmen in der Liste", () => {
    const g = gruppiereWuensche([
      w("a", "umgesetzt", { melder_gesehen_am: "2026-09-02T08:00:00Z" }),
    ]);
    expect(g.erledigt).toHaveLength(1);
    expect(g.neuErledigt).toHaveLength(0);
  });

  it("sortiert neueste zuerst", () => {
    const g = gruppiereWuensche([
      w("alt", "neu", { updated_at: "2026-09-01T10:00:00Z" }),
      w("neu", "neu", { updated_at: "2026-09-05T10:00:00Z" }),
    ]);
    expect(g.offen.map((x) => x.id)).toEqual(["neu", "alt"]);
  });

  it("faellt ohne updated_at auf created_at zurueck", () => {
    const g = gruppiereWuensche([
      { id: "a", status: "neu", created_at: "2026-09-01T10:00:00Z" },
      { id: "b", status: "neu", created_at: "2026-09-05T10:00:00Z" },
    ]);
    expect(g.offen.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("leere Liste", () => {
    const g = gruppiereWuensche([]);
    expect(g.offen).toEqual([]);
    expect(g.erledigt).toEqual([]);
    expect(g.neuErledigt).toEqual([]);
  });
});
