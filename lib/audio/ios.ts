"use client";

/**
 * Shared helpers for getting Web Audio to actually play on iOS/iPadOS
 * Safari and Chrome (Chrome on iOS is WebKit under the hood, so it has the
 * exact same quirks). Two problems these solve:
 *
 * 1. iOS treats a plain AudioContext's output as "ambient" sound and hard
 *    mutes it whenever the hardware silent/ring switch is on, unless the
 *    page's audio session has been switched to "playback" category.
 * 2. iOS caps the number of AudioContexts a page may create (around 4) and
 *    `close()` is async, so contexts must be created once and reused
 *    rather than one-per-play-session.
 */

// One AudioContext for the whole page, lazily created inside a user
// gesture (the first Play tap). Reused for every play session afterwards
// so repeated play/stop/play never approaches iOS's per-page ceiling.
let sharedCtx: AudioContext | null = null;

/**
 * Get the single shared AudioContext for the page, creating it on first
 * call. The first call must happen inside a user gesture (e.g. the Play
 * tap) or the context comes up suspended and iOS never lets it resume.
 */
export function getSharedAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

// The silent-unlock <audio> element only needs to play once per page
// load -- once WebKit has switched the session to "playback" it stays
// that way, and re-triggering it on every tap is unnecessary.
let unlockedWithSilentAudio = false;

/**
 * Minimal (45-byte) silent WAV: one 8-bit PCM sample of silence (0x80 =
 * zero amplitude for unsigned 8-bit PCM). Routing any <audio>/<video>
 * element playback through WebKit is what actually flips the page's audio
 * session to "playback" category on older iOS versions -- it's the classic
 * fallback for browsers that predate `navigator.audioSession`.
 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA";

// Safari 16.4+ / iOS 17 exposes navigator.audioSession; every other
// browser (older Safari, Chrome, Firefox, Android) doesn't, so this must
// be optional-chained everywhere and never assumed present.
interface AudioSessionNavigator extends Navigator {
  audioSession?: { type: string };
}

/**
 * Best-effort iOS audio-session unlock. Call from inside a user gesture
 * (the Play tap) before relying on Web Audio output. Combines both known
 * fixes for the silent/ring-switch mute:
 *
 *  - Setting `navigator.audioSession.type = "playback"` where supported.
 *  - Playing a silent HTML `<audio>` element once, which routes media
 *    playback through WebKit's audio session and unlocks it on versions
 *    that don't expose the `audioSession` API.
 *
 * Everything here is wrapped so failures are swallowed -- this must never
 * throw or block playback on browsers where none of it applies (desktop,
 * Android, older engines all no-op harmlessly).
 */
export function primeIOSAudioSession(): void {
  try {
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    // Property exists but assignment was rejected -- fall through to the
    // <audio> fallback below.
  }

  if (unlockedWithSilentAudio) return;
  unlockedWithSilentAudio = true;
  try {
    const el = new Audio(SILENT_WAV);
    el.loop = false;
    // `playsInline` isn't typed on HTMLAudioElement (only <video>), and
    // audio doesn't need it to avoid fullscreen takeover -- but setting
    // the attribute is a harmless no-op safety net some WebKit builds
    // have been reported to check regardless of element type.
    el.setAttribute("playsinline", "true");
    el.play().catch(() => {
      // Rejected (e.g. not actually inside a gesture) -- nothing to do;
      // Web Audio may still be audible if the real gesture unlocks it.
    });
  } catch {
    // Audio element construction/playback unsupported -- harmless no-op.
  }
}
