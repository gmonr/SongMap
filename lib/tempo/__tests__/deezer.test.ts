import { describe, expect, it } from "vitest";
import {
  deezerSearchUrl,
  deezerTrackUrl,
  parseSearchMatch,
  parseTrackBpm,
} from "../deezer";

describe("deezerSearchUrl", () => {
  it("quotes artist and track fields", () => {
    const url = deezerSearchUrl("Maná", "Oye Mi Amor");
    expect(url).toBe(
      "https://api.deezer.com/search?q=" +
        encodeURIComponent('artist:"Maná" track:"Oye Mi Amor"')
    );
  });

  it("omits an empty artist", () => {
    expect(deezerSearchUrl("  ", "Song")).toBe(
      "https://api.deezer.com/search?q=" + encodeURIComponent('track:"Song"')
    );
  });
});

describe("deezerTrackUrl", () => {
  it("builds the track endpoint", () => {
    expect(deezerTrackUrl(3135556)).toBe(
      "https://api.deezer.com/track/3135556"
    );
  });
});

describe("parseSearchMatch", () => {
  it("returns the first track", () => {
    const json = {
      data: [
        { id: 42, title: "Oye Mi Amor", artist: { name: "Maná" } },
        { id: 43, title: "Other", artist: { name: "X" } },
      ],
    };
    expect(parseSearchMatch(json)).toEqual({
      id: 42,
      title: "Oye Mi Amor",
      artist: "Maná",
    });
  });

  it("returns null on empty or malformed responses", () => {
    expect(parseSearchMatch({ data: [] })).toBeNull();
    expect(parseSearchMatch({})).toBeNull();
    expect(parseSearchMatch(null)).toBeNull();
    expect(parseSearchMatch({ data: [{ title: "no id" }] })).toBeNull();
  });
});

describe("parseTrackBpm", () => {
  it("rounds a real bpm", () => {
    expect(parseTrackBpm({ bpm: 127.6 })).toBe(128);
  });

  it("treats 0 / missing / junk as absent", () => {
    expect(parseTrackBpm({ bpm: 0 })).toBeNull(); // Deezer's "unknown"
    expect(parseTrackBpm({ bpm: -3 })).toBeNull();
    expect(parseTrackBpm({})).toBeNull();
    expect(parseTrackBpm({ bpm: "128" })).toBeNull();
    expect(parseTrackBpm(null)).toBeNull();
  });
});
