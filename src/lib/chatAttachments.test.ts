import { describe, it, expect } from "vitest";
import {
  attachmentKindFromUrl,
  attachmentKindFromFile,
  isVideoUrl,
  isPdfUrl,
  validateChatFiles,
  attachmentSummary,
  formatFileSize,
  MAX_CHAT_FILE_SIZE,
} from "./chatAttachments";

const BASE = "https://xyz.supabase.co/storage/v1/object/public/project-chat";

/** File-Stub mit steuerbarer Groesse - jsdom erzeugt sonst immer size 0. */
const makeFile = (name: string, type: string, size = 1024): File => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("attachmentKindFromUrl", () => {
  it("erkennt PDFs", () => {
    expect(attachmentKindFromUrl(`${BASE}/proj/1_Angebot.pdf`)).toBe("pdf");
    expect(attachmentKindFromUrl(`${BASE}/proj/1_Angebot.PDF`)).toBe("pdf");
  });

  it("erkennt Videos", () => {
    expect(attachmentKindFromUrl(`${BASE}/proj/1_clip.mp4`)).toBe("video");
    expect(attachmentKindFromUrl(`${BASE}/proj/1_clip.MOV`)).toBe("video");
    expect(attachmentKindFromUrl(`${BASE}/proj/1_clip.webm`)).toBe("video");
    expect(attachmentKindFromUrl(`${BASE}/proj/1_clip.3gp`)).toBe("video");
  });

  it("behandelt alles Uebrige als Bild", () => {
    expect(attachmentKindFromUrl(`${BASE}/proj/1_foto.jpg`)).toBe("image");
    expect(attachmentKindFromUrl(`${BASE}/proj/1_foto.heic`)).toBe("image");
  });

  it("laesst sich von Query-Parametern nicht taeuschen", () => {
    // Der Dateiname endet auf .mp4, der Signatur-Parameter danach auf .pdf
    expect(attachmentKindFromUrl(`${BASE}/proj/clip.mp4?token=abc.pdf`)).toBe("video");
    expect(attachmentKindFromUrl(`${BASE}/proj/doc.pdf?token=abc.mp4`)).toBe("pdf");
  });

  it("funktioniert auch mit reinen Storage-Pfaden ohne Host", () => {
    expect(attachmentKindFromUrl("projekt/17_clip.mp4")).toBe("video");
    expect(attachmentKindFromUrl("projekt/17_plan.pdf")).toBe("pdf");
  });

  it("isVideoUrl / isPdfUrl passen dazu", () => {
    expect(isVideoUrl(`${BASE}/a.mp4`)).toBe(true);
    expect(isVideoUrl(`${BASE}/a.jpg`)).toBe(false);
    expect(isPdfUrl(`${BASE}/a.pdf`)).toBe(true);
    expect(isPdfUrl(`${BASE}/a.mp4`)).toBe(false);
  });
});

describe("attachmentKindFromFile", () => {
  it("erkennt anhand des MIME-Typs", () => {
    expect(attachmentKindFromFile(makeFile("a.pdf", "application/pdf"))).toBe("pdf");
    expect(attachmentKindFromFile(makeFile("a.mp4", "video/mp4"))).toBe("video");
    expect(attachmentKindFromFile(makeFile("a.jpg", "image/jpeg"))).toBe("image");
  });

  it("faellt bei leerem MIME-Typ auf die Endung zurueck", () => {
    expect(attachmentKindFromFile(makeFile("WhatsApp Video.mp4", ""))).toBe("video");
    expect(attachmentKindFromFile(makeFile("Notes.pdf", ""))).toBe("pdf");
  });
});

describe("validateChatFiles", () => {
  it("laesst Bilder, PDFs und Videos durch", () => {
    const files = [
      makeFile("foto.jpg", "image/jpeg"),
      makeFile("plan.pdf", "application/pdf"),
      makeFile("clip.mp4", "video/mp4"),
    ];
    const { accepted, rejected } = validateChatFiles(files);
    expect(accepted).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });

  it("lehnt fremde Dateitypen ab", () => {
    const { accepted, rejected } = validateChatFiles([
      makeFile("virus.exe", "application/x-msdownload"),
    ]);
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/nicht unterstützt/);
  });

  it("lehnt zu grosse Dateien ab, laesst die anderen aber durch", () => {
    const files = [
      makeFile("klein.jpg", "image/jpeg", 1024),
      makeFile("riesig.mp4", "video/mp4", MAX_CHAT_FILE_SIZE + 1),
      makeFile("auch_klein.jpg", "image/jpeg", 2048),
    ];
    const { accepted, rejected } = validateChatFiles(files);
    expect(accepted.map((f) => f.name)).toEqual(["klein.jpg", "auch_klein.jpg"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe("riesig.mp4");
    expect(rejected[0].reason).toMatch(/zu groß/);
  });

  it("akzeptiert genau am Limit", () => {
    const { accepted } = validateChatFiles([
      makeFile("grenz.mp4", "video/mp4", MAX_CHAT_FILE_SIZE),
    ]);
    expect(accepted).toHaveLength(1);
  });

  it("respektiert ein abweichendes Limit", () => {
    const { rejected } = validateChatFiles(
      [makeFile("a.jpg", "image/jpeg", 5000)],
      1000
    );
    expect(rejected).toHaveLength(1);
  });

  it("kommt mit leerer Auswahl zurecht", () => {
    expect(validateChatFiles([])).toEqual({ accepted: [], rejected: [] });
  });
});

describe("attachmentSummary", () => {
  it("benennt den Typ bei genau einer Datei", () => {
    expect(attachmentSummary([makeFile("a.jpg", "image/jpeg")])).toBe("📷 Foto gesendet");
    expect(attachmentSummary([makeFile("a.pdf", "application/pdf")])).toBe("📎 PDF gesendet");
    expect(attachmentSummary([makeFile("a.mp4", "video/mp4")])).toBe("🎥 Video gesendet");
  });

  it("zaehlt bei mehreren Dateien", () => {
    const files = [makeFile("a.jpg", "image/jpeg"), makeFile("b.mp4", "video/mp4")];
    expect(attachmentSummary(files)).toBe("📎 2 Dateien gesendet");
  });

  it("liefert bei leerer Auswahl einen leeren Text", () => {
    expect(attachmentSummary([])).toBe("");
  });
});

describe("formatFileSize", () => {
  it("rundet sinnvoll", () => {
    expect(formatFileSize(11_700 * 1024)).toBe("11.4 MB");
    expect(formatFileSize(302 * 1024)).toBe("302 KB");
    expect(formatFileSize(10)).toBe("1 KB");
  });
});
