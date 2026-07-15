import { describe, expect, it } from "vitest";
import { importChordSheet } from "../../song/import";
import {
  extractJsStore,
  isUltimateGuitarUrl,
  parseSearchResults,
  parseTabPage,
  stripUgMarkup,
  UGParseError,
} from "../parse";

/** Build a UG-style page: store JSON entity-encoded into the js-store div. */
function pageWith(store: unknown): string {
  const encoded = JSON.stringify(store)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<html><body><div class="js-store" data-content="${encoded}"></div></body></html>`;
}

const searchStore = {
  store: {
    page: {
      data: {
        results: [
          {
            song_name: "Hello World",
            artist_name: "The Devs",
            type: "Chords",
            tab_url: "https://tabs.ultimate-guitar.com/tab/the-devs/hello-world-chords-111",
            rating: 4.41,
            votes: 320,
          },
          {
            song_name: "Hello World",
            artist_name: "The Devs",
            type: "Tab",
            tab_url: "https://tabs.ultimate-guitar.com/tab/the-devs/hello-world-tabs-222",
            rating: 4.9,
            votes: 9999,
          },
          {
            song_name: "Hello World",
            artist_name: "The Devs",
            type: "Chords",
            tab_url: "https://tabs.ultimate-guitar.com/tab/the-devs/hello-world-chords-333",
            rating: 4.86,
            votes: 12345,
          },
          {
            song_name: "Hello World",
            artist_name: "The Devs",
            type: "Ukulele Chords",
            tab_url: "https://tabs.ultimate-guitar.com/tab/the-devs/hello-world-ukulele-444",
            rating: 4.2,
            votes: 50,
          },
        ],
      },
    },
  },
};

const tabStore = {
  store: {
    page: {
      data: {
        tab: { song_name: "Hello World", artist_name: "The Devs" },
        tab_view: {
          meta: { tonality: "Am", capo: 2 },
          wiki_tab: {
            content:
              "[Verse 1]\r\n[tab][ch]C[/ch]           [ch]G[/ch]\r\nHello world these are words[/tab]\r\n[tab][ch]Am[/ch]              [ch]F[/ch]\r\nSecond lyric phrase here[/tab]\r\n",
          },
        },
      },
    },
  },
};

describe("extractJsStore", () => {
  it("finds and decodes the entity-encoded store", () => {
    const store = extractJsStore(pageWith({ a: '<b> & "c"' })) as {
      a: string;
    };
    expect(store.a).toBe('<b> & "c"');
  });

  it("decodes numeric entities", () => {
    const html =
      '<div class="js-store" data-content="{&quot;n&quot;:&quot;&#65;&#x42;&quot;}"></div>';
    expect(extractJsStore(html)).toEqual({ n: "AB" });
  });

  it("throws UGParseError when the div is missing", () => {
    expect(() => extractJsStore("<html><body>nope</body></html>")).toThrow(
      UGParseError
    );
  });

  it("throws UGParseError on malformed JSON", () => {
    const html = '<div class="js-store" data-content="{broken"></div>';
    expect(() => extractJsStore(html)).toThrow(UGParseError);
  });
});

describe("parseSearchResults", () => {
  it("keeps only Chords results, sorted by votes desc", () => {
    const results = parseSearchResults(searchStore);
    expect(results.map((r) => r.type)).toEqual(["Chords", "Chords"]);
    expect(results.map((r) => r.votes)).toEqual([12345, 320]);
    expect(results[0]).toEqual({
      songName: "Hello World",
      artistName: "The Devs",
      tabUrl:
        "https://tabs.ultimate-guitar.com/tab/the-devs/hello-world-chords-333",
      rating: 4.86,
      votes: 12345,
      type: "Chords",
    });
  });

  it("returns [] on missing or drifted store shape", () => {
    expect(parseSearchResults({})).toEqual([]);
    expect(parseSearchResults(null)).toEqual([]);
    expect(parseSearchResults({ store: { page: { data: {} } } })).toEqual([]);
    expect(
      parseSearchResults({ store: { page: { data: { results: "?" } } } })
    ).toEqual([]);
  });

  it("skips entries with missing fields or non-https URLs", () => {
    const results = parseSearchResults({
      store: {
        page: {
          data: {
            results: [
              { type: "Chords", song_name: "No URL" },
              {
                type: "Chords",
                song_name: "Bad URL",
                tab_url: "http://evil.example/x",
              },
            ],
          },
        },
      },
    });
    expect(results).toEqual([]);
  });
});

describe("stripUgMarkup", () => {
  it("removes [ch]/[tab] markers and normalizes newlines", () => {
    expect(stripUgMarkup("[tab][ch]C[/ch] x[/tab]\r\nnext\rline")).toBe(
      "C x\nnext\nline"
    );
  });

  it("leaves section headers like [Verse 1] intact", () => {
    expect(stripUgMarkup("[Verse 1]\n[ch]C[/ch]")).toBe("[Verse 1]\nC");
  });
});

describe("parseTabPage", () => {
  it("maps content and metadata", () => {
    const tab = parseTabPage(tabStore);
    expect(tab.songName).toBe("Hello World");
    expect(tab.artistName).toBe("The Devs");
    expect(tab.tonality).toBe("Am");
    expect(tab.capo).toBe(2);
    expect(tab.content).toContain("[Verse 1]");
    expect(tab.content).not.toContain("[ch]");
    expect(tab.content).not.toContain("[tab]");
    expect(tab.content).not.toContain("\r");
  });

  it("leaves absent tonality/capo undefined", () => {
    const tab = parseTabPage({
      store: {
        page: { data: { tab_view: { wiki_tab: { content: "[ch]C[/ch]" } } } },
      },
    });
    expect(tab.tonality).toBeUndefined();
    expect(tab.capo).toBeUndefined();
    expect(tab.songName).toBeUndefined();
  });

  it("throws UGParseError when there is no content", () => {
    expect(() => parseTabPage({ store: { page: { data: {} } } })).toThrow(
      UGParseError
    );
  });
});

describe("isUltimateGuitarUrl", () => {
  it("accepts https UG hosts only", () => {
    expect(isUltimateGuitarUrl("https://tabs.ultimate-guitar.com/tab/x")).toBe(
      true
    );
    expect(isUltimateGuitarUrl("https://www.ultimate-guitar.com/search.php")).toBe(
      true
    );
    expect(isUltimateGuitarUrl("https://ultimate-guitar.com/x")).toBe(true);
    expect(isUltimateGuitarUrl("http://tabs.ultimate-guitar.com/x")).toBe(false);
    expect(isUltimateGuitarUrl("https://evil.com/ultimate-guitar.com")).toBe(
      false
    );
    expect(isUltimateGuitarUrl("https://xultimate-guitar.com/x")).toBe(false);
    expect(isUltimateGuitarUrl("not a url")).toBe(false);
  });
});

describe("UG page → importChordSheet pipeline", () => {
  it("produces bars and lyrics from a fetched tab page", () => {
    const tab = parseTabPage(extractJsStore(pageWith(tabStore)));
    const imported = importChordSheet(tab.content, 4);

    expect(imported.warnings).toEqual([]);
    expect(imported.data.arrangement).toHaveLength(1);
    const section = imported.data.sections[imported.data.arrangement[0].ref];
    expect(section.label).toBe("Verse 1");
    expect(section.lines).toHaveLength(2);
    expect(section.lines[0].bars.map((b) => b.chords[0].sym)).toEqual([
      "C",
      "G",
    ]);
    expect(section.lines[0].lyrics.map((s) => s.text)).toEqual([
      "Hello world",
      "these are words",
    ]);
  });
});
