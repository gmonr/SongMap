/** The httpOnly cookie holding the Spotify refresh token — shared by the
 *  callback (sets it) and token (reads/rotates/clears it) routes. */
export const REFRESH_COOKIE = "sp_refresh";

/** One year: the refresh token itself doesn't expire, the cookie shouldn't
 *  either in practice. */
const REFRESH_MAX_AGE = 365 * 24 * 60 * 60;

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // Only the token/callback routes ever need it.
    path: "/api/spotify",
    maxAge: REFRESH_MAX_AGE,
  };
}
