/**
 * Outbound HTTP to Ultimate Guitar. Server-side only (UG has no CORS headers,
 * so the browser can't fetch it) — imported exclusively from server actions.
 */
import { isUltimateGuitarUrl } from "./parse";

export class UGFetchError extends Error {}

/** UG serves an interstitial to obvious bots; look like a normal browser. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export const MAX_QUERY_LENGTH = 200;

export function searchUrl(query: string): string {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  return `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`;
}

/**
 * GET a UG page as text. Only UG hosts are allowed — tab URLs echo back from
 * the client, and this must not become a generic proxy.
 */
export async function fetchUgPage(url: string): Promise<string> {
  if (!isUltimateGuitarUrl(url)) {
    throw new UGFetchError("Not an Ultimate Guitar URL.");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new UGFetchError("Could not reach Ultimate Guitar.");
  }
  if (!res.ok) {
    throw new UGFetchError(`Ultimate Guitar responded with ${res.status}.`);
  }
  return res.text();
}
