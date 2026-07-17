/**
 * Client-side access-token cache. The refresh token lives in an httpOnly
 * cookie only the /api/spotify routes can read; the short-lived access
 * token stays in memory here (never storage) and is re-minted just before
 * expiry so components can call api.spotify.com directly.
 */

let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string | null> | null = null;

/** A valid access token, or null when Spotify isn't connected. */
export async function getAccessToken(): Promise<string | null> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  // Collapse concurrent callers (poll + a tap) into one refresh request.
  inFlight ??= (async () => {
    try {
      const res = await fetch("/api/spotify/token");
      if (!res.ok) return null;
      const json = (await res.json()) as {
        accessToken?: string;
        expiresIn?: number;
      };
      if (!json.accessToken) return null;
      cached = {
        token: json.accessToken,
        expiresAt: Date.now() + (json.expiresIn ?? 3600) * 1000,
      };
      return cached.token;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Drop the cache (e.g. after a 401 from the API). */
export function invalidateAccessToken() {
  cached = null;
}

/** Forget the refresh cookie server-side and the cached token here. */
export async function disconnectSpotify(): Promise<void> {
  cached = null;
  try {
    await fetch("/api/spotify/token", { method: "DELETE" });
  } catch {
    // Cookie deletion failing is harmless; the next token call will 401.
  }
}
