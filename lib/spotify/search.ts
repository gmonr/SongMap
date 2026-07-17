/**
 * Pure helpers for finding a song's track on Spotify — URL building and
 * response parsing only, unit-testable against fixtures (the deezer.ts
 * pattern). The fetch happens client-side with the user's access token:
 * PKCE apps have no client secret, so there is no app-only token a server
 * action could use.
 *
 * Matches are suggestions the user confirms, never auto-linked — covers and
 * re-recordings abound and the linked recording is what anchors calibrate.
 */
import type { SpotifyTrackMeta } from "./sync";

export interface SpotifyTrackResult {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  /** Smallest album image, for the picker list. */
  albumArtUrl?: string;
}

const SEARCH_BASE = "https://api.spotify.com/v1/search";

/** Field-filtered search for an artist + title. */
export function searchTracksUrl(artist: string, title: string): string {
  const q = [
    artist.trim() && `artist:"${artist.trim()}"`,
    title.trim() && `track:"${title.trim()}"`,
  ]
    .filter(Boolean)
    .join(" ");
  return rawSearchUrl(q);
}

/** Free-text search, for when the field-filtered guess misses. */
export function rawSearchUrl(query: string): string {
  const q = new URLSearchParams({ q: query, type: "track", limit: "5" });
  return `${SEARCH_BASE}?${q}`;
}

/** Tracks of a search response; [] when malformed or empty. */
export function parseSearchTracks(json: unknown): SpotifyTrackResult[] {
  if (typeof json !== "object" || json === null) return [];
  const items = (json as { tracks?: { items?: unknown } }).tracks?.items;
  if (!Array.isArray(items)) return [];

  const out: SpotifyTrackResult[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as {
      id?: unknown;
      name?: unknown;
      duration_ms?: unknown;
      artists?: unknown;
      album?: { images?: unknown };
    };
    if (
      typeof t.id !== "string" ||
      typeof t.name !== "string" ||
      typeof t.duration_ms !== "number"
    ) {
      continue;
    }
    const artists = Array.isArray(t.artists)
      ? t.artists
          .map((a) => (a as { name?: unknown }).name)
          .filter((n): n is string => typeof n === "string")
          .join(", ")
      : "";
    const images = Array.isArray(t.album?.images) ? t.album.images : [];
    const smallest = images[images.length - 1] as
      | { url?: unknown }
      | undefined;
    out.push({
      id: t.id,
      title: t.name,
      artist: artists,
      durationMs: Math.round(t.duration_ms),
      albumArtUrl:
        typeof smallest?.url === "string" ? smallest.url : undefined,
    });
  }
  return out;
}

export function trackMetaOf(result: SpotifyTrackResult): SpotifyTrackMeta {
  return {
    title: result.title,
    artist: result.artist,
    durationMs: result.durationMs,
  };
}

/** "3:47"-style duration for picker rows and the transport readout. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
