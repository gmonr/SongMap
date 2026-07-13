import { notFound, redirect } from "next/navigation";
import { ReshapeView } from "@/components/reshape/ReshapeView";
import { DEMO_SONG_ID } from "@/lib/song/demo";
import type { SongRow } from "@/lib/song/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function ReshapeSongPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  const initialMode =
    mode === "lyrics" || mode === "chords" ? mode : undefined;

  // The bundled demo song is read-only (reshape saves), like the editor.
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

  return (
    <ReshapeView
      song={song}
      songHref={`/songs/${song.id}`}
      initialMode={initialMode}
    />
  );
}
