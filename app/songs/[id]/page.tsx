import { notFound } from "next/navigation";
import { SongMap } from "@/components/song-map/SongMap";
import { DEMO_SONG, DEMO_SONG_ID } from "@/lib/song/demo";
import type { SongRow } from "@/lib/song/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function SongPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { id } = await params;
  const { focus } = await searchParams;

  if (id === DEMO_SONG_ID) {
    return (
      <SongMap
        song={DEMO_SONG}
        practiceHref={`/songs/${DEMO_SONG_ID}/practice`}
        focus={focus}
      />
    );
  }

  if (!isSupabaseConfigured) notFound();

  const supabase = await createClient();
  const { data: song } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .single<SongRow>();

  if (!song) notFound();

  return (
    <SongMap
      song={song}
      editHref={`/songs/${song.id}/edit`}
      practiceHref={`/songs/${song.id}/practice`}
      reshapeHref={`/songs/${song.id}/reshape`}
      focus={focus}
    />
  );
}
