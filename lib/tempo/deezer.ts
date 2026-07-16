/**
 * Pure helpers for looking a song's BPM up on Deezer's public API (no auth
 * required). No I/O here — URL building and response parsing only, so it can
 * be unit-tested against fixtures; the server action does the fetching.
 *
 * Deezer's bpm comes from audio analysis: it's 0 when unknown and sometimes
 * halved/doubled, so callers should treat it as a suggestion the user
 * confirms, never something to write silently.
 */

export interface DeezerMatch {
  id: number;
  title: string;
  artist: string;
}

/** Search URL for an artist + title, quoted so Deezer matches the fields. */
export function deezerSearchUrl(artist: string, title: string): string {
  const q = [
    artist.trim() && `artist:"${artist.trim()}"`,
    title.trim() && `track:"${title.trim()}"`,
  ]
    .filter(Boolean)
    .join(" ");
  return `https://api.deezer.com/search?q=${encodeURIComponent(q)}`;
}

export function deezerTrackUrl(id: number): string {
  return `https://api.deezer.com/track/${id}`;
}

/** First track of a search response, or null when nothing matched. */
export function parseSearchMatch(json: unknown): DeezerMatch | null {
  if (typeof json !== "object" || json === null) return null;
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const t = data[0] as {
    id?: unknown;
    title?: unknown;
    artist?: { name?: unknown };
  };
  if (typeof t.id !== "number" || typeof t.title !== "string") return null;
  return {
    id: t.id,
    title: t.title,
    artist: typeof t.artist?.name === "string" ? t.artist.name : "",
  };
}

/** The bpm of a track response; null when absent/unset (Deezer uses 0). */
export function parseTrackBpm(json: unknown): number | null {
  if (typeof json !== "object" || json === null) return null;
  const bpm = (json as { bpm?: unknown }).bpm;
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) return null;
  return Math.round(bpm);
}
