import { type NextRequest, NextResponse } from "next/server";
import {
  authorizeUrl,
  codeChallenge,
  randomVerifier,
  safeNext,
} from "@/lib/spotify/auth";
import { isSpotifyConfigured, SPOTIFY_CLIENT_ID } from "@/lib/spotify/env";

/**
 * Starts the Spotify PKCE flow: stashes the verifier/state/return-path in
 * short-lived cookies and bounces to Spotify's consent page. The callback
 * route finishes the exchange.
 */
export async function GET(request: NextRequest) {
  if (!isSpotifyConfigured) {
    return NextResponse.json(
      { error: "Spotify is not configured (NEXT_PUBLIC_SPOTIFY_CLIENT_ID)." },
      { status: 503 }
    );
  }

  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const verifier = randomVerifier();
  const state = randomVerifier();
  const redirectUri = new URL("/api/spotify/callback", request.nextUrl.origin)
    .toString();

  const res = NextResponse.redirect(
    authorizeUrl({
      clientId: SPOTIFY_CLIENT_ID,
      redirectUri,
      state,
      challenge: await codeChallenge(verifier),
    })
  );
  // sameSite lax: still sent on Spotify's top-level redirect back to us.
  const tmp = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/spotify",
    maxAge: 600,
  };
  res.cookies.set("sp_verifier", verifier, tmp);
  res.cookies.set("sp_state", state, tmp);
  res.cookies.set("sp_next", next, tmp);
  return res;
}
