/**
 * Pure parsing helpers for Ultimate Guitar pages. No I/O here — everything
 * takes strings/objects so it can be unit-tested against fixtures.
 *
 * UG server-renders its data as one big JSON blob, HTML-entity-encoded into
 * <div class="js-store" data-content="...">. Search pages carry results at
 * store.page.data.results; tab pages carry the sheet at
 * store.page.data.tab_view.wiki_tab.content with [ch]/[tab] markers around
 * chords and chord/lyric blocks. Stripping those markers yields exactly the
 * chords-over-lyrics text that importChordSheet() already parses.
 */

export class UGParseError extends Error {}

/* ---------------------------------------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/**
 * Pull the js-store JSON out of a UG page. The data-content attribute is
 * entity-encoded, so it contains no raw double quotes.
 */
export function extractJsStore(html: string): unknown {
  const m = html.match(/class="js-store"[^>]*\sdata-content="([^"]*)"/);
  if (!m) {
    throw new UGParseError("No js-store data found in the page.");
  }
  try {
    return JSON.parse(decodeEntities(m[1]));
  } catch {
    throw new UGParseError("Could not decode the page data.");
  }
}

/* ---------------------------------------------------------------- */

/** Walk an unknown object down a key path, returning undefined on any miss. */
function get(obj: unknown, ...path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/* ---------------------------------------------------------------- */

export interface UGSearchResult {
  songName: string;
  artistName: string;
  /** Absolute URL of the tab page. */
  tabUrl: string;
  /** Average rating, e.g. 4.83. */
  rating: number;
  votes: number;
  /** UG result type; we only keep "Chords". */
  type: string;
}

/**
 * Map a search page's store to results, keeping only "Chords" entries
 * (dropping Tab / Ukulele / Bass / Pro versions) sorted by votes — UG lists
 * every submitted version of a song, and votes picks the canonical one.
 * Returns [] rather than throwing when the store shape has drifted.
 */
export function parseSearchResults(store: unknown): UGSearchResult[] {
  const raw = get(store, "store", "page", "data", "results");
  if (!Array.isArray(raw)) return [];

  const results: UGSearchResult[] = [];
  for (const item of raw) {
    const type = str(get(item, "type"));
    if (type !== "Chords") continue;
    const songName = str(get(item, "song_name"));
    const tabUrl = str(get(item, "tab_url"));
    if (!songName || !tabUrl || !/^https:\/\//.test(tabUrl)) continue;
    results.push({
      songName,
      artistName: str(get(item, "artist_name")) ?? "",
      tabUrl,
      rating: num(get(item, "rating")) ?? 0,
      votes: num(get(item, "votes")) ?? 0,
      type,
    });
  }
  return results.sort((a, b) => b.votes - a.votes);
}

/* ---------------------------------------------------------------- */

export interface UGTab {
  /** Chords-over-lyrics text with [ch]/[tab] markers stripped. */
  content: string;
  songName?: string;
  artistName?: string;
  /** Key as UG reports it, e.g. "Am". */
  tonality?: string;
  capo?: number;
}

/** Strip UG's [ch]/[tab] markers and normalize newlines. [Verse 1]-style
 *  section headers are left alone — the chord-sheet parser consumes them. */
export function stripUgMarkup(content: string): string {
  return content.replace(/\[\/?(ch|tab)\]/g, "").replace(/\r\n?/g, "\n");
}

/** Read the chord sheet and metadata from a tab page's store. */
export function parseTabPage(store: unknown): UGTab {
  const data = get(store, "store", "page", "data");
  const content = str(get(data, "tab_view", "wiki_tab", "content"));
  if (!content) {
    throw new UGParseError("No chord sheet found on the page.");
  }
  const tab = get(data, "tab");
  return {
    content: stripUgMarkup(content),
    songName: str(get(tab, "song_name")),
    artistName: str(get(tab, "artist_name")),
    tonality: str(get(data, "tab_view", "meta", "tonality")),
    capo: num(get(data, "tab_view", "meta", "capo")),
  };
}

/* ---------------------------------------------------------------- */

/** True for https URLs on ultimate-guitar.com or a subdomain of it. */
export function isUltimateGuitarUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "ultimate-guitar.com" ||
        u.hostname.endsWith(".ultimate-guitar.com"))
    );
  } catch {
    return false;
  }
}
