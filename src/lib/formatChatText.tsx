import React from "react";

// Rendert WhatsApp-Style-Formatierung als React-Nodes:
//   *fett*           -> <strong>
//   _kursiv_         -> <em>
//   ~durchgestrichen~-> <s>
//   `code`           -> <code>
//   "- " / "* " / "• "-> Aufzaehlungsliste <ul>
//   "1. " / "1) "     -> nummerierte Liste <ol>
// Plus: Zeilenumbruechen werden zu <br>.
// Wort-Marker (*, _, ~) werden nur an Wort-Grenzen erkannt; `code` darf
// auch mitten im Wort vorkommen.

type PatternDef = {
  regex: RegExp;
  tag: "strong" | "em" | "s" | "code";
  // hasLeading=true: erste Capture-Group ist Lookbehind-Pseudo (^|[\s(]),
  //                  zweite Group ist der innere Inhalt
  // hasLeading=false: erste Capture-Group ist direkt der innere Inhalt
  hasLeading: boolean;
};

const PATTERNS: PatternDef[] = [
  { regex: /(^|[\s(])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?=[\s),.!?:;]|$)/g, tag: "strong", hasLeading: true },
  { regex: /(^|[\s(])_([^\s_][^_]*?[^\s_]|[^\s_])_(?=[\s),.!?:;]|$)/g, tag: "em", hasLeading: true },
  { regex: /(^|[\s(])~([^\s~][^~]*?[^\s~]|[^\s~])~(?=[\s),.!?:;]|$)/g, tag: "s", hasLeading: true },
  { regex: /`([^`]+)`/g, tag: "code", hasLeading: false },
];

type Token = { type: "text"; text: string } | { type: "tag"; tag: string; text: string };

function tokenizeLine(line: string): Token[] {
  // Naive sequentielle Suche: finde frueheste Match aus allen Pattern,
  // splice sie raus und fahre rekursiv mit dem Rest fort.
  let earliest: { start: number; end: number; inner: string; tagName: PatternDef["tag"] } | null = null;

  for (const { regex, tag, hasLeading } of PATTERNS) {
    regex.lastIndex = 0;
    const m = regex.exec(line);
    if (!m) continue;

    // Bei hasLeading-Pattern: m[1] ist der Leading-Char (oder ""), m[2] ist Inhalt.
    // Bei !hasLeading (code): m[1] ist direkt der Inhalt.
    const offset = hasLeading ? (m[1]?.length ?? 0) : 0;
    const start = m.index + offset;
    const end = m.index + m[0].length;
    const inner = hasLeading ? (m[2] ?? "") : (m[1] ?? "");

    if (earliest === null || start < earliest.start) {
      earliest = { start, end, inner, tagName: tag };
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

function renderLine(line: string, key: React.Key): React.ReactNode {
  return (
    <React.Fragment key={key}>
      {tokenizeLine(line).map((t, i) => {
        if (t.type === "text") return <React.Fragment key={i}>{t.text}</React.Fragment>;
        if (t.tag === "strong") return <strong key={i}>{t.text}</strong>;
        if (t.tag === "em") return <em key={i}>{t.text}</em>;
        if (t.tag === "s") return <s key={i}>{t.text}</s>;
        if (t.tag === "code") return <code key={i} className="px-1 py-0.5 rounded bg-muted/60 text-[0.9em]">{t.text}</code>;
        return <React.Fragment key={i}>{t.text}</React.Fragment>;
      })}
    </React.Fragment>
  );
}

// Aufzaehlung: "- ", "* " oder "• " am Zeilenanfang. Das Leerzeichen ist
// entscheidend - "*fett*" hat keines und bleibt damit Fettschrift.
const AUFZAEHLUNG = /^[ \t]*[-*•][ \t]+(.*)$/;
// Nummerierung: "1. " oder "1) " am Zeilenanfang.
const NUMMERIERUNG = /^[ \t]*(\d{1,3})[.)][ \t]+(.*)$/;

type Block =
  | { art: "ul"; zeilen: string[] }
  | { art: "ol"; zeilen: string[]; start: number }
  | { art: "text"; zeilen: string[] };

/** Fasst aufeinanderfolgende Listenzeilen zu Bloecken zusammen. */
function inBloecke(lines: string[]): Block[] {
  const bloecke: Block[] = [];

  for (const line of lines) {
    const auf = line.match(AUFZAEHLUNG);
    const num = line.match(NUMMERIERUNG);
    const letzter = bloecke[bloecke.length - 1];

    if (auf) {
      if (letzter?.art === "ul") letzter.zeilen.push(auf[1]);
      else bloecke.push({ art: "ul", zeilen: [auf[1]] });
    } else if (num) {
      if (letzter?.art === "ol") letzter.zeilen.push(num[2]);
      else bloecke.push({ art: "ol", zeilen: [num[2]], start: Number(num[1]) });
    } else {
      if (letzter?.art === "text") letzter.zeilen.push(line);
      else bloecke.push({ art: "text", zeilen: [line] });
    }
  }

  return bloecke;
}

export function formatChatText(text: string): React.ReactNode {
  if (!text) return null;
  const bloecke = inBloecke(text.split(/\r?\n/));

  return bloecke.map((block, bi) => {
    if (block.art === "ul") {
      return (
        <ul key={bi} className="list-disc pl-5 my-0.5 space-y-0.5">
          {block.zeilen.map((z, i) => <li key={i}>{renderLine(z, i)}</li>)}
        </ul>
      );
    }
    if (block.art === "ol") {
      return (
        <ol key={bi} start={block.start} className="list-decimal pl-5 my-0.5 space-y-0.5">
          {block.zeilen.map((z, i) => <li key={i}>{renderLine(z, i)}</li>)}
        </ol>
      );
    }
    // Reiner Text: Zeilenumbrueche wie bisher als <br>, aber keiner am Ende
    // eines Blocks, der von einer Liste gefolgt wird.
    return (
      <React.Fragment key={bi}>
        {block.zeilen.map((z, i) => (
          <React.Fragment key={i}>
            {renderLine(z, i)}
            {i < block.zeilen.length - 1 && <br />}
          </React.Fragment>
        ))}
      </React.Fragment>
    );
  });
}
