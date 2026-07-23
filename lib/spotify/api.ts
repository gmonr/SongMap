/**
 * Thin client-side wrapper over the Spotify Connect Web API endpoints the
 * verification mode needs: list devices, start a track at a position,
 * seek/pause/resume, and read the player state for the playhead poll.
 * Called from the browser with the in-memory access token (Spotify's API
 * supports CORS); no SDK, no DRM — audio comes out of whatever Spotify
 * app/device the user has open.
 */

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

export interface PlayerState {
  positionMs: number;
  durationMs: number | null;
  isPlaying: boolean;
  trackId: string | null;
  deviceId: string | null;
}

/** Machine-readable failure reasons the UI turns into guidance. */
export type SpotifyErrorReason =
  | "NO_ACTIVE_DEVICE"
  | "PREMIUM_REQUIRED"
  | "NOT_CONNECTED"
  | "UNKNOWN";

export class SpotifyApiError extends Error {
  status: number;
  reason: SpotifyErrorReason;

  constructor(status: number, reason: SpotifyErrorReason, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function toError(res: Response): Promise<SpotifyApiError> {
  let message = `Spotify error ${res.status}`;
  let reason: SpotifyErrorReason = "UNKNOWN";
  try {
    const body = (await res.json()) as {
      error?: { message?: string; reason?: string };
    };
    if (body.error?.message) message = body.error.message;
    if (body.error?.reason === "NO_ACTIVE_DEVICE") reason = "NO_ACTIVE_DEVICE";
    if (body.error?.reason === "PREMIUM_REQUIRED") reason = "PREMIUM_REQUIRED";
  } catch {
    // Non-JSON error body; keep the defaults.
  }
  if (res.status === 401) reason = "NOT_CONNECTED";
  // Spotify signals both missing devices and free accounts without a
  // `reason` on some endpoints; classify by status as a fallback.
  if (reason === "UNKNOWN" && res.status === 404) reason = "NO_ACTIVE_DEVICE";
  if (reason === "UNKNOWN" && res.status === 403) reason = "PREMIUM_REQUIRED";
  return new SpotifyApiError(res.status, reason, message);
}

async function call(
  token: string,
  method: "GET" | "PUT",
  path: string,
  body?: unknown
): Promise<Response> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await toError(res);
  return res;
}

export async function getDevices(token: string): Promise<SpotifyDevice[]> {
  const res = await call(token, "GET", "/me/player/devices");
  const json = (await res.json()) as { devices?: unknown };
  if (!Array.isArray(json.devices)) return [];
  return json.devices.flatMap((d) => {
    const dev = d as {
      id?: unknown;
      name?: unknown;
      type?: unknown;
      is_active?: unknown;
      is_restricted?: unknown;
    };
    // Restricted devices (some TVs/speakers) reject Web API commands.
    if (typeof dev.id !== "string" || dev.is_restricted === true) return [];
    return [
      {
        id: dev.id,
        name: typeof dev.name === "string" ? dev.name : "Device",
        type: typeof dev.type === "string" ? dev.type : "",
        isActive: dev.is_active === true,
      },
    ];
  });
}

/** Current player, or null when nothing is playing anywhere (204). */
export async function getPlayerState(
  token: string
): Promise<PlayerState | null> {
  const res = await call(token, "GET", "/me/player");
  if (res.status === 204) return null;
  const json = (await res.json()) as {
    progress_ms?: unknown;
    is_playing?: unknown;
    item?: { id?: unknown; duration_ms?: unknown } | null;
    device?: { id?: unknown } | null;
  };
  return {
    positionMs: typeof json.progress_ms === "number" ? json.progress_ms : 0,
    durationMs:
      typeof json.item?.duration_ms === "number" ? json.item.duration_ms : null,
    isPlaying: json.is_playing === true,
    trackId: typeof json.item?.id === "string" ? json.item.id : null,
    deviceId: typeof json.device?.id === "string" ? json.device.id : null,
  };
}

/** Start `trackId` at `positionMs`, optionally on a specific device. */
export async function playTrack(
  token: string,
  trackId: string,
  positionMs: number,
  deviceId?: string
): Promise<void> {
  const q = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  await call(token, "PUT", `/me/player/play${q}`, {
    uris: [`spotify:track:${trackId}`],
    position_ms: Math.max(0, Math.round(positionMs)),
  });
}

/** Resume whatever is paused (no body → no track restart). */
export async function resumePlayback(token: string): Promise<void> {
  await call(token, "PUT", "/me/player/play");
}

export async function pausePlayback(token: string): Promise<void> {
  await call(token, "PUT", "/me/player/pause");
}

export async function seek(token: string, positionMs: number): Promise<void> {
  const q = new URLSearchParams({
    position_ms: String(Math.max(0, Math.round(positionMs))),
  });
  await call(token, "PUT", `/me/player/seek?${q}`);
}

/** Move playback to `deviceId`. Spotify requires this explicit transfer —
 *  device_id on /play only picks where a *new* track starts, it doesn't
 *  relocate an already-playing one. */
export async function transferPlayback(
  token: string,
  deviceId: string,
  play: boolean
): Promise<void> {
  await call(token, "PUT", "/me/player", { device_ids: [deviceId], play });
}
