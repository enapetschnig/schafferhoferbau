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
