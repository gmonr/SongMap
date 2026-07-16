"use server";

/**
 * BPM lookup on Deezer's public API, exposed as a server action (their API
 * has no CORS for browsers, and this keeps the fetch on the server like the
 * UG actions). Failures come back as friendly strings rather than throws —
 * thrown server-action errors get redacted to a digest in production.
 */
import {
  deezerSearchUrl,
  deezerTrackUrl,
  parseSearchMatch,
  parseTrackBpm,
} from "@/lib/tempo/deezer";

export interface TempoLookupSuccess {
  ok: true;
  bpm: number;
  /** What Deezer actually matched, so a wrong match is visible in the UI. */
  matchedTitle: string;
  matchedArtist: string;
}
export interface TempoLookupFailure {
  ok: false;
  error: string;
}

const UNREACHABLE = "Couldn't reach Deezer — try again in a moment.";

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function lookupTempo(
  artist: string,
  title: string
): Promise<TempoLookupSuccess | TempoLookupFailure> {
  if (!title.trim()) {
    return { ok: false, error: "Enter a song title to look up." };
  }

  let match;
  try {
    match = parseSearchMatch(await getJson(deezerSearchUrl(artist, title)));
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (!match) {
    return { ok: false, error: "Deezer has no match for this song." };
  }

  let bpm;
  try {
    bpm = parseTrackBpm(await getJson(deezerTrackUrl(match.id)));
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (bpm === null) {
    return {
      ok: false,
      error: `Deezer matched “${match.title}” but has no BPM for it.`,
    };
  }
  return {
    ok: true,
    bpm,
    matchedTitle: match.title,
    matchedArtist: match.artist,
  };
}
