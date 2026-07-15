/**
 * Outbound HTTP to Ultimate Guitar. Server-side only (UG has no CORS headers,
 * so the browser can't fetch it) — imported exclusively from server actions.
 *
 * UG bot-blocks many hosting providers' IP ranges with a 403, so fetching is
 * an attempt chain: direct first, then relays. A custom relay can be set via
 * the UG_PROXY_TEMPLATE env var (e.g. a scraping API — see README); without
 * one, a few free public fetch services are tried in order. A response only
 * counts as success if it actually contains UG's js-store payload — relays
 * love to return 200 with their own error page.
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

/* ---------------------------------------------------------------- */

/** Fill a relay URL template: {url} is URI-encoded, {rawUrl} verbatim. */
export function buildRelayUrl(template: string, targetUrl: string): string {
  return template
    .replace("{url}", encodeURIComponent(targetUrl))
    .replace("{rawUrl}", targetUrl);
}

/** Every real UG page (and nothing a relay invents) carries the js-store
 *  data div; its presence is the acceptance test for a fetch attempt. */
export function looksLikeUgPage(html: string): boolean {
  return html.includes("js-store");
}

interface Relay {
  template: string;
  headers?: Record<string, string>;
}

/** Free public fetchers, tried in order when UG blocks us directly and no
 *  UG_PROXY_TEMPLATE is configured. jina renders pages in a headless
 *  browser (best odds against bot-blocking, keyless tier rate-limited);
 *  the others are plain fetchers from different IP ranges. */
const FREE_RELAYS: Relay[] = [
  {
    template: "https://r.jina.ai/{rawUrl}",
    headers: { "X-Return-Format": "html" },
  },
  { template: "https://api.allorigins.win/raw?url={url}" },
  { template: "https://api.codetabs.com/v1/proxy?quest={url}" },
];

/* ---------------------------------------------------------------- */

/** One GET; returns the body when ok + recognizably a UG page, else throws. */
async function attempt(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
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
  const html = await res.text();
  if (!looksLikeUgPage(html)) {
    throw new UGFetchError("the response was not an Ultimate Guitar page");
  }
  return html;
}

/**
 * GET a UG page as text, falling back to relays when blocked. Only UG hosts
 * are allowed as targets — tab URLs echo back from the client, and this must
 * not become a generic proxy.
 */
export async function fetchUgPage(url: string): Promise<string> {
  if (!isUltimateGuitarUrl(url)) {
    throw new UGFetchError("not an Ultimate Guitar URL");
  }

  let directError: UGFetchError;
  try {
    return await attempt(
      url,
      {
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
      10_000
    );
  } catch (e) {
    directError =
      e instanceof UGFetchError ? e : new UGFetchError("the request failed");
  }

  const custom = process.env.UG_PROXY_TEMPLATE?.trim();
  const relays: Relay[] = custom ? [{ template: custom }] : FREE_RELAYS;

  for (const relay of relays) {
    try {
      // Relays fetch (and sometimes render) the page themselves — slower
      // than a direct hit, hence the longer timeout.
      return await attempt(
        buildRelayUrl(relay.template, url),
        relay.headers ?? {},
        20_000
      );
    } catch {
      // Try the next relay; the direct error stays the headline.
    }
  }

  throw new UGFetchError(
    `${directError.message}, and the fallback relay${
      relays.length === 1 ? "" : "s"
    } failed too`
  );
}
