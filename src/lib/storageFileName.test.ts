import { describe, expect, it } from "vitest";
import { sanitizeStorageFileName } from "./storageFileName";

describe("sanitizeStorageFileName", () => {
  describe("Umlaute & Eszett (deutsche Sprache)", () => {
    it("ersetzt kleine Umlaute", () => {
      expect(sanitizeStorageFileName("äöüß.pdf")).toBe("aeoeuess.pdf");
    });
    it("ersetzt grosse Umlaute", () => {
      expect(sanitizeStorageFileName("ÄÖÜ.pdf")).toBe("AeOeUe.pdf");
    });
    it("haendelt Real-Use-Filename mit Umlaut", () => {
      expect(sanitizeStorageFileName("Einreichplan Süd v2.pdf")).toBe("Einreichplan_Sued_v2.pdf");
    });
    it("haendelt mehrere Umlaute kombiniert", () => {
      expect(sanitizeStorageFileName("Außenwand_Müller.jpg")).toBe("Aussenwand_Mueller.jpg");
    });
  });

  describe("Akzente & Diakritika", () => {
    it("entfernt franzoesische Akzente", () => {
      expect(sanitizeStorageFileName("café_résumé.pdf")).toBe("cafe_resume.pdf");
    });
    it("entfernt spanische Tilde", () => {
      expect(sanitizeStorageFileName("año.pdf")).toBe("ano.pdf");
    });
    it("entfernt Akut/Gravis", () => {
      expect(sanitizeStorageFileName("àéíóú.pdf")).toBe("aeiou.pdf");
    });
  });

  describe("Sonderzeichen & Leerzeichen", () => {
    it("ersetzt Leerzeichen durch Underscore", () => {
      expect(sanitizeStorageFileName("Hallo Welt.pdf")).toBe("Hallo_Welt.pdf");
    });
    it("ersetzt Klammern und entfernt trailing Underscore", () => {
      expect(sanitizeStorageFileName("Plan (Korrektur).pdf")).toBe("Plan_Korrektur.pdf");
    });
    it("ersetzt Ampersand und Plus", () => {
      expect(sanitizeStorageFileName("Müller & Söhne + Co.pdf")).toBe("Mueller_Soehne_Co.pdf");
    });
    it("ersetzt Slashes und Backslashes", () => {
      expect(sanitizeStorageFileName("a/b\\c.pdf")).toBe("a_b_c.pdf");
    });
    it("ersetzt Sonderzeichen wie ?, #, %", () => {
      expect(sanitizeStorageFileName("test?#%.pdf")).toBe("test.pdf");
    });
    it("kollabiert mehrere Underscores zu einem", () => {
      expect(sanitizeStorageFileName("a   b  c.pdf")).toBe("a_b_c.pdf");
    });
    it("real-use Plan mit allem dabei", () => {
      expect(sanitizeStorageFileName("Einreichplan Süd v2 (Korrektur Statik).pdf")).toBe(
        "Einreichplan_Sued_v2_Korrektur_Statik.pdf"
      );
    });
  });

  describe("Lange Dateinamen", () => {
    it("kuerzt auf 80 Zeichen und behaelt Extension", () => {
      const long = "a".repeat(200) + ".pdf";
      const result = sanitizeStorageFileName(long);
      expect(result.length).toBeLessThanOrEqual(80);
      expect(result.endsWith(".pdf")).toBe(true);
    });
    it("kuerzt korrekt bei jpg-Extension", () => {
      const long = "Foto_von_der_Baustelle_im_Winter_mit_viel_Schnee_und_kaltem_Wetter_2026_03_15.jpg";
      const result = sanitizeStorageFileName(long.repeat(3));
      expect(result.length).toBeLessThanOrEqual(80);
      expect(result.endsWith(".jpg")).toBe(true);
    });
  });

  describe("Edge-Cases & Fallbacks", () => {
    it("leerer String -> 'datei'", () => {
      expect(sanitizeStorageFileName("")).toBe("datei");
    });
    it("nur Sonderzeichen -> 'datei'", () => {
      expect(sanitizeStorageFileName("!!!@#$%")).toBe("datei");
    });
    it("nur Punkte -> 'datei'", () => {
      expect(sanitizeStorageFileName("....")).toBe("datei");
    });
    it("nur Underscores -> 'datei'", () => {
      expect(sanitizeStorageFileName("_____")).toBe("datei");
    });
    it("Datei ohne Extension bleibt verwendbar", () => {
      expect(sanitizeStorageFileName("Notizen")).toBe("Notizen");
    });
    it("versteckte Datei mit Punkt vorne", () => {
      expect(sanitizeStorageFileName(".gitignore")).toBe("gitignore");
    });
  });

  describe("iOS/Android-Foto-Filenames", () => {
    it("iOS Standard-Foto", () => {
      expect(sanitizeStorageFileName("IMG_1234.jpeg")).toBe("IMG_1234.jpeg");
    });
    it("iOS Foto mit Klammer (Duplikat)", () => {
      expect(sanitizeStorageFileName("IMG_1234 (1).jpeg")).toBe("IMG_1234_1.jpeg");
    });
    it("WhatsApp-Foto-Pattern (Punkte im Basename werden Underscores)", () => {
      expect(sanitizeStorageFileName("WhatsApp Image 2026-04-28 at 18.02.25.jpeg")).toBe(
        "WhatsApp_Image_2026-04-28_at_18_02_25.jpeg"
      );
    });
    it("Android-Scan", () => {
      expect(sanitizeStorageFileName("Scan_20260408_073045.pdf")).toBe("Scan_20260408_073045.pdf");
    });
  });

  describe("Asiatische / nicht-lateinische Schrift", () => {
    it("Kyrillisch -> Fallback im Basename, Extension bleibt", () => {
      expect(sanitizeStorageFileName("Кириллица.pdf")).toBe("datei.pdf");
    });
    it("Japanisch + Latin behaelt Latin-Teil", () => {
      expect(sanitizeStorageFileName("写真_test.jpg")).toBe("test.jpg");
    });
    it("Nur Japanisch -> Fallback", () => {
      expect(sanitizeStorageFileName("写真.jpg")).toBe("datei.jpg");
    });
  });

  describe("Storage-Path-Sicherheit (kein Path-Traversal)", () => {
    it("entfernt Pfad-Traversal-Versuche", () => {
      const result = sanitizeStorageFileName("../../../etc/passwd");
      expect(result).not.toContain("/");
      expect(result).not.toContain("..");
    });
    it("Slashes komplett raus", () => {
      const result = sanitizeStorageFileName("foo/bar/baz.txt");
      expect(result).not.toContain("/");
      expect(result.endsWith(".txt")).toBe(true);
    });
  });

  describe("Idempotenz", () => {
    it("doppelte Anwendung aendert nichts", () => {
      const inputs = [
        "Einreichplan Süd.pdf",
        "Hallo Welt.jpg",
        "Müller & Söhne.pdf",
        "IMG_1234 (1).jpeg",
        "Кириллица.pdf",
      ];
      for (const input of inputs) {
        const once = sanitizeStorageFileName(input);
        const twice = sanitizeStorageFileName(once);
        expect(twice).toBe(once);
      }
    });
  });

  describe("Extension-Erhalt bei diversen Endungen", () => {
    it.each([
      ["doc.pdf", "doc.pdf"],
      ["doc.PDF", "doc.PDF"],
      ["doc.docx", "doc.docx"],
      ["doc.jpeg", "doc.jpeg"],
      // Doppelte Endungen: nur die letzte zaehlt als Extension
      ["doc.tar.gz", "doc_tar.gz"],
    ])("behaelt %s", (input, expected) => {
      expect(sanitizeStorageFileName(input)).toBe(expected);
    });
  });
});
