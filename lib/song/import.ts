/**
 * Phase 2: paste-and-parse import.
 *
 * Turns a pasted chord sheet into SongData. Two source formats, both parsed
 * by chordsheetjs into the same Song structure:
 *   - Ultimate Guitar style: chord lines above lyric lines, [Verse 1] headers
 *   - ChordPro: [C]inline chords and {title:}/{key:} directives (auto-detected)
 *
 * No source format encodes bars, so the mapping is a heuristic: each chord
 *  change starts a new bar and the lyric chunk under it becomes that bar's
 * phrase. The one exception is pipe notation ("| Am . . . | F |"), common in
 * UG intro/solo blocks, which *does* encode bars — those are parsed exactly,
 * including beat dots. Bar counts are meant to be corrected by hand in the
 * editor afterwards.
 */
import { ChordLyricsPair, ChordProParser, Tag, UltimateGuitarParser } from "chordsheetjs";
import { SECTION_COLOR_NAMES } from "./colors";
import type { ArrangementItem, Bar, Line, SectionDef, SongData } from "./types";

export interface ChordSheetImport {
  data: SongData;
  /** Detected source format. */
  format: "chordpro" | "ultimate-guitar";
  /** Metadata from ChordPro directives, when present. */
  title?: string;
  artist?: string;
  key?: string;
  /** Fallback key guess from the chords themselves. */
  guessedKey?: string;
  warnings: string[];
}

/* ---------------------------------------------------------------- */

