import { describe, it, expect } from "vitest";
import {
  sortByPriority,
  isProjectVisible,
  visibleSortedProjects,
  visibleSortedProfiles,
  profileSortName,
  moveItem,
  moveItemToEdge,
  reorderItems,
  topSortOrder,
} from "./projectOrdering";

describe("sortByPriority", () => {
  it("sortiert nach Prioritaet", () => {
    const sorted = sortByPriority([
      { name: "C", sort_order: 2 },
      { name: "A", sort_order: 0 },
      { name: "B", sort_order: 1 },
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["A", "B", "C"]);
  });

  it("haengt Projekte ohne Prioritaet hinten an", () => {
    const sorted = sortByPriority([
      { name: "Ohne", sort_order: null },
      { name: "Mit", sort_order: 5 },
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["Mit", "Ohne"]);
  });

  it("behandelt fehlende Prioritaet nicht als 0", () => {
    const sorted = sortByPriority([
      { name: "Ohne", sort_order: undefined },
      { name: "Null", sort_order: 0 },
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["Null", "Ohne"]);
  });

  it("sortiert bei gleicher Prioritaet alphabetisch", () => {
    const sorted = sortByPriority([
      { name: "Zwigl", sort_order: 1 },
      { name: "Barth", sort_order: 1 },
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["Barth", "Zwigl"]);
  });

  it("sortiert Unpriorisierte untereinander alphabetisch, mit Umlauten", () => {
    const sorted = sortByPriority([
      { name: "Zwigl", sort_order: null },
      { name: "Übelbach", sort_order: null },
      { name: "Barth", sort_order: null },
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["Barth", "Übelbach", "Zwigl"]);
  });

  it("laesst die Eingabeliste unveraendert", () => {
    const input = [{ name: "B", sort_order: 1 }, { name: "A", sort_order: 0 }];
    sortByPriority(input);
    expect(input.map((x) => x.name)).toEqual(["B", "A"]);
  });
});

describe("isProjectVisible / visibleSortedProjects", () => {
  it("fehlender Wert gilt als sichtbar", () => {
    expect(isProjectVisible({ name: "A" })).toBe(true);
    expect(isProjectVisible({ name: "A", in_app_sichtbar: null })).toBe(true);
    expect(isProjectVisible({ name: "A", in_app_sichtbar: true })).toBe(true);
    expect(isProjectVisible({ name: "A", in_app_sichtbar: false })).toBe(false);
  });

  it("blendet ausgeblendete Projekte aus", () => {
    const sichtbar = visibleSortedProjects([
      { name: "Sichtbar", sort_order: 0 },
      { name: "Versteckt", sort_order: 1, in_app_sichtbar: false },
    ]);
    expect(sichtbar.map((x) => x.name)).toEqual(["Sichtbar"]);
  });

  it("zeigt sie fuer Administratoren auf Wunsch mit", () => {
    const alle = visibleSortedProjects(
      [
        { name: "Sichtbar", sort_order: 0 },
        { name: "Versteckt", sort_order: 1, in_app_sichtbar: false },
      ],
      true
    );
    expect(alle.map((x) => x.name)).toEqual(["Sichtbar", "Versteckt"]);
  });
});

describe("visibleSortedProfiles", () => {
  const p = (
    vorname: string,
    nachname: string,
    sort_order: number | null,
    plantafel_sichtbar = true
  ) => ({ vorname, nachname, sort_order, plantafel_sichtbar });

  it("sortiert nach sort_order", () => {
    const sorted = visibleSortedProfiles([
      p("Michael", "Sobl", 2),
      p("Markus", "Friesenbichler", 0),
      p("Tobias", "Pieber", 1),
    ]);
    expect(sorted.map((x) => x.nachname)).toEqual([
      "Friesenbichler",
      "Pieber",
      "Sobl",
    ]);
  });

  it("blendet ausgeblendete Mitarbeiter aus", () => {
    const sorted = visibleSortedProfiles([
      p("Markus", "Friesenbichler", 0),
      p("Darius", "Leiharbeiter", 1, false),
    ]);
    expect(sorted.map((x) => x.nachname)).toEqual(["Friesenbichler"]);
  });

  it("faellt ohne sort_order auf den Nachnamen zurueck", () => {
    const sorted = visibleSortedProfiles([
      p("Michael", "Sobl", null),
      p("Markus", "Friesenbichler", null),
    ]);
    expect(sorted.map((x) => x.nachname)).toEqual(["Friesenbichler", "Sobl"]);
  });

  it("stellt Priorisierte vor Unpriorisierte", () => {
    const sorted = visibleSortedProfiles([
      p("Anna", "Aaaa", null),
      p("Michael", "Sobl", 0),
    ]);
    expect(sorted.map((x) => x.nachname)).toEqual(["Sobl", "Aaaa"]);
  });

  it("profileSortName setzt Nachname vor Vorname", () => {
    expect(profileSortName({ vorname: "Markus", nachname: "Friesenbichler" })).toBe(
      "Friesenbichler Markus"
    );
  });
});

describe("moveItem", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("verschiebt nach oben", () => {
    expect(moveItem(items, "b", "up")).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);
  });

  it("verschiebt nach unten", () => {
    expect(moveItem(items, "b", "down")).toEqual([
      { id: "a", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("nummeriert am oberen Rand nur durch", () => {
    expect(moveItem(items, "a", "up")).toEqual([
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);
  });

  it("nummeriert am unteren Rand nur durch", () => {
    expect(moveItem(items, "c", "down")).toEqual([
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
    ]);
  });

  it("kommt mit unbekannter id zurecht", () => {
    expect(moveItem(items, "gibtsnicht", "up")).toHaveLength(3);
  });

  it("vergibt immer lueckenlose Werte", () => {
    const result = moveItem(items, "b", "up");
    expect(result.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });
});

describe("moveItemToEdge", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("setzt ein Projekt mit einem Schritt ganz nach oben", () => {
    expect(moveItemToEdge(items, "d", "top").map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("setzt ein Projekt ganz nach unten", () => {
    expect(moveItemToEdge(items, "a", "bottom").map((r) => r.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("aus der Mitte heraus rueckt alles dazwischen nach", () => {
    expect(moveItemToEdge(items, "c", "top")).toEqual([
      { id: "c", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "d", sort_order: 3 },
    ]);
  });

  it("schon oben: nur durchnummerieren", () => {
    expect(moveItemToEdge(items, "a", "top").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("kommt mit unbekannter id zurecht", () => {
    expect(moveItemToEdge(items, "x", "top").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("vergibt lueckenlose Werte", () => {
    expect(moveItemToEdge(items, "c", "bottom").map((r) => r.sort_order)).toEqual([0, 1, 2, 3]);
  });
});

describe("reorderItems", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("zieht nach unten", () => {
    expect(reorderItems(items, 0, 2).map((r) => r.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("zieht nach oben", () => {
    expect(reorderItems(items, 3, 1).map((r) => r.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("gleiche Position aendert nichts", () => {
    expect(reorderItems(items, 2, 2).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignoriert Positionen ausserhalb der Liste", () => {
    expect(reorderItems(items, -1, 2).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(reorderItems(items, 1, 9).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("laesst die Eingabe unveraendert", () => {
    const kopie = items.map((i) => ({ ...i }));
    reorderItems(items, 0, 3);
    expect(items).toEqual(kopie);
  });
});

describe("topSortOrder", () => {
  it("liegt vor der bisher kleinsten Prioritaet", () => {
    expect(topSortOrder([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }])).toBe(-1);
    expect(topSortOrder([{ sort_order: 5 }, { sort_order: 9 }])).toBe(4);
  });

  it("ignoriert Unpriorisierte", () => {
    expect(topSortOrder([{ sort_order: null }, { sort_order: 3 }, {}])).toBe(2);
  });

  it("ohne priorisierte Projekte faengt es bei 0 an", () => {
    expect(topSortOrder([])).toBe(0);
    expect(topSortOrder([{ sort_order: null }, {}])).toBe(0);
  });

  it("darf auch ins Negative gehen - die Sortierung kommt damit zurecht", () => {
    const neu = { id: "neu", name: "Neu", sort_order: topSortOrder([{ sort_order: 0 }]) };
    const sortiert = sortByPriority([{ id: "alt", name: "Alt", sort_order: 0 }, neu]);
    expect(sortiert[0].id).toBe("neu");
  });
});
