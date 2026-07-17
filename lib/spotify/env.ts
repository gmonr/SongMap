/**
 * Spotify app configuration. Only the client id is needed — the OAuth flow
 * is Authorization Code with PKCE, which is public-client by design (no
 * client secret anywhere). NEXT_PUBLIC_ so the UI can show/hide the Spotify
 * button; the id is not a credential.
 */
export const SPOTIFY_CLIENT_ID =
  process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";

/** When false the Spotify verification mode is hidden entirely. */
export const isSpotifyConfigured = Boolean(SPOTIFY_CLIENT_ID);
