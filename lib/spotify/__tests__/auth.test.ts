import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  base64Url,
  codeChallenge,
  codeExchangeBody,
  parseTokenResponse,
  randomVerifier,
  refreshBody,
  safeNext,
  SPOTIFY_SCOPES,
} from "../auth";

describe("PKCE codes", () => {
  it("base64url-encodes without padding or +/", () => {
    // 0xFBEFBE is four 62-valued sextets: '+' in plain base64, '-' here.
    expect(base64Url(new Uint8Array([0xfb, 0xef, 0xbe]))).toBe("----");
    expect(base64Url(new Uint8Array([0]))).toBe("AA");
  });

  it("computes the RFC 7636 appendix B challenge", async () => {
    expect(
      await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates distinct url-safe verifiers of PKCE-legal length", () => {
    const a = randomVerifier();
    const b = randomVerifier();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("URL and body builders", () => {
  it("builds the authorize URL with S256 and playback scopes", () => {
    const url = new URL(
      authorizeUrl({
        clientId: "cid",
        redirectUri: "http://localhost:3000/api/spotify/callback",
        state: "st",
        challenge: "ch",
      })
    );
    expect(url.origin + url.pathname).toBe(
      "https://accounts.spotify.com/authorize"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      scope: SPOTIFY_SCOPES,
      redirect_uri: "http://localhost:3000/api/spotify/callback",
      state: "st",
      code_challenge_method: "S256",
      code_challenge: "ch",
    });
  });

  it("builds PKCE token bodies without any client secret", () => {
    const exchange = codeExchangeBody({
      clientId: "cid",
      code: "co",
      redirectUri: "r",
      verifier: "v",
    });
    expect(exchange.get("grant_type")).toBe("authorization_code");
    expect(exchange.get("code_verifier")).toBe("v");
    expect([...exchange.keys()].some((k) => k.includes("secret"))).toBe(false);

    const refresh = refreshBody({ clientId: "cid", refreshToken: "rt" });
    expect(refresh.get("grant_type")).toBe("refresh_token");
    expect(refresh.get("refresh_token")).toBe("rt");
  });
});

describe("parseTokenResponse", () => {
  it("parses a full grant response", () => {
    expect(
      parseTokenResponse({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        token_type: "Bearer",
      })
    ).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 });
  });

  it("tolerates refresh responses without a rotated refresh token", () => {
    expect(parseTokenResponse({ access_token: "at" })).toEqual({
      accessToken: "at",
      refreshToken: undefined,
      expiresIn: 3600,
    });
  });

  it("rejects malformed responses", () => {
    for (const raw of [null, {}, { access_token: 5 }, { error: "denied" }]) {
      expect(parseTokenResponse(raw)).toBeNull();
    }
  });
});

describe("safeNext", () => {
  it("allows same-site paths and rejects everything else", () => {
    expect(safeNext("/songs/abc")).toBe("/songs/abc");
    expect(safeNext("//evil.com")).toBe("/songs");
    expect(safeNext("https://evil.com")).toBe("/songs");
    expect(safeNext(null)).toBe("/songs");
  });
});
