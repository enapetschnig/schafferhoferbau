import { describe, it, expect } from "vitest";
import {
  buildEmployeeDocumentPath,
  canBeVisibleToEmployee,
  isPersonalDocumentCategory,
  personalCategoryLabel,
  suggestBezeichnung,
  sortFolders,
  groupDocumentsByFolder,
  PERSONAL_DOCUMENT_CATEGORIES,
  type EmployeeDocumentFolder,
} from "./employeeDocuments";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const EMPLOYEE_ID = "22222222-2222-2222-2222-222222222222";

describe("buildEmployeeDocumentPath", () => {
  it("legt sichtbare Unterlagen unter der User-ID ab", () => {
    const path = buildEmployeeDocumentPath({
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      kategorie: "dienstvertrag",
      sichtbar: true,
      fileName: "Vertrag.pdf",
      uniqueSuffix: "abc",
    });
    expect(path).toBe(`${USER_ID}/dienstvertrag/abc_Vertrag.pdf`);
  });

  it("legt interne Unterlagen unter intern/ ab", () => {
    const path = buildEmployeeDocumentPath({
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      kategorie: "zeugnis",
      sichtbar: false,
      fileName: "Zeugnis.pdf",
      uniqueSuffix: "abc",
    });
    expect(path).toBe(`intern/${USER_ID}/zeugnis/abc_Zeugnis.pdf`);
  });

  it("faellt ohne App-Zugang auf die Employee-ID zurueck", () => {
    const path = buildEmployeeDocumentPath({
      userId: null,
      employeeId: EMPLOYEE_ID,
      kategorie: "anmeldung",
      sichtbar: true,
      fileName: "Anmeldung.pdf",
      uniqueSuffix: "abc",
    });
    // Ohne Zugang gibt es keinen Empfaenger -> immer intern
    expect(path).toBe(`intern/${EMPLOYEE_ID}/anmeldung/abc_Anmeldung.pdf`);
  });

  it("ignoriert sichtbar=true, wenn kein App-Zugang besteht", () => {
    const sichtbar = buildEmployeeDocumentPath({
      userId: undefined,
      employeeId: EMPLOYEE_ID,
      kategorie: "sonstiges",
      sichtbar: true,
      fileName: "x.pdf",
      uniqueSuffix: "s",
    });
    const intern = buildEmployeeDocumentPath({
      userId: undefined,
      employeeId: EMPLOYEE_ID,
      kategorie: "sonstiges",
      sichtbar: false,
      fileName: "x.pdf",
      uniqueSuffix: "s",
    });
    expect(sichtbar).toBe(intern);
  });

  it("bereinigt Umlaute und Sonderzeichen im Dateinamen", () => {
    const path = buildEmployeeDocumentPath({
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      kategorie: "zeugnis",
      sichtbar: true,
      fileName: "Prüfung Abschluß 2024.pdf",
      uniqueSuffix: "abc",
    });
    expect(path).toBe(`${USER_ID}/zeugnis/abc_Pruefung_Abschluss_2024.pdf`);
  });

  it("laesst keinen Pfadwechsel ueber den Dateinamen zu", () => {
    const path = buildEmployeeDocumentPath({
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      kategorie: "sonstiges",
      sichtbar: true,
      fileName: "../../intern/geheim.pdf",
      uniqueSuffix: "abc",
    });
    // Genau drei Trenner: user/kategorie/datei
    expect(path.split("/")).toHaveLength(3);
    expect(path.startsWith(`${USER_ID}/sonstiges/`)).toBe(true);
  });

  it("erzeugt ohne festen Suffix unterschiedliche Pfade", () => {
    const args = {
      userId: USER_ID,
      employeeId: EMPLOYEE_ID,
      kategorie: "anmeldung" as const,
      sichtbar: true,
      fileName: "gleich.pdf",
    };
    expect(buildEmployeeDocumentPath(args)).not.toBe(buildEmployeeDocumentPath(args));
  });
});

describe("Kategorien", () => {
  it("kennt genau die vier Personalunterlagen-Arten", () => {
    expect(PERSONAL_DOCUMENT_CATEGORIES.map((c) => c.id)).toEqual([
      "anmeldung",
      "dienstvertrag",
      "zeugnis",
      "sonstiges",
    ]);
  });

  it("erkennt gueltige Kategorien", () => {
    expect(isPersonalDocumentCategory("dienstvertrag")).toBe(true);
    expect(isPersonalDocumentCategory("lohnzettel")).toBe(false);
    expect(isPersonalDocumentCategory("krankmeldung")).toBe(false);
  });

  it("liefert deutsche Labels", () => {
    expect(personalCategoryLabel("dienstvertrag")).toBe("Dienstverträge");
    expect(personalCategoryLabel("unbekannt")).toBe("unbekannt");
  });
});

