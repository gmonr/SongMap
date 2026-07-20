"use server";

/**
 * Synced-lyrics lookup on LRCLIB's public API, exposed as a server action
 * (same shape as the Deezer tempo lookup: the fetch stays server-side and
 * failures come back as friendly strings, since thrown server-action errors
 * get redacted to a digest in production).
 *
 * Privacy note: the lookup sends the title/artist to LRCLIB's public API.
 */
import { parseLrc, type LrcLine } from "@/lib/lyrics-sync/lrc";
import {
  lrclibGetUrl,
  lrclibSearchUrl,
  parseLrclibSearch,
  parseLrclibTrack,
  pickLrclibMatch,
  type LrclibTrack,
} from "@/lib/lyrics-sync/lrclib";

export interface LyricsLookupSuccess {
  ok: true;
  /** What LRCLIB actually matched, so a wrong match is visible in the UI. */
  matchedTitle: string;
  matchedArtist: string;
  durationSec: number | null;
  /** Parsed line-level timestamps, sorted by time. */
  lines: LrcLine[];
}
export interface LyricsLookupFailure {
  ok: false;
  error: string;
}
export type LyricsLookupResult = LyricsLookupSuccess | LyricsLookupFailure;

const UNREACHABLE = "Couldn't reach LRCLIB — try again in a moment.";

async function getJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
    headers: {
      // LRCLIB asks clients to identify themselves.
      "User-Agent": "SongMap/0.1 (personal practice app)",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function lookupSyncedLyrics(
  artist: string,
  title: string,
  durationMs?: number | null
): Promise<LyricsLookupResult> {
  if (!title.trim()) {
    return { ok: false, error: "Enter a song title to look up." };
  }
  const durationSec =
    durationMs != null && Number.isFinite(durationMs) && durationMs > 0
      ? durationMs / 1000
      : null;

  // Exact signature first when the recording's duration is known (linked
  // Spotify track), then the fuzzy search.
  let match: LrclibTrack | null = null;
  try {
    if (durationSec !== null && artist.trim()) {
      match = parseLrclibTrack(
        await getJson(lrclibGetUrl(artist, title, durationSec))
      );
    }
    if (!match || match.instrumental || !match.syncedLyrics) {
      match = pickLrclibMatch(
        parseLrclibSearch(await getJson(lrclibSearchUrl(artist, title))),
        artist,
        title,
        durationSec
      );
    }
  } catch {
    return { ok: false, error: UNREACHABLE };
  }

  if (!match) {
    return { ok: false, error: "LRCLIB has no synced lyrics for this song." };
  }
  if (match.instrumental) {
    return {
      ok: false,
      error: `LRCLIB lists “${match.trackName}” as an instrumental.`,
    };
  }
  const lines = parseLrc(match.syncedLyrics);
  if (lines.length === 0) {
    return {
      ok: false,
      error: `LRCLIB matched “${match.trackName}” but has no synced (timed) lyrics for it.`,
    };
  }
  return {
    ok: true,
    matchedTitle: match.trackName,
    matchedArtist: match.artistName,
    durationSec: match.duration,
    lines,
  };
}
