import { describe, expect, it } from "vitest";
import { parseLrc } from "../lrc";

describe("parseLrc", () => {
  it("parses lines sorted by time", () => {
    const lines = parseLrc(
      "[00:12.00] First line\n[00:05.50] Earlier line\n[01:00.00] Later"
    );
    expect(lines).toEqual([
      { ms: 5500, text: "Earlier line" },
      { ms: 12000, text: "First line" },
      { ms: 60000, text: "Later" },
    ]);
  });

  it("handles 1-, 2-, and 3-digit fractions", () => {
    expect(parseLrc("[00:01.5] a")[0].ms).toBe(1500);
    expect(parseLrc("[00:01.50] a")[0].ms).toBe(1500);
    expect(parseLrc("[00:01.500] a")[0].ms).toBe(1500);
    expect(parseLrc("[00:01] a")[0].ms).toBe(1000);
  });

  it("expands multiple timestamps on one line", () => {
    const lines = parseLrc("[00:10.00][01:40.00]Chorus line");
    expect(lines).toEqual([
      { ms: 10000, text: "Chorus line" },
      { ms: 100000, text: "Chorus line" },
    ]);
  });

  it("skips metadata tags and blank lines", () => {
    const lines = parseLrc(
      "[ar:Maná]\n[ti:Rayando el Sol]\n[length: 4:12]\n\n[00:20.00] Real line"
    );
    expect(lines).toEqual([{ ms: 20000, text: "Real line" }]);
  });

  it("drops timestamped lines with no text", () => {
    expect(parseLrc("[00:10.00]\n[00:11.00]   ")).toEqual([]);
  });

  it("applies a positive offset as earlier, clamped at zero", () => {
    const lines = parseLrc("[offset:+500]\n[00:00.30] a\n[00:10.00] b");
    expect(lines).toEqual([
      { ms: 0, text: "a" },
      { ms: 9500, text: "b" },
    ]);
  });

  it("applies a negative offset as later", () => {
    expect(parseLrc("[offset:-250]\n[00:10.00] a")).toEqual([
      { ms: 10250, text: "a" },
    ]);
  });

  it("strips enhanced per-word marks", () => {
    expect(parseLrc("[00:10.00] <00:10.00>te <00:10.40>he soñado")).toEqual([
      { ms: 10000, text: "te he soñado" },
    ]);
  });
});
