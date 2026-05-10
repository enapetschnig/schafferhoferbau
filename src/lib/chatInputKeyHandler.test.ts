import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  let send: ReturnType<typeof vi.fn>;
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