const CHORD_SYM_RE =
  /^[A-G](?:#|b)?(?:[A-Za-z0-9#b+°ø()\-]*)(?:\/[A-G](?:#|b)?)?$/;

function isChordToken(tok: string): boolean {
  return tok === "N.C." || CHORD_SYM_RE.test(tok);
}

/** Guitar-tab string line, e.g. "e|--3--0--|" — nothing we can import. */
const TAB_LINE_RE = /^\s*[eEADGBb]\s*\|[-0-9hpbrxs~/\\^()|. ]+$/;

/** "| Am . . . | F . G . |" — pipes are real bar lines; dots are beats. */
const PIPE_LINE_RE = /^\s*\|.*\|?\s*$/;

/**
 * UltimateGuitarParser trims the lyrics of the *last* chord/lyric chunk on
 * every line, so when the last chord sits above a word boundary ("he │soñado")
 * the leading space is lost and the chunk becomes indistinguishable from a
 * genuine mid-word split ("de│seo"). Mirror the upstream method minus the
 * lyric trim — whitespace is normalized later when lyrics land in bars.
 */
class SpacePreservingUGParser extends UltimateGuitarParser {
  parseLyricsWithChords(chordsLine: string, lyricsLine: string): void {
    const consumed = this.processCharacters(chordsLine, lyricsLine);
    if (!this.chordLyricsPair) return;
    this.chordLyricsPair.lyrics += lyricsLine.substring(consumed);
    this.chordLyricsPair.chords = this.chordLyricsPair.chords.trim();
    // Upstream appends pending "x3" repeat notation here; not in the .d.ts.
    (this as unknown as { applyRepeatNotation(): void }).applyRepeatNotation();
  }
}

function looksLikeChordPro(text: string): boolean {
  // Directives like {title: ...} / {start_of_verse} / {soc}
  if (/^\s*\{[a-z_]+(?::[^}]*)?\}\s*$/im.test(text)) return true;
  // An inline bracketed chord glued to lyric text: [G]Hello
  return /\[[A-G](?:#|b)?[a-z0-9]*\][a-zA-Z]/.test(text);
}

/* ---------------------------------------------------------------- */

/** Parse one "| Am . . . | F G |" line into bars with beat counts. */
function parsePipeLine(text: string, beatsPerBar: number): Bar[] {
  const bars: Bar[] = [];
  for (const seg of text.split("|")) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    if (toks.length === 0) continue;
    const cells: Bar["chords"] = [];
    let repeat = false;
    for (const tok of toks) {
      if (isChordToken(tok)) {
        cells.push({ sym: tok, beats: 1 });
      } else if (tok === "%" || tok === "𝄎") {
        repeat = true;
      } else if (/^[.\-/]+$/.test(tok) && cells.length > 0) {
        cells[cells.length - 1].beats += tok.length;
      }
    }
    if (cells.length === 0) {
      // "| % |" or "| . . |": repeat the previous bar's chords.
      const prev = bars[bars.length - 1];
      if (repeat || prev) {
        bars.push({
          chords: (prev?.chords ?? [{ sym: "", beats: beatsPerBar }]).map(
            (c) => ({ ...c })
          ),
        });
      }
      continue;
    }
    // Keep dot-derived beats when they add up; otherwise split evenly.
    const total = cells.reduce((n, c) => n + c.beats, 0);
    if (total !== beatsPerBar) {
      const per = Math.max(1, Math.floor(beatsPerBar / cells.length));
      let left = beatsPerBar;
      cells.forEach((c, i) => {
        c.beats = i === cells.length - 1 ? Math.max(1, left) : per;
        left -= per;
      });
    }
    bars.push({ chords: cells });
  }
  return bars;
}

/** Map a section label to a stable accent color. */
function colorFor(label: string, index: number): string {
  const l = label.toLowerCase();
  if (l.includes("chorus") && l.includes("pre")) return "teal";
  if (l.includes("chorus")) return "amber";
  if (l.includes("verse")) return "blue";
  if (l.includes("bridge")) return "purple";
  if (l.includes("intro") || l.includes("outro") || l.includes("end"))
    return "slate";
  if (l.includes("solo") || l.includes("instrumental")) return "rose";
  if (l.includes("interlude")) return "teal";
  return SECTION_COLOR_NAMES[index % SECTION_COLOR_NAMES.length];
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/* ---------------------------------------------------------------- */

interface PendingSection {
  label: string;
  lines: Line[];
}

class Builder {
  sections: Record<string, SectionDef> = {};
  arrangement: ArrangementItem[] = [];
  private current: PendingSection | null = null;
  private idCounts = new Map<string, number>();
  private firstIdByLabel = new Map<string, string>();

  constructor(private beatsPerBar: number) {}

  startSection(label: string) {
    this.flush();
    this.current = { label, lines: [] };
  }

  addLine(line: Line) {
    if (!this.current) {
      // Content before any header: start an implicit leading section.
      this.current = { label: "Intro", lines: [] };
    }
    this.current.lines.push(line);
  }

  /** Commit the in-progress section to sections + arrangement. */
  flush() {
    const pending = this.current;
    this.current = null;
    if (!pending) return;

    const labelKey = pending.label.toLowerCase();
    const existingId = this.firstIdByLabel.get(labelKey);

    // A bare repeated header ("[Chorus]" with nothing under it) is a
    // re-reference to the earlier section, not a new one.
    if (pending.lines.length === 0 && existingId) {
      this.arrangement.push({ ref: existingId, instanceLabel: pending.label });
      return;
    }

    const slug = slugify(pending.label);
    const n = (this.idCounts.get(slug) ?? 0) + 1;
    this.idCounts.set(slug, n);
    const id = n === 1 ? slug : `${slug}-${n}`;

    this.sections[id] = {
      label: pending.label,
      color: colorFor(pending.label, Object.keys(this.sections).length),
      lines:
        pending.lines.length > 0
          ? pending.lines
          : [
              {
                bars: Array.from({ length: 4 }, () => ({
                  chords: [{ sym: "", beats: this.beatsPerBar }],
                })),
                lyrics: [],
              },
            ],
    };
    if (!this.firstIdByLabel.has(labelKey)) {
      this.firstIdByLabel.set(labelKey, id);
    }
    this.arrangement.push({ ref: id, instanceLabel: pending.label });
  }
}

/* ---------------------------------------------------------------- */

/** Most likely key, from chord frequency with first/last-chord tie-breaks. */
function guessKeyFromData(data: SongData): string | undefined {
  const syms: string[] = [];
  for (const item of data.arrangement) {
    const def = data.sections[item.ref];
    if (!def) continue;
    for (const line of def.lines) {
      for (const bar of line.bars) {
        for (const c of bar.chords) {
          if (c.sym.trim() && c.sym !== "N.C.") syms.push(c.sym.trim());
        }
      }
    }
  }
  if (syms.length === 0) return undefined;

  const keyOf = (sym: string): string | null => {
    const m = sym.match(/^([A-G](?:#|b)?)(m(?!aj))?/);
    return m ? m[1] + (m[2] ? "m" : "") : null;
  };
  const counts = new Map<string, number>();
  for (const s of syms) {
    const k = keyOf(s);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const first = keyOf(syms[0]);
  const last = keyOf(syms[syms.length - 1]);
  // Songs overwhelmingly end (and usually start) on the tonic.
  if (last && first === last) return last;
  const score = (k: string | null) => (k ? counts.get(k) ?? 0 : -1);
  if (score(last) >= score(first)) return last ?? undefined;
  return first ?? undefined;
}

/* ---------------------------------------------------------------- */

export function importChordSheet(
  text: string,
  beatsPerBar = 4
): ChordSheetImport {
  const normalized = text.replace(/\r\n?/g, "\n");
  const chordpro = looksLikeChordPro(normalized);
  const warnings: string[] = [];

  let song;
  try {
    song = chordpro
      ? new ChordProParser().parse(normalized)
      : new SpacePreservingUGParser({ preserveWhitespace: false }).parse(
          normalized
        );
  } catch (e) {
    return {
      data: { sections: {}, arrangement: [] },
      format: chordpro ? "chordpro" : "ultimate-guitar",
      warnings: [
        `Could not parse the pasted text: ${
          e instanceof Error ? e.message : String(e)
        }`,
      ],
    };
  }

  const builder = new Builder(beatsPerBar);
  let skippedTabLines = 0;

  for (const line of song.lines) {
    const pairs: ChordLyricsPair[] = [];
    let handled = false;

    for (const item of line.items) {
      if (item instanceof Tag) {
        const name = String(item.name);
        if (name.startsWith("start_of_")) {
          const kind = name.slice("start_of_".length);
          const label =
            item.value?.trim() ||
            kind.charAt(0).toUpperCase() + kind.slice(1);
          builder.startSection(label);
          handled = true;
        }
        // end_of_* / metadata tags need no action: metadata is read off the
        // Song object below, and sections close when the next one starts.
      } else if (item instanceof ChordLyricsPair) {
        pairs.push(item);
      }
    }
    if (handled) continue;

    // A tab string like "B|---0---|" parses as a "chord" (B is a chord
    // letter), so only syms that look like chords count.
    const hasChords = pairs.some((p) => isChordToken(p.chords.trim()));
    const lyricText = pairs
      .map((p) => p.lyrics ?? "")
      .join("")
      .trim();

    if (!hasChords) {
      const raw = pairs
        .map((p) => `${p.chords ?? ""}${p.lyrics ?? ""}`)
        .join("")
        .trim();
      if (!raw) continue;
      if (TAB_LINE_RE.test(raw)) {
        skippedTabLines++;
        continue;
      }
      if (!lyricText) continue;
      if (PIPE_LINE_RE.test(lyricText)) {
        const bars = parsePipeLine(lyricText, beatsPerBar);
        if (bars.length > 0) {
          builder.addLine({ bars, lyrics: [] });
          continue;
        }
      }
      // Pure lyric line: one open bar carrying the phrase (chord rings on).
      builder.addLine({
        bars: [{ chords: [{ sym: "", beats: beatsPerBar }] }],
        lyrics: [{ text: lyricText, bar: 0 }],
      });
      continue;
    }

    // Chord line (with or without lyrics): each chord starts a bar; the
    // lyric chunk under it becomes the bar's phrase. Chunks with no chord
    // (text before the first chord, or between chords in ChordPro) attach
    // to the neighboring bar.
    const bars: Bar[] = [];
    const lyricByBar: string[] = [];
    let leading = "";
    for (const p of pairs) {
      const sym = p.chords.trim();
      const lyr = p.lyrics ?? "";
      if (sym && isChordToken(sym)) {
        bars.push({ chords: [{ sym, beats: beatsPerBar }] });
        lyricByBar.push(leading + lyr);
        leading = "";
      } else if (bars.length > 0) {
        // Empty or unrecognizable "chord": keep its text with the last bar.
        lyricByBar[lyricByBar.length - 1] += (sym ? `${sym} ` : "") + lyr;
      } else {
        leading += (sym ? `${sym} ` : "") + lyr;
      }
    }
    // A chord change mid-word splits the word across chunks ("phr" | "ase
    // here"); keep the whole word with the bar where it starts.
    for (let i = 0; i < lyricByBar.length - 1; i++) {
      if (/\S$/.test(lyricByBar[i]) && /^\S/.test(lyricByBar[i + 1])) {
        const m = lyricByBar[i + 1].match(/^(\S+)([\s\S]*)$/);
        if (m) {
          lyricByBar[i] += m[1];
          lyricByBar[i + 1] = m[2];
        }
      }
    }
    const lyrics = lyricByBar
      .map((t, i) => ({ text: t.replace(/\s+/g, " ").trim(), bar: i }))
      .filter((s) => s.text);
    builder.addLine({ bars, lyrics });
  }
  builder.flush();

  if (skippedTabLines > 0) {
    warnings.push(
      `Skipped ${skippedTabLines} guitar-tab line${
        skippedTabLines === 1 ? "" : "s"
      } (tab can't be mapped to bars).`
    );
  }
  const data: SongData = {
    sections: builder.sections,
    arrangement: builder.arrangement,
  };

  if (data.arrangement.length === 0) {
    warnings.push(
      "No chords or sections were recognized. Paste an Ultimate Guitar-style sheet (chords above lyrics) or ChordPro text."
    );
  } else if (Object.keys(data.sections).length === 1 && !chordpro) {
    const only = data.sections[data.arrangement[0].ref];
    if (only?.label === "Intro") {
      // Everything landed in the implicit leading section.
      only.label = "Song";
      data.arrangement[0].instanceLabel = "Song";
      warnings.push(
        "No [Verse]/[Chorus] headers found — everything was imported into one section. Split it up in the editor."
      );
    }
  }

  // chordsheetjs metadata values can be string | string[].
  const meta = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  return {
    data,
    format: chordpro ? "chordpro" : "ultimate-guitar",
    title: meta(song.title),
    artist: meta(song.artist),
    key: meta(song.key),
    guessedKey: guessKeyFromData(data),
    warnings,
  };
}
