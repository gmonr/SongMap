import { notFound } from "next/navigation";
import { SongMap } from "@/components/song-map/SongMap";
import { DEMO_SONG, DEMO_SONG_ID } from "@/lib/song/demo";
import type { SongRow } from "@/lib/song/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === DEMO_SONG_ID) {
    return <SongMap song={DEMO_SONG} />;
  }

  if (!isSupabaseConfigured) notFound();

  const supabase = await createClient();
  const { data: song } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .single<SongRow>();

  if (!song) notFound();

  return <SongMap song={song} editHref={`/songs/${song.id}/edit`} />;
}
