import { describe, it, expect } from "vitest";
import {
  getEffectiveRole,
  roleLevel,
  meetsMinRole,
  roleLabel,
  isInRoleGroup,
  ROLE_LEVEL,
} from "./employeeRoles";

describe("getEffectiveRole", () => {
  it("Administrator sticht immer", () => {
    expect(getEffectiveRole(true, "vorarbeiter")).toBe("admin");
    expect(getEffectiveRole(true, null)).toBe("admin");
    expect(getEffectiveRole(true, "extern")).toBe("admin");
  });

  it("uebernimmt die Kategorie", () => {
    expect(getEffectiveRole(false, "vorarbeiter")).toBe("vorarbeiter");
    expect(getEffectiveRole(false, "lehrling")).toBe("lehrling");
    expect(getEffectiveRole(false, "bauherr")).toBe("bauherr");
  });

  it("faellt ohne Kategorie auf Facharbeiter zurueck", () => {
    expect(getEffectiveRole(false, null)).toBe("facharbeiter");
    expect(getEffectiveRole(false, undefined)).toBe("facharbeiter");
    expect(getEffectiveRole(false, "")).toBe("facharbeiter");
  });

  it("bildet extern ab", () => {
    expect(getEffectiveRole(false, "extern")).toBe("extern");
  });
});

describe("roleLevel / meetsMinRole", () => {
  it("bildet die Rangfolge ab", () => {
    expect(ROLE_LEVEL.admin).toBeGreaterThan(ROLE_LEVEL.vorarbeiter);
    expect(ROLE_LEVEL.vorarbeiter).toBeGreaterThan(ROLE_LEVEL.facharbeiter);
    expect(ROLE_LEVEL.facharbeiter).toBeGreaterThan(ROLE_LEVEL.lehrling);
    expect(ROLE_LEVEL.lehrling).toBeGreaterThan(ROLE_LEVEL.extern);
  });

  it("wertet unbekannte Rollen als Facharbeiter", () => {
    expect(roleLevel("bauherr")).toBe(ROLE_LEVEL.facharbeiter);
    expect(roleLevel(null)).toBe(ROLE_LEVEL.facharbeiter);
  });

  it("prueft Mindestrollen", () => {
    expect(meetsMinRole("vorarbeiter", "facharbeiter")).toBe(true);
    expect(meetsMinRole("facharbeiter", "vorarbeiter")).toBe(false);
    expect(meetsMinRole("admin", "admin")).toBe(true);
    expect(meetsMinRole("extern", "lehrling")).toBe(false);
  });
});

describe("roleLabel", () => {
  it("liefert deutsche Bezeichnungen", () => {
    expect(roleLabel("admin")).toBe("Administrator");
    expect(roleLabel("administrator")).toBe("Administrator");
    expect(roleLabel("vorarbeiter")).toBe("Vorarbeiter");
    expect(roleLabel("facharbeiter")).toBe("Mitarbeiter");
    expect(roleLabel("lehrling")).toBe("Lehrling");
    expect(roleLabel("extern")).toBe("Extern");
    expect(roleLabel("bauherr")).toBe("Bauherr");
  });

  it("faellt sinnvoll zurueck", () => {
    expect(roleLabel(null)).toBe("Mitarbeiter");
    expect(roleLabel("unbekannt")).toBe("unbekannt");
  });

  it("zeigt einen Vorarbeiter NICHT als Mitarbeiter", () => {
    // Genau der gemeldete Fehler: Markus Friesenbichler stand als Mitarbeiter da
    const rolle = getEffectiveRole(false, "vorarbeiter");
    expect(roleLabel(rolle)).toBe("Vorarbeiter");
  });
});

describe("isInRoleGroup", () => {
  it("Mitarbeiter umfasst Facharbeiter und Lehrlinge", () => {
    expect(isInRoleGroup("facharbeiter", "mitarbeiter")).toBe(true);
    expect(isInRoleGroup("lehrling", "mitarbeiter")).toBe(true);
    expect(isInRoleGroup("vorarbeiter", "mitarbeiter")).toBe(false);
    expect(isInRoleGroup("admin", "mitarbeiter")).toBe(false);
  });

  it("trennt Vorarbeiter und Administratoren", () => {
    expect(isInRoleGroup("vorarbeiter", "vorarbeiter")).toBe(true);
    expect(isInRoleGroup("admin", "administrator")).toBe(true);
    expect(isInRoleGroup("vorarbeiter", "administrator")).toBe(false);
  });

  it("Externe umfassen auch Bauherren", () => {
    expect(isInRoleGroup("extern", "extern")).toBe(true);
    expect(isInRoleGroup("bauherr", "extern")).toBe(true);
  });

  it("behandelt fehlende Rolle als Facharbeiter", () => {
    expect(isInRoleGroup(null, "mitarbeiter")).toBe(true);
  });

  it("kennt keine erfundenen Gruppen", () => {
    expect(isInRoleGroup("admin", "gibtsnicht")).toBe(false);
  });
});
