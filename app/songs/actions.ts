"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emptySongData, type SongData } from "@/lib/song/types";

export async function createSong() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("songs")
    .insert({
      title: "Untitled song",
      key: "C",
      time_signature: "4/4",
      data: emptySongData(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create song");
  }

  redirect(`/songs/${data.id}/edit`);
}

export interface ImportedSongInput {
  title: string;
  artist: string | null;
  key: string | null;
  time_signature: string;
  data: SongData;
}

export async function createImportedSong(input: ImportedSongInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (
    typeof input.data !== "object" ||
    input.data === null ||
    typeof input.data.sections !== "object" ||
    !Array.isArray(input.data.arrangement)
  ) {
    throw new Error("Invalid song data");
  }

  const { data, error } = await supabase
    .from("songs")
    .insert({
      title: input.title.trim() || "Untitled song",
      artist: input.artist?.trim() || null,
      key: input.key || "C",
      time_signature: input.time_signature || "4/4",
      data: input.data,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create song");
  }

  revalidatePath("/songs");
  redirect(`/songs/${data.id}`);
}

export async function deleteSong(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("songs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/songs");
  redirect("/songs");
}
