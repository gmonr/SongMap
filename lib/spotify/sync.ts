/**
 * Recording sync: maps the song map's beat timeline onto a real Spotify
 * recording's millisecond positions. Pure math — no I/O, no Web API.
 *
 * The mapping is anchor-based. An anchor says "beat B of the map sounds at
 * ms M in the recording". With no anchors we assume the recording starts on
 * bar 1's downbeat (rarely true — intros/silence — hence calibration). With
 * one anchor, time flows at the song's stored BPM from that point. With two
 * or more, the tempo slope between anchors comes from the anchors
 * themselves (piecewise-linear), which absorbs rounded-integer BPM and
 * recordings that drift.
 */
import type { Timeline } from "@/lib/song/playback";

/** "Beat `beat` of the timeline sounds at `ms` into the recording." */
export interface SyncAnchor {
  beat: number;
  ms: number;
}

/** Cached display metadata of the linked track (re-fetching needs auth). */
export interface SpotifyTrackMeta {
  title: string;
  artist: string;
  durationMs: number;
}

/** The jsonb `spotify_sync` column stored per song. */
export interface SpotifySyncData {
  track?: SpotifyTrackMeta;
  anchors: SyncAnchor[];
}

export function emptySync(): SpotifySyncData {
  return { anchors: [] };
}

/** ms per beat at `bpm`, guarding degenerate tempos. */
function msPerBeat(bpm: number): number {
  const b = Number.isFinite(bpm) && bpm > 0 ? bpm : 100;
  return 60000 / b;
}

/**
 * Effective anchor list: normalized anchors, or the implicit
 * "recording starts on bar 1's downbeat" anchor when none are set.
 */
function effectiveAnchors(sync: SpotifySyncData): SyncAnchor[] {
  return sync.anchors.length > 0 ? sync.anchors : [{ beat: 0, ms: 0 }];
}

/**
 * Map a timeline beat to a position in the recording. `fallbackBpm` (the
 * song's stored tempo) sets the slope when fewer than two anchors exist;
 * with two or more, segments interpolate between neighbors and the ends
 * extrapolate with the nearest segment's slope.
 */
export function beatToMs(
  sync: SpotifySyncData,
  beat: number,
  fallbackBpm: number
): number {
  const a = effectiveAnchors(sync);
  if (a.length === 1) {
    return a[0].ms + (beat - a[0].beat) * msPerBeat(fallbackBpm);
  }
  // Segment whose start anchor is the last one at or before `beat`,
  // clamped to the first/last segment for out-of-range beats.
  let i = a.length - 2;
  while (i > 0 && a[i].beat > beat) i--;
  const slope = (a[i + 1].ms - a[i].ms) / (a[i + 1].beat - a[i].beat);
  return a[i].ms + (beat - a[i].beat) * slope;
}

/** Inverse of `beatToMs`: recording position → timeline beat. */
export function msToBeat(
  sync: SpotifySyncData,
  ms: number,
  fallbackBpm: number
): number {
  const a = effectiveAnchors(sync);
  if (a.length === 1) {
    return a[0].beat + (ms - a[0].ms) / msPerBeat(fallbackBpm);
  }
  let i = a.length - 2;
  while (i > 0 && a[i].ms > ms) i--;
  const slope = (a[i + 1].beat - a[i].beat) / (a[i + 1].ms - a[i].ms);
  return a[i].beat + (ms - a[i].ms) * slope;
}

/**
 * Timeline index of the bar sounding at recording position `ms`, or null
 * before the first bar / after the song ends.
 */
export function barIndexAtMs(
  timeline: Timeline,
  sync: SpotifySyncData,
  ms: number,
  fallbackBpm: number
): number | null {
  const beat = msToBeat(sync, ms, fallbackBpm);
  if (beat < 0 || beat >= timeline.totalBeats) return null;
  // Bars are sorted by startBeat; find the last bar starting at or before.
  let lo = 0;
  let hi = timeline.bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timeline.bars[mid].startBeat <= beat) lo = mid;
    else hi = mid - 1;
  }
  return timeline.bars.length > 0 ? lo : null;
}

/**
 * Parse the raw jsonb column into a well-formed `SpotifySyncData` (the role
 * normalize.ts plays for the `data` blob): anchors sorted by beat, entries
 * with non-finite/negative values dropped, and strict monotonicity in both
 * beat and ms enforced (a later anchor violating either is dropped) so the
 * piecewise mapping is always invertible.
 */
export function normalizeSync(raw: unknown): SpotifySyncData {
  const out = emptySync();
  if (typeof raw !== "object" || raw === null) return out;

  const { track, anchors } = raw as { track?: unknown; anchors?: unknown };

  if (typeof track === "object" && track !== null) {
    const t = track as Record<string, unknown>;
    if (
      typeof t.title === "string" &&
      typeof t.artist === "string" &&
      typeof t.durationMs === "number" &&
      Number.isFinite(t.durationMs) &&
      t.durationMs > 0
    ) {
      out.track = {
        title: t.title,
        artist: t.artist,
        durationMs: Math.round(t.durationMs),
      };
    }
  }

  if (Array.isArray(anchors)) {
    const valid: SyncAnchor[] = [];
    for (const entry of anchors) {
      if (typeof entry !== "object" || entry === null) continue;
      const { beat, ms } = entry as { beat?: unknown; ms?: unknown };
      if (
        typeof beat === "number" &&
        Number.isFinite(beat) &&
        beat >= 0 &&
        typeof ms === "number" &&
        Number.isFinite(ms) &&
        ms >= 0
      ) {
        valid.push({ beat, ms: Math.round(ms) });
      }
    }
    valid.sort((x, y) => x.beat - y.beat);
    for (const anchor of valid) {
      const prev = out.anchors[out.anchors.length - 1];
      if (prev && (anchor.beat <= prev.beat || anchor.ms <= prev.ms)) continue;
      out.anchors.push(anchor);
    }
  }

  return out;
}

/**
 * A new anchor list with `{beat, ms}` set: replaces any existing anchor at
 * that beat, keeps the rest, and re-normalizes (dropping neighbors the new
 * ms value makes non-monotonic — the fresh tap wins over stale anchors).
 */
export function withAnchor(
  sync: SpotifySyncData,
  beat: number,
  ms: number
): SpotifySyncData {
  const others = sync.anchors.filter((a) => a.beat !== beat);
  // Keep only neighbors consistent with the new anchor so IT survives
  // normalization (normalizeSync keeps the earlier of a conflicting pair).
  const consistent = others.filter((a) =>
    a.beat < beat ? a.ms < ms : a.ms > ms
  );
  return normalizeSync({
    ...sync,
    anchors: [...consistent, { beat, ms: Math.max(0, ms) }],
  });
}

/** A new anchor list with anchor `index` shifted by `deltaMs` (clamped ≥0). */
export function withNudgedAnchor(
  sync: SpotifySyncData,
  index: number,
  deltaMs: number
): SpotifySyncData {
  const target = sync.anchors[index];
  if (!target) return sync;
  return withAnchor(sync, target.beat, Math.max(0, target.ms + deltaMs));
}

/** A new anchor list without anchor `index`. */
export function withoutAnchor(
  sync: SpotifySyncData,
  index: number
): SpotifySyncData {
  return {
    ...sync,
    anchors: sync.anchors.filter((_, i) => i !== index),
  };
}
