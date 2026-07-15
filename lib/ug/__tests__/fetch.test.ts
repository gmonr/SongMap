import { describe, expect, it } from "vitest";
import { buildRelayUrl, looksLikeUgPage, searchUrl } from "../fetch";

describe("buildRelayUrl", () => {
  const target = "https://www.ultimate-guitar.com/search.php?value=a b&x=1";

  it("substitutes {url} URI-encoded", () => {
    expect(buildRelayUrl("https://relay.example/raw?url={url}", target)).toBe(
      `https://relay.example/raw?url=${encodeURIComponent(target)}`
    );
  });

  it("substitutes {rawUrl} verbatim", () => {
    expect(buildRelayUrl("https://r.jina.ai/{rawUrl}", target)).toBe(
      `https://r.jina.ai/${target}`
    );
  });

  it("returns the template unchanged when it has no placeholder", () => {
    const noPlaceholder = "https://relay.example/raw?url=";
    expect(buildRelayUrl(noPlaceholder, target)).toBe(noPlaceholder);
  });
});

describe("looksLikeUgPage", () => {
  it("accepts pages carrying the js-store div", () => {
    expect(
      looksLikeUgPage('<div class="js-store" data-content="{}"></div>')
    ).toBe(true);
  });

  it("rejects relay error pages and empty bodies", () => {
    expect(looksLikeUgPage("<html>502 Bad Gateway</html>")).toBe(false);
    expect(looksLikeUgPage("")).toBe(false);
  });
});

describe("searchUrl", () => {
  it("encodes the query and caps its length", () => {
    expect(searchUrl("hello world")).toBe(
      "https://www.ultimate-guitar.com/search.php?search_type=title&value=hello%20world"
    );
    const long = "x".repeat(500);
    expect(searchUrl(long)).toContain("x".repeat(200));
    expect(searchUrl(long)).not.toContain("x".repeat(201));
  });
});
