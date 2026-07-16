/**
 * Tap-tempo math: turn a series of tap timestamps into a BPM figure. Pure so
 * it can be unit-tested; the button component owns the timestamps and the
 * idle-reset.
 */

/** Taps further apart than this start a fresh measurement. */
export const TAP_RESET_MS = 2000;

/** How many of the most recent inter-tap intervals contribute. */
const WINDOW = 8;

/**
 * BPM from tap times (ms, ascending). The median of the last few intervals —
 * rather than the mean — so one mistimed tap doesn't drag the figure.
 * Null until there are at least two taps (one interval).
 */
export function tapBpm(timesMs: number[]): number | null {
  if (timesMs.length < 2) return null;
  const intervals: number[] = [];
  const start = Math.max(1, timesMs.length - WINDOW);
  for (let i = start; i < timesMs.length; i++) {
    intervals.push(timesMs[i] - timesMs[i - 1]);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (median <= 0) return null;
  return Math.round(60_000 / median);
}
