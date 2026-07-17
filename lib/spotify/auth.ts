/**
 * Pure helpers for Spotify's Authorization Code + PKCE flow (the
 * public-client flow: no client secret exists anywhere). URL building,
 * PKCE codes, and token-response parsing only — the route handlers under
 * app/api/spotify/ do the redirects, cookies, and fetching.
 */

export const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

/** Controlling playback + reading position; nothing else is needed. */
export const SPOTIFY_SCOPES =
  "user-read-playback-state user-modify-playback-state";

/** RFC 4648 base64url without padding, as PKCE requires. */
export function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh high-entropy PKCE code verifier (also reused for `state`). */
export function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** S256 code challenge for a verifier (RFC 7636 §4.2). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64Url(new Uint8Array(digest));
}

export function authorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge_method: "S256",
    code_challenge: params.challenge,
  });
  return `${SPOTIFY_AUTHORIZE_URL}?${q}`;
}

/** Form body for exchanging the authorization code (PKCE: verifier, no secret). */
export function codeExchangeBody(params: {
  clientId: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.verifier,
  });
}

/** Form body for the refresh grant. */
export function refreshBody(params: {
  clientId: string;
  refreshToken: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
}

export interface SpotifyTokens {
  accessToken: string;
  /** Absent on refresh responses unless Spotify rotates the token. */
  refreshToken?: string;
  /** Seconds until the access token expires (Spotify uses 3600). */
  expiresIn: number;
}

/** Parse a token-endpoint response; null when malformed/denied. */
export function parseTokenResponse(json: unknown): SpotifyTokens | null {
  if (typeof json !== "object" || json === null) return null;
  const t = json as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof t.access_token !== "string" || !t.access_token) return null;
  return {
    accessToken: t.access_token,
    refreshToken:
      typeof t.refresh_token === "string" && t.refresh_token
        ? t.refresh_token
        : undefined,
    expiresIn:
      typeof t.expires_in === "number" && Number.isFinite(t.expires_in)
        ? t.expires_in
        : 3600,
  };
}

/**
 * Sanitize a post-auth return path: same-site absolute paths only, so the
 * `next` param can't become an open redirect.
 */
export function safeNext(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/songs";
}
