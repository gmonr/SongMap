"use server";

/**
 * Persistence for the Library's completion tracking (status + version
 * label). Small, targeted updates — same shape as spotify-actions.ts —
 * so saving either one can't clobber a concurrent chord edit in `data`.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SongStatus } from "@/lib/song/types";

export interface StatusActionResult {
  ok: boolean;
  error?: string;
}

const VALID_STATUSES: SongStatus[] = ["imported", "in_progress", "verified"];

async function updateSong(
  songId: string,
  patch: Record<string, unknown>
): Promise<StatusActionResult> {
  // Friendly failures rather than throws: thrown server-action errors get
  // redacted to a digest in production (the spotify-actions pattern).
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("songs")
      .update(patch)
      .eq("id", songId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/songs/${songId}`);
    revalidatePath("/songs");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save — is Supabase configured?" };
  }
}

/**
 * Set the song's status directly. Never touches `data`, so this is the
 * one path that can move a song back to 'verified' or 'imported' — the
 * demote-on-edit trigger (0003_add_status.sql) only ever pushes the other
 * way. Marking a song 'verified' is a deliberate user claim ("I checked
 * this against the recording"), not something the app infers.
 */
export async function setSongStatus(
  songId: string,
  status: SongStatus
): Promise<StatusActionResult> {
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  return updateSong(songId, { status });
}

const MAX_VERSION_LABEL_LENGTH = 40;

/** Save the version label; blank collapses to null rather than "". */
export async function setVersionLabel(
  songId: string,
  label: string
): Promise<StatusActionResult> {
  const trimmed = label.trim().slice(0, MAX_VERSION_LABEL_LENGTH);
  return updateSong(songId, { version_label: trimmed || null });
}
