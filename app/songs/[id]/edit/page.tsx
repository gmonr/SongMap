import { notFound, redirect } from "next/navigation";
import { SongEditor } from "@/components/editor/SongEditor";
import { DEMO_SONG_ID } from "@/lib/song/demo";
import { normalizeSongData } from "@/lib/song/normalize";
import type { SongRow } from "@/lib/song/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function EditSongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // The bundled demo song is read-only.
  if (id === DEMO_SONG_ID || !isSupabaseConfigured) {
    redirect(`/songs/${id}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: song } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .single<SongRow>();

  if (!song) notFound();
  song.data = normalizeSongData(song.data);

  return <SongEditor song={song} />;
}
