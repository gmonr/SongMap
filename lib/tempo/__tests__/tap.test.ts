import { describe, expect, it } from "vitest";
import { tapBpm } from "../tap";

/** Tap times at a steady interval (ms). */
const steady = (count: number, intervalMs: number, start = 1000): number[] =>
  Array.from({ length: count }, (_, i) => start + i * intervalMs);

describe("tapBpm", () => {
  it("is null below two taps", () => {
    expect(tapBpm([])).toBeNull();
    expect(tapBpm([1000])).toBeNull();
  });

  it("computes bpm from steady taps", () => {
    expect(tapBpm(steady(4, 500))).toBe(120); // 500ms → 120 bpm
    expect(tapBpm(steady(8, 1000))).toBe(60);
    expect(tapBpm(steady(3, 750))).toBe(80);
  });

  it("uses the median, so one mistimed tap doesn't drag the figure", () => {
    // Steady 500ms taps with one 900ms hiccup in the middle.
    const taps = [0, 500, 1000, 1900, 2400, 2900, 3400];
    expect(tapBpm(taps)).toBe(120);
  });

  it("only considers the most recent intervals", () => {
    // Old slow taps followed by >8 fast intervals: the slow ones age out.
    const taps = [...steady(3, 1000, 0), ...steady(12, 500, 2500)];
    expect(tapBpm(taps)).toBe(120);
  });
});
