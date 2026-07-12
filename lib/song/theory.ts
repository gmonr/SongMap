/**
 * Music-theory helpers: transposition and Roman-numeral / Nashville-number
 * display, powered by tonal. Numbers are always derived from the song key at
 * render time — never stored — so key changes and toggles can't drift.
 */
import { Interval, Note, Progression } from "tonal";

/** Display keys offered by the key selector, one per semitone. */
export const KEYS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export type Notation = "letters" | "roman" | "nashville";

const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);

/** "Am" -> { tonic: "A", minor: true }; "Bb" -> { tonic: "Bb", minor: false } */
export function parseKey(key: string | null | undefined): {
  tonic: string;
  minor: boolean;
} {
  const m = (key ?? "C").trim().match(/^([A-G](?:#|b)?)\s*(m|min|minor|-)?/i);
  if (!m) return { tonic: "C", minor: false };
  const tonic = m[1][0].toUpperCase() + m[1].slice(1);
  return { tonic, minor: Boolean(m[2]) };
}

/** Move a key name by n semitones, snapping to the KEYS spelling list. */
export function shiftKey(key: string, semitones: number): string {
  const { tonic, minor } = parseKey(key);
  const chroma = Note.chroma(tonic);
  if (chroma === undefined || chroma === null) return key;
  const next = KEYS[(((chroma + semitones) % 12) + 12) % 12];
  return minor ? `${next}m` : next;
}

const ROOT_RE = /^([A-G](?:#{1,2}|b{1,2})?)(.*)$/;

function preferAccidental(note: string, targetTonic: string): string {
  const simplified = Note.simplify(note) || note;
  const wantFlats = FLAT_KEYS.has(targetTonic) || targetTonic.includes("b");
  const wantSharps = targetTonic.includes("#");
  if (wantFlats && simplified.includes("#")) {
    return Note.enharmonic(simplified) || simplified;
  }
  if (wantSharps && simplified.includes("b")) {
    return Note.enharmonic(simplified) || simplified;
  }
  return simplified;
}

/**
 * Transpose a chord symbol (including slash bass) from one key to another.
 * Non-chord text ("N.C.", "%", empty) passes through untouched.
 */
export function transposeChord(
  sym: string,
  fromKey: string,
  toKey: string
): string {
  if (!sym) return sym;
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  if (from.tonic === to.tonic) return sym;
  const interval = Interval.distance(from.tonic, to.tonic);

  const transposePart = (part: string): string => {
    const m = part.match(ROOT_RE);
    if (!m) return part;
    const moved = Note.transpose(m[1], interval);
    if (!moved) return part;
    return preferAccidental(moved, to.tonic) + m[2];
  };

  return sym.split("/").map(transposePart).join("/");
}

/** Structured chord rendering: main symbol, superscript suffix, slash bass. */
export interface ChordDisplay {
  main: string;
  sup?: string;
  bass?: string;
}

const NUMERAL_TO_NUMBER: Record<string, string> = {
  I: "1",
  II: "2",
  III: "3",
  IV: "4",
  V: "5",
  VI: "6",
  VII: "7",
};

interface ParsedRoman {
  accidental: string;
  numeral: string;
  minor: boolean;
  dim: boolean;
  aug: boolean;
  suffix: string;
}

/** Parse tonal's "bVIIm7"-style output into casing-ready pieces. */
function parseRoman(roman: string): ParsedRoman | null {
  const m = roman.match(/^(b|#)?([IVX]+)(.*)$/i);
  if (!m) return null;
  const numeral = m[2].toUpperCase();
  let suffix = m[3] ?? "";
  let minor = false;
  let dim = false;
  let aug = false;
  if (/^(dim|o|°)/.test(suffix)) {
    dim = true;
    suffix = suffix.replace(/^(dim|o|°)/, "");
  } else if (/^(aug|\+)/.test(suffix)) {
    aug = true;
    suffix = suffix.replace(/^(aug|\+)/, "");
  } else if (/^m(?!aj)/.test(suffix)) {
    minor = true;
    suffix = suffix.replace(/^m/, "");
  }
  return { accidental: m[1] ?? "", numeral, minor, dim, aug, suffix };
}

function romanOf(tonic: string, sym: string): ParsedRoman | null {
  const [roman] = Progression.toRomanNumerals(tonic, [sym]);
  if (!roman) return null;
  return parseRoman(roman);
}

/**
 * Render a chord symbol in the requested notation, relative to `key`.
 * Falls back to the raw symbol when it can't be interpreted.
 */
export function chordDisplay(
  sym: string,
  key: string | null | undefined,
  notation: Notation
): ChordDisplay {
  const trimmed = (sym ?? "").trim();
  if (!trimmed) return { main: "" };

  const [mainPart, bassPart] = trimmed.split("/");

  if (notation === "letters") {
    return {
      main: mainPart,
      bass: bassPart ? `/${bassPart}` : undefined,
    };
  }

  const { tonic } = parseKey(key);
  const parsed = romanOf(tonic, mainPart);
  if (!parsed) return { main: trimmed };

  const bassParsed = bassPart ? romanOf(tonic, bassPart) : null;

  if (notation === "roman") {
    let main = parsed.accidental + parsed.numeral;
    if (parsed.minor) main = parsed.accidental + parsed.numeral.toLowerCase();
    if (parsed.dim) main = parsed.accidental + parsed.numeral.toLowerCase() + "°";
    if (parsed.aug) main += "+";
    return {
      main,
      sup: parsed.suffix || undefined,
      bass: bassParsed
        ? `/${bassParsed.accidental}${bassParsed.numeral}`
        : bassPart
          ? `/${bassPart}`
          : undefined,
    };
  }

  // Nashville: scale-degree numbers; "-" marks minor, "°" diminished.
  const number = NUMERAL_TO_NUMBER[parsed.numeral] ?? parsed.numeral;
  let main = parsed.accidental + number;
  if (parsed.minor) main += "-";
  if (parsed.dim) main += "°";
  if (parsed.aug) main += "+";
  const bassNumber = bassParsed
    ? NUMERAL_TO_NUMBER[bassParsed.numeral] ?? bassParsed.numeral
    : null;
  return {
    main,
    sup: parsed.suffix || undefined,
    bass: bassNumber
      ? `/${bassParsed!.accidental}${bassNumber}`
      : bassPart
        ? `/${bassPart}`
        : undefined,
  };
}
