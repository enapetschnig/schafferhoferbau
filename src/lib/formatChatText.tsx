import React from "react";

// Rendert WhatsApp-Style-Formatierung als React-Nodes:
//   *fett*           -> <strong>
//   _kursiv_         -> <em>
//   ~durchgestrichen~-> <s>
//   `code`           -> <code>
// Plus: Zeilenumbruechen werden zu <br>.
// Konservativ: Marker werden nur erkannt, wenn sie nicht mitten im Wort
// stehen (Wort-Grenze davor/danach).

const PATTERNS: { regex: RegExp; tag: "strong" | "em" | "s" | "code" }[] = [
  { regex: /(^|[\s(])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?=[\s),.!?:;]|$)/g, tag: "strong" },
  { regex: /(^|[\s(])_([^\s_][^_]*?[^\s_]|[^\s_])_(?=[\s),.!?:;]|$)/g, tag: "em" },
  { regex: /(^|[\s(])~([^\s~][^~]*?[^\s~]|[^\s~])~(?=[\s),.!?:;]|$)/g, tag: "s" },
  { regex: /`([^`]+)`/g, tag: "code" },
];

type Token = { type: "text"; text: string } | { type: "tag"; tag: string; text: string };

function tokenizeLine(line: string): Token[] {
  // Naive sequentielle Suche: finde frueheste Match aus allen Pattern,
  // splice sie raus und fahre rekursiv mit dem Rest fort.
  let earliest: { start: number; end: number; inner: string; tag: Token["type"] extends "tag" ? "tag" : never; tagName: string } | null = null;

  for (const { regex, tag } of PATTERNS) {
    regex.lastIndex = 0;
    const m = regex.exec(line);
    if (m) {
      // Bei Patterns mit Lookbehind-Pseudo (m[1]) den eigentlichen Marker-Start nehmen
      const offset = m[1] !== undefined ? m[1].length : 0;
      const start = m.index + offset;
      const end = m.index + m[0].length;
      const inner = m[2] !== undefined ? m[2] : m[1];
      if (earliest === null || start < earliest.start) {
        earliest = { start, end, inner, tag: "tag" as never, tagName: tag };
      }
    }
  }

  if (!earliest) return [{ type: "text", text: line }];

  const tokens: Token[] = [];
  if (earliest.start > 0) tokens.push({ type: "text", text: line.slice(0, earliest.start) });
  tokens.push({ type: "tag", tag: earliest.tagName, text: earliest.inner });
  const rest = line.slice(earliest.end);
  if (rest) tokens.push(...tokenizeLine(rest));
  return tokens;
}

export function formatChatText(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  return lines.map((line, lineIdx) => (
    <React.Fragment key={lineIdx}>
      {tokenizeLine(line).map((t, i) => {
        if (t.type === "text") return <React.Fragment key={i}>{t.text}</React.Fragment>;
        if (t.tag === "strong") return <strong key={i}>{t.text}</strong>;
        if (t.tag === "em") return <em key={i}>{t.text}</em>;
        if (t.tag === "s") return <s key={i}>{t.text}</s>;
        if (t.tag === "code") return <code key={i} className="px-1 py-0.5 rounded bg-muted/60 text-[0.9em]">{t.text}</code>;
        return <React.Fragment key={i}>{t.text}</React.Fragment>;
      })}
      {lineIdx < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}
