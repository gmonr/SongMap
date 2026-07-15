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
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const timedOut =
      e instanceof DOMException &&
      (e.name === "TimeoutError" || e.name === "AbortError");
    throw new UGFetchError(
      timedOut ? "the request timed out" : "the connection failed"
    );
  }
  if (!res.ok) {
    throw new UGFetchError(
      res.status === 403
        ? "they returned 403, blocking this server"
        : `they returned HTTP ${res.status}`
    );
  }
  return res.text();
}
