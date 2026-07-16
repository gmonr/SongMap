"use client";

import { useState, useTransition } from "react";
import {
  fetchUltimateGuitarTab,
  searchUltimateGuitar,
} from "@/app/songs/ug-actions";
import type { UGSearchResult } from "@/lib/ug/parse";

export interface UGPick {
  text: string;
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  sourceUrl: string;
}

export function UGSearch({ onPick }: { onPick: (tab: UGPick) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UGSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearching] = useTransition();
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [fetching, startFetching] = useTransition();

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setError(null);
    startSearching(async () => {
      const state = await searchUltimateGuitar(query);
      setResults(state.results);
      setError(state.error ?? null);
    });
  };

  const pick = (r: UGSearchResult) => {
    if (fetching) return;
    setError(null);
    setFetchingUrl(r.tabUrl);
    startFetching(async () => {
      const tab = await fetchUltimateGuitarTab(r.tabUrl);
      setFetchingUrl(null);
      if (!tab.ok) {
        setError(tab.error);
        return;
      }
      setResults(null);
      onPick({
        text: tab.text,
        title: tab.title,
        artist: tab.artist,
        key: tab.key,
        capo: tab.capo,
        tempo: tab.tempo,
        sourceUrl: tab.sourceUrl,
      });
    });
  };

  return (
    <div className="mb-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Ultimate Guitar — song title or artist…"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          aria-label="Search Ultimate Guitar"
        />
        <button
          type="submit"
          disabled={!query.trim() || searching}
          className="shrink-0 rounded-md bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      {results && results.length === 0 && !error && (
        <p className="mt-2 text-sm text-slate-500">
          No chord sheets found — try a different spelling, or paste one below.
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
          {results.slice(0, 10).map((r) => (
            <li key={r.tabUrl}>
              <button
                type="button"
                onClick={() => pick(r)}
                disabled={fetching}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:opacity-50"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{r.songName}</span>
                  {r.artistName && (
                    <span className="text-slate-500"> · {r.artistName}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {fetchingUrl === r.tabUrl
                    ? "Loading…"
                    : `${r.rating.toFixed(1)} ★ · ${r.votes.toLocaleString()} votes`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
