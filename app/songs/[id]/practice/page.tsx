import { notFound } from "next/navigation";
import { PracticeView } from "@/components/practice/PracticeView";
import { DEMO_SONG, DEMO_SONG_ID } from "@/lib/song/demo";
import { normalizeSongData } from "@/lib/song/normalize";
import type { SongRow } from "@/lib/song/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === DEMO_SONG_ID) {
    return <PracticeView song={DEMO_SONG} songHref={`/songs/${DEMO_SONG_ID}`} />;
  }

  if (!isSupabaseConfigured) notFound();

  const supabase = await createClient();
  const { data: song } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .single<SongRow>();

  if (!song) notFound();
  song.data = normalizeSongData(song.data);

  return <PracticeView song={song} songHref={`/songs/${song.id}`} />;
}
