import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_SONG } from "@/lib/song/demo";
import type { SongStatus } from "@/lib/song/types";
import { normalizeStatus, StatusBadge } from "@/components/library/StatusBadge";
import { createSong } from "./actions";

interface SongListItem {
  id: string;
  title: string;
  artist: string | null;
  key: string | null;
  updated_at?: string | null;
  status?: SongStatus | null;
  version_label?: string | null;
  source_url?: string | null;
  // Selected alongside status/version_label for completeness (the status
  // backfill leans on it); not otherwise rendered here.
  created_at?: string | null;
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
        <p className="truncate font-semibold">
          {song.title}
          {song.version_label && (
            <span className="ml-1.5 font-normal text-slate-400">
              · {song.version_label}
            </span>
          )}
        </p>
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
        {/* Real rows always carry a status (column default); the demo card
            doesn't, and shouldn't wear a made-up one. */}
        {song.status && <StatusBadge status={song.status} />}
        {song.key && (
          <span className="rounded-md bg-blue-50 px-2 py-1 text-sm font-bold text-blue-700">
            {song.key}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Collapse whitespace/case so "Foo  Bar" and "foo bar" key the same. */
function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Duplicate key: normalized "title artist". A song with no artist keys on
 * title alone. This is a heuristic, not an identity check — a title that
 * happens to end where an artist name would start could in principle
 * collide, but for a personal library that's an acceptable, rare cost for
 * catching real duplicates (re-imports, alternate arrangements) without
 * any extra bookkeeping.
 */
function duplicateKey(song: SongListItem): string {
  return `${normalizeKeyPart(song.title)} ${normalizeKeyPart(song.artist)}`;
}

type RenderUnit =
  | { kind: "single"; song: SongListItem }
  | { kind: "group"; songs: SongListItem[] };

/** Most-recent updated_at first; undated songs sort last. */
function byRecent(a: SongListItem, b: SongListItem): number {
  return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
}

function byTitle(a: SongListItem, b: SongListItem): number {
  return (
    normalizeKeyPart(a.title).localeCompare(normalizeKeyPart(b.title)) ||
    normalizeKeyPart(a.artist).localeCompare(normalizeKeyPart(b.artist))
  );
}

/**
 * Group songs by duplicateKey, in first-occurrence order of the input
 * array — so pre-sorting `songs` before calling this determines where
 * each group (and its lone songs) lands in the result.
 */
function groupDuplicates(songs: SongListItem[]): RenderUnit[] {
  const groups = new Map<string, SongListItem[]>();
  for (const song of songs) {
    const key = duplicateKey(song);
    const existing = groups.get(key);
    if (existing) existing.push(song);
    else groups.set(key, [song]);
  }
  const seen = new Set<string>();
  const units: RenderUnit[] = [];
  for (const song of songs) {
    const key = duplicateKey(song);
    if (seen.has(key)) continue;
    seen.add(key);
    const members = groups.get(key)!;
    units.push(
      members.length > 1
        ? { kind: "group", songs: [...members].sort(byRecent) }
        : { kind: "single", song: members[0] }
    );
  }
  return units;
}

/** A cluster of >1 song sharing a duplicateKey renders as one bordered block. */
function DuplicateCluster({ songs }: { songs: SongListItem[] }) {
  return (
    <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3 sm:col-span-2">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
          {songs.length} versions
        </span>
        <span className="text-xs text-slate-500">
          same title{songs[0].artist ? " & artist" : ""} — use the version
          label to tell them apart
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {songs.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
    </div>
  );
}

function RenderUnits({ units }: { units: RenderUnit[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {units.map((unit) =>
        unit.kind === "group" ? (
          <DuplicateCluster key={duplicateKey(unit.songs[0])} songs={unit.songs} />
        ) : (
          <SongCard key={unit.song.id} song={unit.song} />
        )
      )}
    </div>
  );
}

type SortMode = "recent" | "status" | "title";

function parseSort(value: string | undefined): SortMode {
  return value === "status" || value === "title" ? value : "recent";
}

/** Server-rendered links styled as a segmented control — no client state. */
function SortControl({ sort }: { sort: SortMode }) {
  const options: { mode: SortMode; label: string }[] = [
    { mode: "recent", label: "Recent" },
    { mode: "status", label: "Status" },
    { mode: "title", label: "Title" },
  ];
  return (
    <nav
      aria-label="Sort library"
      className="flex shrink-0 overflow-hidden rounded-md border border-slate-300"
    >
      {options.map(({ mode, label }, i) => (
        <Link
          key={mode}
          href={mode === "recent" ? "/songs" : `/songs?sort=${mode}`}
          aria-current={sort === mode ? "true" : undefined}
          className={`px-3 py-1.5 text-sm font-semibold ${
            i > 0 ? "border-l border-slate-300" : ""
          } ${
            sort === mode
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

const STATUS_SECTIONS: { status: SongStatus; heading: string }[] = [
  { status: "verified", heading: "Verified" },
  { status: "in_progress", heading: "In progress" },
  { status: "imported", heading: "Imported" },
];

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const sort = parseSort((await searchParams).sort);

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
    .select("id, title, artist, key, status, version_label, source_url, created_at, updated_at")
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
        <>
          <div className="flex justify-end">
            <SortControl sort={sort} />
          </div>

          {sort === "status" ? (
            <StatusGroupedList songs={songs} />
          ) : (
            <RenderUnits
              units={groupDuplicates(
                [...songs].sort(sort === "title" ? byTitle : byRecent)
              )}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Status view: three sections (Verified, In progress, Imported), each
 * internally sorted by recency. A duplicate group can mix statuses across
 * its members — it still renders as one cluster (duplicates must stay
 * visible together), placed in the section for whichever member was
 * edited most recently, since that's the version the user is most likely
 * mid-way through resolving.
 */
function StatusGroupedList({ songs }: { songs: SongListItem[] }) {
  const units = groupDuplicates([...songs].sort(byRecent));

  const unitStatus = (unit: RenderUnit): SongStatus =>
    normalizeStatus(unit.kind === "group" ? unit.songs[0].status : unit.song.status);
  // unit.songs is pre-sorted by byRecent in groupDuplicates, so [0] is the
  // most recently updated member — that's what decides section placement.

  const unitSortDate = (unit: RenderUnit): string =>
    (unit.kind === "group" ? unit.songs[0].updated_at : unit.song.updated_at) ?? "";

  return (
    <div className="space-y-6">
      {STATUS_SECTIONS.map(({ status, heading }) => {
        const sectionUnits = units
          .filter((u) => unitStatus(u) === status)
          .sort((a, b) => unitSortDate(b).localeCompare(unitSortDate(a)));
        if (sectionUnits.length === 0) return null;
        const songCount = sectionUnits.reduce(
          (n, u) => n + (u.kind === "group" ? u.songs.length : 1),
          0
        );
        return (
          <section key={status} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">
              {heading} <span className="text-slate-400">({songCount})</span>
            </h2>
            <RenderUnits units={sectionUnits} />
          </section>
        );
      })}
    </div>
  );
}