describe("canBeVisibleToEmployee", () => {
  it("nur mit App-Zugang", () => {
    expect(canBeVisibleToEmployee(USER_ID)).toBe(true);
    expect(canBeVisibleToEmployee(null)).toBe(false);
    expect(canBeVisibleToEmployee(undefined)).toBe(false);
    expect(canBeVisibleToEmployee("")).toBe(false);
  });
});

describe("sortFolders", () => {
  const f = (name: string, sort_order: number): EmployeeDocumentFolder => ({
    id: name,
    kategorie: "zeugnis",
    name,
    sort_order,
  });

  it("sortiert nach sort_order, bei Gleichstand alphabetisch", () => {
    const sorted = sortFolders([f("Kurse", 5), f("Anhang", 1), f("Abschluss", 1)]);
    expect(sorted.map((x) => x.name)).toEqual(["Abschluss", "Anhang", "Kurse"]);
  });

  it("sortiert Umlaute deutsch ein", () => {
    const sorted = sortFolders([f("Zusatz", 0), f("Übergabe", 0), f("Abschluss", 0)]);
    expect(sorted.map((x) => x.name)).toEqual(["Abschluss", "Übergabe", "Zusatz"]);
  });

  it("laesst die Eingabeliste unveraendert", () => {
    const input = [f("B", 2), f("A", 1)];
    sortFolders(input);
    expect(input.map((x) => x.name)).toEqual(["B", "A"]);
  });
});

describe("groupDocumentsByFolder", () => {
  const folders: EmployeeDocumentFolder[] = [
    { id: "f1", kategorie: "zeugnis", name: "Lehrabschluss", sort_order: 0 },
    { id: "f2", kategorie: "zeugnis", name: "Kurse", sort_order: 1 },
  ];
  const doc = (id: string, folder_id: string | null) => ({ id, folder_id });

  it("gruppiert nach Ordner und haengt 'ohne Ordner' hinten an", () => {
    const groups = groupDocumentsByFolder(
      [doc("a", "f2"), doc("b", null), doc("c", "f1")],
      folders
    );
    expect(groups.map((g) => g.folder?.name ?? null)).toEqual([
      "Lehrabschluss",
      "Kurse",
      null,
    ]);
    expect(groups[0].documents.map((d) => d.id)).toEqual(["c"]);
    expect(groups[2].documents.map((d) => d.id)).toEqual(["b"]);
  });

  it("blendet leere Ordner standardmaessig aus", () => {
    const groups = groupDocumentsByFolder([doc("a", "f1")], folders);
    expect(groups.map((g) => g.folder?.name)).toEqual(["Lehrabschluss"]);
  });

  it("zeigt leere Ordner mit includeEmpty", () => {
    const groups = groupDocumentsByFolder([doc("a", "f1")], folders, true);
    expect(groups.map((g) => g.folder?.name)).toEqual(["Lehrabschluss", "Kurse"]);
    expect(groups[1].documents).toEqual([]);
  });

  it("zeigt keine leere 'ohne Ordner'-Gruppe", () => {
    const groups = groupDocumentsByFolder([doc("a", "f1")], folders, true);
    expect(groups.some((g) => g.folder === null)).toBe(false);
  });

  it("rettet Dokumente eines unbekannten Ordners nach 'ohne Ordner'", () => {
    const groups = groupDocumentsByFolder([doc("a", "geloescht")], folders);
    expect(groups).toHaveLength(1);
    expect(groups[0].folder).toBeNull();
    expect(groups[0].documents.map((d) => d.id)).toEqual(["a"]);
  });

  it("kommt mit leerer Eingabe zurecht", () => {
    expect(groupDocumentsByFolder([], [])).toEqual([]);
    expect(groupDocumentsByFolder([], folders)).toEqual([]);
  });

  it("verliert kein Dokument", () => {
    const docs = [doc("a", "f1"), doc("b", "f2"), doc("c", null), doc("d", "weg")];
    const groups = groupDocumentsByFolder(docs, folders, true);
    const seen = groups.flatMap((g) => g.documents.map((d) => d.id));
    expect(seen.sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("suggestBezeichnung", () => {
  it("entfernt die Endung und ersetzt Trennzeichen", () => {
    expect(suggestBezeichnung("Dienstvertrag_2024.pdf")).toBe("Dienstvertrag 2024");
    expect(suggestBezeichnung("GKK-Anmeldung.pdf")).toBe("GKK Anmeldung");
  });

  it("kommt ohne Endung zurecht", () => {
    expect(suggestBezeichnung("Vertrag")).toBe("Vertrag");
  });
});
