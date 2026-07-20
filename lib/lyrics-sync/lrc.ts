/**
 * LRC (timed-lyrics) parsing. Pure — no I/O — so it can be unit-tested
 * against fixtures; the server action does the fetching.
 *
 * The format is `[mm:ss.xx] line text`, one or more timestamps per line
 * (a repeated chorus line carries every occurrence's time). An `[offset:±ms]
 * ]` tag shifts all timestamps ("+" plays them earlier, per the de-facto
 * convention). Metadata tags (`[ar:]`, `[ti:]`, …) and enhanced per-word
 * `<mm:ss.xx>` marks are ignored — SongMap consumes line-level times only.
 */

/** One lyric line occurrence: its recording time and its text. */
export interface LrcLine {
  ms: number;
  text: string;
}

const TIMESTAMP = /^\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]\s*$/i;
const WORD_MARK = /<\d+:\d{1,2}(?:[.:]\d{1,3})?>/g;

/** `[mm:ss.f{1,3}]` → milliseconds (1 fraction digit = tenths, 3 = ms). */
function stampMs(min: string, sec: string, frac: string | undefined): number {
  const fracMs =
    frac === undefined
      ? 0
      : parseInt(frac, 10) * [100, 10, 1][frac.length - 1];
  return (parseInt(min, 10) * 60 + parseInt(sec, 10)) * 1000 + fracMs;
}

/**
 * Parse LRC text into line occurrences sorted by time. Lines with no
 * timestamp or no text are dropped; times clamp at 0 after the offset.
 */
export function parseLrc(text: string): LrcLine[] {
  const out: LrcLine[] = [];
  let offset = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const offsetTag = OFFSET_TAG.exec(line);
    if (offsetTag) {
      offset = parseInt(offsetTag[1], 10);
      continue;
    }

    const stamps: number[] = [];
    let rest = line;
    for (;;) {
      const m = TIMESTAMP.exec(rest);
      if (!m) break;
      stamps.push(stampMs(m[1], m[2], m[3]));
      rest = rest.slice(m[0].length);
    }
    if (stamps.length === 0) continue; // metadata tag or plain text

    const lyric = rest.replace(WORD_MARK, "").replace(/\s+/g, " ").trim();
    if (!lyric) continue;
    for (const ms of stamps) out.push({ ms, text: lyric });
  }

  // "+" offset plays lines earlier.
  for (const l of out) l.ms = Math.max(0, l.ms - offset);
  out.sort((a, b) => a.ms - b.ms);
  return out;
}
