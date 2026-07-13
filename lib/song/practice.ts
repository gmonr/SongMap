/**
 * Small helpers shared by the practice views: a seeded hash for stable-but-
 * shuffleable bar masking, and a seeded Fisher-Yates shuffle for the
 * interleaved section order. Both take a `seed` so "reshuffle" is just
 * bumping a counter, with no state to store beyond that.
 */

/** Deterministic pseudo-random value in [0, 1) from two integers. */
function hash01(seed: number, index: number): number {
  let h = (seed ^ index) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function strToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Whether the item at `key` should be masked, given `seed` and `percent` hidden. */
export function isMasked(
  seed: number,
  key: string | number,
  percent: number
): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  const index = typeof key === "number" ? key : strToInt(key);
  return hash01(seed, index) < percent / 100;
}

/** Seeded Fisher-Yates shuffle of [0, count). */
export function shuffledOrder(seed: number, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(hash01(seed, i) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
