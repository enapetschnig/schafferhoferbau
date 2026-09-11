import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { handleChatInputKeyDown } from "./chatInputKeyHandler";

type MockKeyEvent = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault: () => void;
};

const makeEvent = (overrides: Partial<MockKeyEvent>): MockKeyEvent => ({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  ...overrides,
});

const setTouchPrimary = (isTouch: boolean) => {
  // @ts-expect-error vitest jsdom
  globalThis.window = globalThis.window ?? {};
  // @ts-expect-error matchMedia mock
  globalThis.window.matchMedia = (q: string) => ({
    matches: q === "(pointer: coarse)" ? isTouch : false,
    media: q,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  });
};

describe("handleChatInputKeyDown", () => {
  let send: Mock<() => void>;
  beforeEach(() => { send = vi.fn(); });
  afterEach(() => {
    // @ts-expect-error cleanup
    delete globalThis.window?.matchMedia;
  });

  describe("Desktop (pointer: fine)", () => {
    beforeEach(() => setTouchPrimary(false));

    it("Plain Enter sendet die Nachricht", () => {
      const e = makeEvent({});
      handleChatInputKeyDown(send)(e as any);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(send).toHaveBeenCalledOnce();
    });

    it("Shift+Enter sendet NICHT (neue Zeile)", () => {
      const e = makeEvent({ shiftKey: true });
      handleChatInputKeyDown(send)(e as any);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it("Alt+Enter sendet NICHT (neue Zeile, WhatsApp-Verhalten)", () => {
      const e = makeEvent({ altKey: true });
      handleChatInputKeyDown(send)(e as any);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it("Ctrl+Enter sendet NICHT (neue Zeile)", () => {
      const e = makeEvent({ ctrlKey: true });
      handleChatInputKeyDown(send)(e as any);
      expect(send).not.toHaveBeenCalled();
    });

    it("Cmd+Enter (Mac) sendet NICHT (neue Zeile)", () => {
      const e = makeEvent({ metaKey: true });
      handleChatInputKeyDown(send)(e as any);
      expect(send).not.toHaveBeenCalled();
    });

    it("andere Tasten ignorieren den Handler komplett", () => {
      const e = makeEvent({ key: "a" });
      handleChatInputKeyDown(send)(e as any);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("Mobile (pointer: coarse)", () => {
    beforeEach(() => setTouchPrimary(true));

    it("Enter sendet NICHT (Default-Verhalten = neue Zeile)", () => {
      const e = makeEvent({});
      handleChatInputKeyDown(send)(e as any);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it("Shift+Enter sendet auch NICHT", () => {
      const e = makeEvent({ shiftKey: true });
      handleChatInputKeyDown(send)(e as any);
      expect(send).not.toHaveBeenCalled();
    });
  });
});

describe("Zeilenumbruch bei Strg/Alt/Cmd + Enter", () => {
  let send: Mock<() => void>;

  const machFeld = (wert: string, cursor: number) => ({
    tagName: "TEXTAREA",
    value: wert,
    selectionStart: cursor,
    selectionEnd: cursor,
  });

  beforeEach(() => {
    send = vi.fn();
    setTouchPrimary(false);
    // requestAnimationFrame in jsdom bereitstellen
    // @ts-expect-error Testumgebung
    globalThis.requestAnimationFrame = (cb: () => void) => { cb(); return 0; };
  });

  it("Strg+Enter fuegt eine Zeile an der Cursorposition ein", () => {
    const setzeText = vi.fn();
    const feld = machFeld("Hallo Welt", 5);
    const e = { ...makeEvent({ ctrlKey: true }), currentTarget: feld };
    handleChatInputKeyDown(send, setzeText)(e as any);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(setzeText).toHaveBeenCalledWith("Hallo\n Welt");
    expect(send).not.toHaveBeenCalled();
  });

  it("Alt+Enter genauso", () => {
    const setzeText = vi.fn();
    const e = { ...makeEvent({ altKey: true }), currentTarget: machFeld("AB", 2) };
    handleChatInputKeyDown(send, setzeText)(e as any);
    expect(setzeText).toHaveBeenCalledWith("AB\n");
  });

  it("Cmd+Enter genauso", () => {
    const setzeText = vi.fn();
    const e = { ...makeEvent({ metaKey: true }), currentTarget: machFeld("AB", 0) };
    handleChatInputKeyDown(send, setzeText)(e as any);
    expect(setzeText).toHaveBeenCalledWith("\nAB");
  });

  it("ersetzt eine markierte Auswahl", () => {
    const setzeText = vi.fn();
    const feld = { tagName: "TEXTAREA", value: "Hallo Welt", selectionStart: 0, selectionEnd: 5 };
    const e = { ...makeEvent({ ctrlKey: true }), currentTarget: feld };
    handleChatInputKeyDown(send, setzeText)(e as any);
    expect(setzeText).toHaveBeenCalledWith("\n Welt");
  });

  it("Umschalt+Enter bleibt dem Browser ueberlassen", () => {
    const setzeText = vi.fn();
    const e = { ...makeEvent({ shiftKey: true }), currentTarget: machFeld("AB", 1) };
    handleChatInputKeyDown(send, setzeText)(e as any);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(setzeText).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("einzeiliges Feld bricht nicht um", () => {
    const setzeText = vi.fn();
    const feld = { tagName: "INPUT", value: "AB", selectionStart: 1, selectionEnd: 1 };
    const e = { ...makeEvent({ ctrlKey: true }), currentTarget: feld };
    handleChatInputKeyDown(send, setzeText)(e as any);
    expect(setzeText).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("ohne Setter bleibt es beim alten Verhalten", () => {
    const e = { ...makeEvent({ ctrlKey: true }), currentTarget: machFeld("AB", 1) };
    handleChatInputKeyDown(send)(e as any);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("Enter ohne Zusatztaste sendet weiterhin", () => {
    const setzeText = vi.fn();
    const e = { ...makeEvent({}), currentTarget: machFeld("AB", 1) };
    handleChatInputKeyDown(send, setzeText)(e as any);
    expect(send).toHaveBeenCalled();
    expect(setzeText).not.toHaveBeenCalled();
  });
});
