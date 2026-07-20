/**
 * Pure helpers for looking up synced (timed) lyrics on LRCLIB's public API
 * (lrclib.net — free, no auth). No I/O here — URL building, response
 * parsing, and match picking only, so it's testable against fixtures; the
 * server action does the fetching.
 *
 * `/api/get` needs an exact signature (artist + title [+ album + duration
 * in seconds, ±2s]) — ideal when a Spotify track is linked and we know the
 * recording's duration. `/api/search` is the fuzzy fallback.
 */

export interface LrclibTrack {
  id: number;
  trackName: string;
  artistName: string;
  /** Recording length in seconds (LRCLIB's unit). */
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string;
  /** Raw LRC text; empty when LRCLIB only has unsynced lyrics. */
  syncedLyrics: string;
}

const BASE = "https://lrclib.net/api";

export function lrclibGetUrl(
  artist: string,
  title: string,
  durationSec?: number | null
): string {
  const params = new URLSearchParams({
    artist_name: artist.trim(),
    track_name: title.trim(),
  });
  if (durationSec != null && Number.isFinite(durationSec)) {
    params.set("duration", String(Math.round(durationSec)));
  }
  return `${BASE}/get?${params}`;
}

export function lrclibSearchUrl(artist: string, title: string): string {
  const params = new URLSearchParams({ track_name: title.trim() });
  if (artist.trim()) params.set("artist_name", artist.trim());
  return `${BASE}/search?${params}`;
}

/** One track record (the `/get` response shape), or null if malformed. */
export function parseLrclibTrack(json: unknown): LrclibTrack | null {
  if (typeof json !== "object" || json === null) return null;
  const t = json as Record<string, unknown>;
  if (typeof t.id !== "number" || typeof t.trackName !== "string") return null;
  return {
    id: t.id,
    trackName: t.trackName,
    artistName: typeof t.artistName === "string" ? t.artistName : "",
    duration:
      typeof t.duration === "number" && Number.isFinite(t.duration)
        ? t.duration
        : null,
    instrumental: t.instrumental === true,
    plainLyrics: typeof t.plainLyrics === "string" ? t.plainLyrics : "",
    syncedLyrics: typeof t.syncedLyrics === "string" ? t.syncedLyrics : "",
  };
}

/** All well-formed tracks of a `/search` response array. */
export function parseLrclibSearch(json: unknown): LrclibTrack[] {
  if (!Array.isArray(json)) return [];
  const out: LrclibTrack[] = [];
  for (const entry of json) {
    const t = parseLrclibTrack(entry);
    if (t) out.push(t);
  }
  return out;
}

/** Case/diacritic/punctuation-insensitive comparison key. */
function nameKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Best search candidate that actually carries synced lyrics: exact
 * (normalized) title+artist beats title-only, then closeness to the known
 * recording duration breaks ties, then LRCLIB's own ranking (array order).
 */
export function pickLrclibMatch(
  tracks: LrclibTrack[],
  artist: string,
  title: string,
  durationSec?: number | null
): LrclibTrack | null {
  const synced = tracks.filter((t) => !t.instrumental && t.syncedLyrics);
  if (synced.length === 0) return null;

  const titleKey = nameKey(title);
  const artistKey = nameKey(artist);
  const score = (t: LrclibTrack, index: number): number => {
    let s = 0;
    if (nameKey(t.trackName) === titleKey) s += 2;
    if (artistKey && nameKey(t.artistName) === artistKey) s += 2;
    if (
      durationSec != null &&
      t.duration != null &&
      Math.abs(t.duration - durationSec) <= 3
    ) {
      s += 1;
    }
    return s - index / 1000; // stable: earlier results win ties
  };
  let best = synced[0];
  let bestScore = score(best, 0);
  synced.forEach((t, i) => {
    const s = score(t, i);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  });
  return best;
}
