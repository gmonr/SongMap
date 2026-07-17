"use server";

/**
 * Persistence for the Spotify verification mode. Searching happens
 * client-side with the user's token (see lib/spotify/search.ts); these
 * actions only write the link and sync state. They deliberately touch only
 * the spotify_* columns — never `data` — so saving an anchor can't clobber
 * concurrent chord edits.
 */
import { revalidatePath } from "next/cache";
import { normalizeSync, type SpotifySyncData } from "@/lib/spotify/sync";
import { createClient } from "@/lib/supabase/server";

export interface SpotifyActionResult {
  ok: boolean;
  error?: string;
}

/** Bare Spotify track ids are base62. */
const TRACK_ID_RE = /^[A-Za-z0-9]{1,64}$/;

async function updateSong(
  songId: string,
  patch: Record<string, unknown>
): Promise<SpotifyActionResult> {
  // Friendly failures rather than throws: thrown server-action errors get
  // redacted to a digest in production (the tempo-actions pattern).
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("songs")
      .update(patch)
      .eq("id", songId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/songs/${songId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save — is Supabase configured?" };
  }
}

/** Link a track; anchors reset — they calibrate one specific recording. */
export async function saveSpotifyLink(
  songId: string,
  trackId: string,
  sync: SpotifySyncData
): Promise<SpotifyActionResult> {
  if (!TRACK_ID_RE.test(trackId)) {
    return { ok: false, error: "Invalid track id" };
  }
  return updateSong(songId, {
    spotify_track_id: trackId,
    spotify_sync: { ...normalizeSync(sync), anchors: [] },
  });
}

export async function clearSpotifyLink(
  songId: string
): Promise<SpotifyActionResult> {
  return updateSong(songId, { spotify_track_id: null, spotify_sync: null });
}

/** Save calibration anchors (and cached track meta) for the linked track. */
export async function saveSpotifySync(
  songId: string,
  sync: SpotifySyncData
): Promise<SpotifyActionResult> {
  return updateSong(songId, { spotify_sync: normalizeSync(sync) });
}
