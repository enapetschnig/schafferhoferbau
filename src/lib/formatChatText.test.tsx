import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatChatText } from "./formatChatText";

const html = (text: string) => renderToStaticMarkup(<>{formatChatText(text)}</>);

describe("formatChatText", () => {
  describe("Fett (*...*)", () => {
    it("am Zeilenanfang", () => {
      expect(html("*test*")).toContain("<strong>test</strong>");
    });
    it("nach Leerzeichen", () => {
      expect(html("hallo *welt*")).toContain("hallo <strong>welt</strong>");
    });
    it("ignoriert Stern-im-Wort", () => {
      expect(html("5*3=15")).toBe("5*3=15");
    });
  });

  describe("Kursiv (_..._)", () => {
    it("einzeln", () => {
      expect(html("_kursiv_")).toContain("<em>kursiv</em>");
    });
    it("mit Text drumrum", () => {
      expect(html("hallo _kursiv_ welt")).toContain("hallo <em>kursiv</em> welt");
    });
  });

  describe("Durchgestrichen (~...~)", () => {
    it("einzeln", () => {
      expect(html("~weg~")).toContain("<s>weg</s>");
    });
  });

  describe("Code (`...`)", () => {
    // Das war der gefundene Bug: vorher wurde der Offset falsch berechnet,
    // sodass am Zeilenanfang die Code-Formatierung Text vor sich abschnitt.
    it("am Zeilenanfang inkl. Text danach", () => {
      const out = html("`code` rest");
      expect(out).toContain("<code");
      expect(out).toContain(">code</code>");
      expect(out).toContain(" rest");
      // Wichtig: kein Text vor dem Code-Tag verlorengegangen
      expect(out).not.toMatch(/cod>/);
    });
    it("in der Mitte", () => {
      const out = html("vor `code` nach");
      expect(out).toContain("vor ");
      expect(out).toContain(">code</code>");
      expect(out).toContain(" nach");
    });
    it("nur code", () => {
      expect(html("`x`")).toContain("<code");
    });
  });

  describe("Mehrzeilig", () => {
    it("Zeilenumbruch wird zu <br>", () => {
      expect(html("eins\nzwei")).toContain("eins<br/>zwei");
    });
    it("Format ueber mehrere Zeilen", () => {
      const out = html("*fett*\n_kursiv_");
      expect(out).toContain("<strong>fett</strong>");
      expect(out).toContain("<em>kursiv</em>");
      expect(out).toContain("<br/>");
    });
  });

  describe("Edge-Cases", () => {
    it("leerer String", () => {
      expect(formatChatText("")).toBeNull();
    });
    it("nur Marker ohne Inhalt", () => {
      expect(html("**")).toBe("**");
    });
    it("kein Format -> einfach Text", () => {
      expect(html("hallo welt")).toBe("hallo welt");
    });
    it("mehrere Marker hintereinander", () => {
      const out = html("*fett* und _kursiv_");
      expect(out).toContain("<strong>fett</strong>");
      expect(out).toContain("<em>kursiv</em>");
    });
    it("Marker mitten im Wort wird ignoriert", () => {
      // Bei foo*bar*baz sollte *bar* nicht formatiert werden, da kein Wort-Boundary
      expect(html("foo*bar*baz")).toBe("foo*bar*baz");
    });
  });
});

describe("Aufzaehlungslisten", () => {
  it("erkennt Bindestrich-Listen", () => {
    const out = html("- Ziegel\n- Mörtel");
    expect(out).toContain("<ul");
    expect(out).toContain("<li>Ziegel</li>");
    expect(out).toContain("<li>Mörtel</li>");
  });

  it("erkennt Stern-Listen (Stern + Leerzeichen)", () => {
    expect(html("* Ziegel\n* Mörtel")).toContain("<li>Ziegel</li>");
  });

  it("erkennt Aufzaehlungspunkte", () => {
    expect(html("• Ziegel")).toContain("<li>Ziegel</li>");
  });

  it("verwechselt Fettschrift NICHT mit einer Liste", () => {
    // *fett* hat kein Leerzeichen nach dem Stern
    const out = html("*wichtig*");
    expect(out).toContain("<strong>wichtig</strong>");
    expect(out).not.toContain("<ul");
  });

  it("formatiert innerhalb der Listenpunkte weiter", () => {
    expect(html("- *Ziegel* holen")).toContain("<strong>Ziegel</strong>");
  });

  it("fasst nur zusammenhaengende Zeilen zusammen", () => {
    const out = html("- A\nText\n- B");
    expect((out.match(/<ul/g) || []).length).toBe(2);
  });
});

describe("Nummerierte Listen", () => {
  it("erkennt 1. 2. 3.", () => {
    const out = html("1. Erstens\n2. Zweitens");
    expect(out).toContain("<ol");
    expect(out).toContain("<li>Erstens</li>");
    expect(out).toContain("<li>Zweitens</li>");
  });

  it("erkennt auch 1) 2)", () => {
    expect(html("1) Erstens")).toContain("<li>Erstens</li>");
  });

  it("uebernimmt die Startnummer", () => {
    expect(html("3. Drittens")).toContain('start="3"');
  });

  it("verwechselt Datum/Betrag nicht mit einer Liste", () => {
    // "12.09." hat kein Leerzeichen nach dem Punkt
    expect(html("12.09. Baustelle")).not.toContain("<ol");
    expect(html("Kosten 1.500 Euro")).not.toContain("<ol");
  });

  it("trennt Aufzaehlung und Nummerierung", () => {
    const out = html("- A\n1. B");
    expect(out).toContain("<ul");
    expect(out).toContain("<ol");
  });
});

describe("Kein Rueckschritt bei einfachem Text", () => {
  it("normale Zeilenumbrueche bleiben br", () => {
    expect(html("Zeile 1\nZeile 2")).toBe("Zeile 1<br/>Zeile 2");
  });

  it("einzelne Zeile bleibt unveraendert", () => {
    expect(html("Hallo Welt")).toBe("Hallo Welt");
  });

  it("leerer Text ergibt nichts", () => {
    expect(html("")).toBe("");
  });
});
