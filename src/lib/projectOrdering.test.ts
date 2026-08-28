import { describe, it, expect } from "vitest";
import {
  sortByPriority,
  isProjectVisible,
  visibleSortedProjects,
  visibleSortedProfiles,
  profileSortName,
  moveItem,
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
