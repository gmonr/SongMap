import { describe, expect, it } from "vitest";
import {
  formatMs,
  parseSearchTracks,
  rawSearchUrl,
  searchTracksUrl,
} from "../search";

describe("search URLs", () => {
  it("field-filters artist and title", () => {
    const url = new URL(searchTracksUrl("The Beatles", "Let It Be"));
    expect(url.origin + url.pathname).toBe("https://api.spotify.com/v1/search");
    expect(url.searchParams.get("q")).toBe(
      'artist:"The Beatles" track:"Let It Be"'
    );
    expect(url.searchParams.get("type")).toBe("track");
  });

  it("omits empty fields and supports raw queries", () => {
    expect(new URL(searchTracksUrl("", "Let It Be")).searchParams.get("q")).toBe(
      'track:"Let It Be"'
    );
    expect(new URL(rawSearchUrl("let it be")).searchParams.get("q")).toBe(
      "let it be"
    );
  });
});

describe("parseSearchTracks", () => {
  const fixture = {
    tracks: {
      items: [
        {
          id: "3BQHpFgAp4l80e1XslIjNI",
          name: "Yesterday",
          duration_ms: 125666,
          artists: [{ name: "The Beatles" }, { name: "Someone" }],
          album: {
            images: [
              { url: "big.jpg", height: 640 },
              { url: "small.jpg", height: 64 },
            ],
          },
        },
        { id: 42, name: "malformed" },
        {
          id: "noart",
          name: "No Art",
          duration_ms: 1000,
          artists: "junk",
          album: {},
        },
      ],
    },
  };

  it("parses tracks, joining artists and taking the smallest image", () => {
    expect(parseSearchTracks(fixture)).toEqual([
      {
        id: "3BQHpFgAp4l80e1XslIjNI",
        title: "Yesterday",
        artist: "The Beatles, Someone",
        durationMs: 125666,
        albumArtUrl: "small.jpg",
      },
      {
        id: "noart",
        title: "No Art",
        artist: "",
        durationMs: 1000,
        albumArtUrl: undefined,
      },
    ]);
  });

  it("returns [] for junk", () => {
    for (const raw of [null, "x", {}, { tracks: {} }, { tracks: { items: 5 } }]) {
      expect(parseSearchTracks(raw)).toEqual([]);
    }
  });
});

describe("formatMs", () => {
  it("formats mm:ss, flooring and clamping", () => {
    expect(formatMs(0)).toBe("0:00");
    expect(formatMs(125666)).toBe("2:05");
    expect(formatMs(-50)).toBe("0:00");
  });
});
