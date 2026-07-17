import { type NextRequest, NextResponse } from "next/server";
import {
  parseTokenResponse,
  refreshBody,
  SPOTIFY_TOKEN_URL,
} from "@/lib/spotify/auth";
import { REFRESH_COOKIE, refreshCookieOptions } from "@/lib/spotify/cookies";
import { SPOTIFY_CLIENT_ID } from "@/lib/spotify/env";

/**
 * Mints a short-lived access token from the refresh-token cookie. The
 * client keeps it in memory only and calls api.spotify.com directly (it
 * supports CORS), so seeks and the playhead poll skip a server hop.
 *
 * 401 means "not connected" — the UI shows the Connect button.
 */
export async function GET(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  let status = 0;
  let tokens = null;
  try {
    const res = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: refreshBody({ clientId: SPOTIFY_CLIENT_ID, refreshToken }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    status = res.status;
    if (res.ok) tokens = parseTokenResponse(await res.json());
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 502 });
  }

  // Revoked/expired grant: drop the dead cookie so the UI re-prompts.
  if (!tokens) {
    const res = NextResponse.json(
      { error: "not_connected" },
      { status: status === 400 || status === 401 ? 401 : 502 }
    );
    if (status === 400 || status === 401) {
      res.cookies.delete({ name: REFRESH_COOKIE, path: "/api/spotify" });
    }
    return res;
  }

  const res = NextResponse.json({
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
  });
  if (tokens.refreshToken) {
    res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
  }
  return res;
}

/** Disconnect: forget the refresh token. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: REFRESH_COOKIE, path: "/api/spotify" });
  return res;
}
