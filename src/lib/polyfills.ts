// Polyfills fuer aeltere Browser (insbesondere Android Chrome < 134).
// Muss VOR allen Modulen geladen werden, die diese Features nutzen
// (z.B. pdfjs-dist nutzt Uint8Array.prototype.toHex).

// Uint8Array.prototype.toHex (ES2025, Stage 3 Proposal)
// https://github.com/tc39/proposal-arraybuffer-base64
if (typeof (Uint8Array.prototype as any).toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    value: function toHex(this: Uint8Array): string {
      let s = "";
      for (let i = 0; i < this.length; i++) {
        s += this[i].toString(16).padStart(2, "0");
      }
      return s;
    },
    writable: true,
    configurable: true,
  });
}

// Uint8Array.fromHex (Gegenstueck, falls benoetigt)
if (typeof (Uint8Array as any).fromHex !== "function") {
  Object.defineProperty(Uint8Array, "fromHex", {
    value: function fromHex(hex: string): Uint8Array {
      if (hex.length % 2 !== 0) throw new SyntaxError("Hex string length must be even");
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        const byte = parseInt(hex.substr(i * 2, 2), 16);
        if (Number.isNaN(byte)) throw new SyntaxError("Invalid hex string");
        out[i] = byte;
      }
      return out;
    },
    writable: true,
    configurable: true,
  });
}

// Uint8Array.prototype.toBase64 / Uint8Array.fromBase64 — gleicher Proposal-Status,
// derzeit nicht von pdfjs verwendet, daher hier nicht polyfilled.
