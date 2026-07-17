import { type NextRequest, NextResponse } from "next/server";
import {
  codeExchangeBody,
  parseTokenResponse,
  safeNext,
  SPOTIFY_TOKEN_URL,
} from "@/lib/spotify/auth";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/spotify/cookies";
import { SPOTIFY_CLIENT_ID } from "@/lib/spotify/env";

/**
 * Spotify PKCE callback: verifies state, exchanges the code (verifier, no
 * client secret), stores the refresh token in an httpOnly cookie, and
 * returns to the page that started the flow. The access token is never
 * persisted — the client fetches it from /api/spotify/token as needed.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(request.cookies.get("sp_next")?.value);
  const back = (result: "connected" | "error") => {
    const url = new URL(next, request.nextUrl.origin);
    url.searchParams.set("spotify", result);
    const res = NextResponse.redirect(url);
    for (const name of ["sp_verifier", "sp_state", "sp_next"]) {
      res.cookies.delete({ name, path: "/api/spotify" });
    }
    return res;
  };

  const code = params.get("code");
  const state = params.get("state");
  const verifier = request.cookies.get("sp_verifier")?.value;
  const expectedState = request.cookies.get("sp_state")?.value;
  if (
    !code ||
    !verifier ||
    !state ||
    !expectedState ||
    state !== expectedState
  ) {
    return back("error");
  }

  let tokens;
  try {
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: codeExchangeBody({
        clientId: SPOTIFY_CLIENT_ID,
        code,
        redirectUri: new URL(
          "/api/spotify/callback",
          request.nextUrl.origin
        ).toString(),
        verifier,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    tokens = res.ok ? parseTokenResponse(await res.json()) : null;
  } catch {
    tokens = null;
  }
  if (!tokens?.refreshToken) return back("error");

  const res = back("connected");
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
  return res;
}
