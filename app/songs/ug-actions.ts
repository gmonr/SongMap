"use server";

/**
 * Ultimate Guitar search + tab fetch, exposed as server actions so the
 * importer can call them from the browser (UG itself blocks cross-origin
 * requests). Failures come back as friendly strings rather than throws —
 * thrown server-action errors get redacted to a digest in production.
 */
import {
  fetchUgPage,
  searchUrl,
  MAX_QUERY_LENGTH,
  UGFetchError,
} from "@/lib/ug/fetch";
import {
  extractJsStore,
  parseSearchResults,
  parseTabPage,
  isUltimateGuitarUrl,
  type UGSearchResult,
} from "@/lib/ug/parse";

const FORMAT_CHANGED =
  "Ultimate Guitar changed their page format — paste the sheet manually.";

/** "Couldn't reach ..." with the concrete failure (403 / timeout / ...) so
 *  problems are diagnosable from the UI, not just a generic shrug. */
function unreachable(e: unknown): string {
  const detail = e instanceof UGFetchError ? ` (${e.message})` : "";
  return `Couldn't reach Ultimate Guitar${detail}. Try again, or paste the sheet manually.`;
}

export interface UGSearchState {
  results: UGSearchResult[];
  error?: string;
}

export async function searchUltimateGuitar(
  query: string
): Promise<UGSearchState> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) return { results: [] };

  let html: string;
  try {
    html = await fetchUgPage(searchUrl(q));
  } catch (e) {
    return { results: [], error: unreachable(e) };
  }
  try {
    return { results: parseSearchResults(extractJsStore(html)) };
  } catch {
    return { results: [], error: FORMAT_CHANGED };
  }
}

export interface UGTabSuccess {
  ok: true;
  /** Chord sheet ready for the import textarea. */
  text: string;
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  sourceUrl: string;
}
export interface UGTabFailure {
  ok: false;
  error: string;
}

export async function fetchUltimateGuitarTab(
  tabUrl: string
): Promise<UGTabSuccess | UGTabFailure> {
  if (!isUltimateGuitarUrl(tabUrl)) {
    return { ok: false, error: "That link is not an Ultimate Guitar page." };
  }

  let html: string;
  try {
    html = await fetchUgPage(tabUrl);
  } catch (e) {
    return { ok: false, error: unreachable(e) };
  }
  try {
    const tab = parseTabPage(extractJsStore(html));
    return {
      ok: true,
      text: tab.content,
      title: tab.songName,
      artist: tab.artistName,
      key: tab.tonality,
      capo: tab.capo,
      tempo: tab.tempo,
      sourceUrl: tabUrl,
    };
  } catch {
    return { ok: false, error: FORMAT_CHANGED };
  }
}
