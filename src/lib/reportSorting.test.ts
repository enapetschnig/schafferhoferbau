import { describe, it, expect } from "vitest";
import {
  reportProjectName,
  sortReportsByProject,
  applySortOrder,
} from "./reportSorting";

const r = (name: string | null, datum: string) => ({
  datum,
  projects: name === null ? null : { name },
});

describe("reportProjectName", () => {
  it("liefert den Projektnamen", () => {
    expect(reportProjectName(r("Anger 2026", "2026-08-11"))).toBe("Anger 2026");
  });

  it("liefert leer ohne Projekt", () => {
    expect(reportProjectName(r(null, "2026-08-11"))).toBe("");
    expect(reportProjectName({ datum: "2026-08-11" })).toBe("");
    expect(reportProjectName(r("   ", "2026-08-11"))).toBe("");
  });
});

describe("sortReportsByProject", () => {
  it("sortiert alphabetisch nach Baustelle", () => {
    const sorted = sortReportsByProject([
      r("Zirbenweg", "2026-08-01"),
      r("Anger 2026", "2026-08-02"),
      r("Murtal", "2026-08-03"),
    ]);
    expect(sorted.map((x) => x.projects?.name)).toEqual([
      "Anger 2026",
      "Murtal",
      "Zirbenweg",
    ]);
  });

  it("kehrt bei desc die Reihenfolge um", () => {
    const sorted = sortReportsByProject(
      [r("Anger", "2026-08-01"), r("Zirbenweg", "2026-08-02")],
      "desc"
    );
    expect(sorted.map((x) => x.projects?.name)).toEqual(["Zirbenweg", "Anger"]);
  });

  it("haelt innerhalb einer Baustelle das neueste Datum oben", () => {
    const sorted = sortReportsByProject([
      r("Anger", "2026-08-01"),
      r("Anger", "2026-08-11"),
      r("Anger", "2026-08-05"),
    ]);
    expect(sorted.map((x) => x.datum)).toEqual([
      "2026-08-11",
      "2026-08-05",
      "2026-08-01",
    ]);
  });

  it("ignoriert Gross-/Kleinschreibung", () => {
    const sorted = sortReportsByProject([
      r("beta", "2026-08-01"),
      r("Alpha", "2026-08-02"),
    ]);
    expect(sorted.map((x) => x.projects?.name)).toEqual(["Alpha", "beta"]);
  });

  it("sortiert Umlaute deutsch ein", () => {
    const sorted = sortReportsByProject([
      r("Zell", "2026-08-01"),
      r("Übelbach", "2026-08-02"),
      r("Admont", "2026-08-03"),
    ]);
    expect(sorted.map((x) => x.projects?.name)).toEqual([
      "Admont",
      "Übelbach",
      "Zell",
    ]);
  });

  it("haengt Berichte ohne Baustelle immer ans Ende", () => {
    const asc = sortReportsByProject([
      r(null, "2026-08-01"),
      r("Anger", "2026-08-02"),
    ]);
    expect(asc.map((x) => x.projects?.name ?? null)).toEqual(["Anger", null]);

    // Auch bei Z-A unten - "kein Projekt" hat keine Position im Alphabet
    const desc = sortReportsByProject(
      [r(null, "2026-08-01"), r("Anger", "2026-08-02")],
      "desc"
    );
    expect(desc.map((x) => x.projects?.name ?? null)).toEqual(["Anger", null]);
  });

  it("laesst die Eingabeliste unveraendert", () => {
    const input = [r("Zell", "2026-08-01"), r("Anger", "2026-08-02")];
    sortReportsByProject(input);
    expect(input.map((x) => x.projects?.name)).toEqual(["Zell", "Anger"]);
  });

  it("kommt mit leerer Liste zurecht", () => {
    expect(sortReportsByProject([])).toEqual([]);
  });
});

describe("applySortOrder", () => {
  const reports = [r("Zell", "2026-08-01"), r("Anger", "2026-08-02")];

  it("laesst Datums-Sortierung unangetastet (kommt vom Server)", () => {
    expect(applySortOrder(reports, "desc")).toBe(reports);
    expect(applySortOrder(reports, "asc")).toBe(reports);
  });

  it("sortiert bei baustelle nach Name", () => {
    expect(applySortOrder(reports, "baustelle").map((x) => x.projects?.name)).toEqual([
      "Anger",
      "Zell",
    ]);
    expect(
      applySortOrder(reports, "baustelle_desc").map((x) => x.projects?.name)
    ).toEqual(["Zell", "Anger"]);
  });
});
