"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveSpotifyLink } from "@/app/songs/spotify-actions";
import {
  formatMs,
  parseSearchTracks,
  rawSearchUrl,
  searchTracksUrl,
  trackMetaOf,
  type SpotifyTrackResult,
} from "@/lib/spotify/search";
import type { SpotifySyncData } from "@/lib/spotify/sync";
import { getAccessToken, invalidateAccessToken } from "@/lib/spotify/token";

/**
 * Links the song to a Spotify track: searches by the song's artist + title
 * (free-text fallback), shows candidates, and saves the one the user picks.
 * A match is never auto-linked — the linked recording is what calibration
 * anchors sync against, so the user confirms it's the right version.
 */
export function SpotifyLinkDialog({
  songId,
  title,
  artist,
  unsaved = false,
  onClose,
  onLinked,
}: {
  songId: string;
  title: string;
  artist: string | null;
  /** Song not persisted yet (e.g. the import live preview) — the picked
   *  link is kept in memory only; saveSpotifyLink is never called, since
   *  songId is a placeholder rather than a real row to point at. */
  unsaved?: boolean;
  onClose: () => void;
  onLinked: (trackId: string, sync: SpotifySyncData) => void;
}) {
  const pathname = usePathname();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrackResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const search = async (rawQuery?: string) => {
    const token = await getAccessToken();
    if (!token) {
      setConnected(false);
      return;
    }
    setConnected(true);
    const seq = ++searchSeq.current;
    setBusy(true);
    setError(null);
    try {
      const fetchTracks = async (url: string) => {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          invalidateAccessToken();
          setConnected(false);
          return null;
        }
        if (!res.ok) throw new Error(`Spotify search failed (${res.status})`);
        return parseSearchTracks(await res.json());
      };

      let tracks = await fetchTracks(
        rawQuery !== undefined
          ? rawSearchUrl(rawQuery)
          : searchTracksUrl(artist ?? "", title)
      );
      // The strict field-filtered guess found nothing: retry free-text.
      if (tracks !== null && tracks.length === 0 && rawQuery === undefined) {
        tracks = await fetchTracks(
          rawSearchUrl(`${title} ${artist ?? ""}`.trim())
        );
      }
      if (seq === searchSeq.current && tracks !== null) setResults(tracks);
    } catch {
      if (seq === searchSeq.current) {
        setError("Couldn't reach Spotify — try again in a moment.");
      }
    } finally {
      if (seq === searchSeq.current) setBusy(false);
    }
  };

  useEffect(() => {
    void search();
    // Run once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (r: SpotifyTrackResult) => {
    setBusy(true);
    setError(null);
    const sync: SpotifySyncData = { track: trackMetaOf(r), anchors: [] };
    if (unsaved) {
      // Preview song: nothing to persist against — the link lives in
      // component state until the song is actually created.
      setBusy(false);
      onLinked(r.id, sync);
      return;
    }
    const saved = await saveSpotifyLink(songId, r.id, sync).catch(() => ({
      ok: false as const,
      error: undefined,
    }));
    setBusy(false);
    if (saved.ok) {
      onLinked(r.id, sync);
    } else {
      setError(saved.error ?? "Couldn't save the link.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Link Spotify track"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h2 className="flex-1 truncate text-base font-bold">
            Link on Spotify
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {unsaved && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            Preview — this link and any calibration won&apos;t be saved until
            you create the song.
          </p>
        )}

        {connected === false ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600">
              Connect your Spotify account to search for “{title}” and play
              the real recording from any bar. Playback control needs Spotify
              Premium.
            </p>
            <a
              href={`/api/spotify/login?next=${encodeURIComponent(pathname)}`}
              className="inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Connect Spotify
            </a>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim()) void search(query.trim());
              }}
            >
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`${title}${artist ? ` ${artist}` : ""}`}
                aria-label="Search Spotify"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={busy || !query.trim()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
              >
                Search
              </button>
            </form>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {busy && <p className="text-sm text-slate-400">Searching…</p>}
            {!busy && results?.length === 0 && (
              <p className="text-sm text-slate-500">
                No matches — try a different search above.
              </p>
            )}

            <ul className="divide-y divide-slate-100">
              {results?.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pick(r)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                  >
                    {/* Album art is decorative; next/image is overkill for
                        a 40px thumbnail from Spotify's CDN. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.albumArtUrl && (
                      <img
                        src={r.albumArtUrl}
                        alt=""
                        className="h-10 w-10 rounded"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {r.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.artist}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-slate-400">
                      {formatMs(r.durationMs)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
