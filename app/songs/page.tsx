import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_SONG } from "@/lib/song/demo";
import { createSong } from "./actions";

interface SongListItem {
  id: string;
  title: string;
  artist: string | null;
  key: string | null;
  updated_at?: string | null;
}

function SongCard({
  song,
  badge,
}: {
  song: SongListItem;
  badge?: string;
}) {
  return (
    <Link
      href={`/songs/${song.id}`}
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-300 hover:shadow"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold">{song.title}</p>
        <p className="truncate text-sm text-slate-500">
          {song.artist ?? "—"}
        </p>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        {badge && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {badge}
          </span>
        )}
        {song.key && (
          <span className="rounded-md bg-blue-50 px-2 py-1 text-sm font-bold text-blue-700">
            {song.key}
          </span>
        )}
      </div>
    </Link>
  );
}

export default async function SongsPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Demo mode.</strong> Supabase isn&apos;t configured, so songs
          can&apos;t be saved. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code>, add your project keys, and run the migration
          in <code>supabase/migrations/</code> to enable your library.
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Library</h1>
          <Link
            href="/songs/import"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Import
          </Link>
        </div>
        <SongCard song={DEMO_SONG} badge="demo" />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: songs, error } = await supabase
    .from("songs")
    .select("id, title, artist, key, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Could not load songs: {error.message}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Library</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/songs/import"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Import
          </Link>
          <form action={createSong}>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + New song
            </button>
          </form>
        </div>
      </div>

      {songs.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No songs yet. Create one, or open the{" "}
          <Link href="/songs/demo" className="text-blue-600 hover:underline">
            demo song
          </Link>{" "}
          to see how a song map reads.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {songs.map((s) => (
            <SongCard key={s.id} song={s} />
          ))}
        </div>
      )}
    </div>
  );
}
