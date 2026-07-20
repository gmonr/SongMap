import { describe, expect, it } from "vitest";
import {
  lrclibGetUrl,
  lrclibSearchUrl,
  parseLrclibSearch,
  parseLrclibTrack,
  pickLrclibMatch,
  type LrclibTrack,
} from "../lrclib";

function track(overrides: Partial<LrclibTrack>): LrclibTrack {
  return {
    id: 1,
    trackName: "Song",
    artistName: "Artist",
    duration: 200,
    instrumental: false,
    plainLyrics: "words",
    syncedLyrics: "[00:01.00] words",
    ...overrides,
  };
}

describe("lrclibGetUrl", () => {
  it("builds the exact-signature endpoint with rounded duration", () => {
    const url = lrclibGetUrl("Maná", "Oye Mi Amor", 272.4);
    expect(url).toContain("https://lrclib.net/api/get?");
    expect(url).toContain("artist_name=Man%C3%A1");
    expect(url).toContain("track_name=Oye+Mi+Amor");
    expect(url).toContain("duration=272");
  });

  it("omits duration when unknown", () => {
    expect(lrclibGetUrl("A", "T")).not.toContain("duration");
  });
});

describe("lrclibSearchUrl", () => {
  it("omits an empty artist", () => {
    expect(lrclibSearchUrl("  ", "Song")).toBe(
      "https://lrclib.net/api/search?track_name=Song"
    );
  });
});

describe("parseLrclibTrack", () => {
  it("parses a well-formed record", () => {
    const t = parseLrclibTrack({
      id: 7,
      trackName: "T",
      artistName: "A",
      duration: 180.5,
      instrumental: false,
      plainLyrics: "p",
      syncedLyrics: "[00:01.00] p",
    });
    expect(t).toEqual({
      id: 7,
      trackName: "T",
      artistName: "A",
      duration: 180.5,
      instrumental: false,
      plainLyrics: "p",
      syncedLyrics: "[00:01.00] p",
    });
  });

  it("rejects malformed records and 404 nulls", () => {
    expect(parseLrclibTrack(null)).toBeNull();
    expect(parseLrclibTrack({ trackName: "no id" })).toBeNull();
  });

  it("defaults missing lyric fields to empty", () => {
    const t = parseLrclibTrack({ id: 1, trackName: "T" });
    expect(t?.syncedLyrics).toBe("");
    expect(t?.instrumental).toBe(false);
  });
});

describe("parseLrclibSearch", () => {
  it("keeps only well-formed entries", () => {
    const list = parseLrclibSearch([
      { id: 1, trackName: "A" },
      "junk",
      { id: 2, trackName: "B" },
    ]);
    expect(list.map((t) => t.id)).toEqual([1, 2]);
  });

  it("returns empty for a non-array", () => {
    expect(parseLrclibSearch({})).toEqual([]);
  });
});

describe("pickLrclibMatch", () => {
  it("skips instrumentals and unsynced tracks", () => {
    const match = pickLrclibMatch(
      [
        track({ id: 1, instrumental: true }),
        track({ id: 2, syncedLyrics: "" }),
        track({ id: 3 }),
      ],
      "Artist",
      "Song"
    );
    expect(match?.id).toBe(3);
  });

  it("prefers exact title+artist over title-only, ignoring diacritics", () => {
    const match = pickLrclibMatch(
      [
        track({ id: 1, trackName: "Song", artistName: "Cover Band" }),
        track({ id: 2, trackName: "Song", artistName: "Mana" }),
      ],
      "Maná",
      "Song"
    );
    expect(match?.id).toBe(2);
  });

  it("uses duration proximity to break ties", () => {
    const match = pickLrclibMatch(
      [
        track({ id: 1, duration: 150 }),
        track({ id: 2, duration: 201 }),
      ],
      "Artist",
      "Song",
      200
    );
    expect(match?.id).toBe(2);
  });

  it("falls back to the first synced result", () => {
    const match = pickLrclibMatch(
      [track({ id: 5, trackName: "Other", artistName: "X" })],
      "Artist",
      "Song"
    );
    expect(match?.id).toBe(5);
  });

  it("returns null when nothing synced exists", () => {
    expect(pickLrclibMatch([track({ syncedLyrics: "" })], "A", "T")).toBeNull();
  });
});
