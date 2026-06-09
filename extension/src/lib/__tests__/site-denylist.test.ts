// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import {
  addHostPattern,
  findMatchingPatterns,
  hostPatternFor,
  isContentSchemeUrl,
  isValidPattern,
  matchesDenylist,
  removeMatchingPatterns,
} from "../site-denylist";

describe("hostPatternFor", () => {
  it("returns scheme+host+/* for an https URL", () => {
    expect(hostPatternFor("https://mail.google.com/u/0/inbox")).toBe(
      "https://mail.google.com/*",
    );
  });

  it("preserves the scheme for http", () => {
    expect(hostPatternFor("http://example.test/path")).toBe(
      "http://example.test/*",
    );
  });

  it("preserves port when present in the host", () => {
    expect(hostPatternFor("http://localhost:8080/")).toBe(
      "http://localhost:8080/*",
    );
  });

  it("returns null for chrome:// URLs", () => {
    expect(hostPatternFor("chrome://extensions")).toBeNull();
  });

  it("returns null for about:blank", () => {
    expect(hostPatternFor("about:blank")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(hostPatternFor("not a url")).toBeNull();
  });
});

describe("isContentSchemeUrl", () => {
  it.each([
    ["https://example.test/", true],
    ["http://example.test/", true],
    ["file:///home/user/file.html", true],
    ["chrome://flags/", false],
    ["about:blank", false],
    ["view-source:https://example.test/", false],
    ["", false],
    ["javascript:void(0)", false],
  ])("isContentSchemeUrl(%s) = %s", (url, expected) => {
    expect(isContentSchemeUrl(url)).toBe(expected);
  });
});

describe("matchesDenylist", () => {
  it("returns false for an empty pattern list", () => {
    expect(matchesDenylist("https://example.test/", [])).toBe(false);
  });

  it("matches a host-scoped pattern", () => {
    expect(
      matchesDenylist("https://example.test/anything?x=1", [
        "https://example.test/*",
      ]),
    ).toBe(true);
  });

  it("differentiates http from https by default", () => {
    expect(
      matchesDenylist("http://example.test/foo", ["https://example.test/*"]),
    ).toBe(false);
  });

  it("differentiates host vs subdomain", () => {
    expect(
      matchesDenylist("https://example.test/", ["https://mail.example.test/*"]),
    ).toBe(false);
  });

  it("supports subdomain wildcards in URL Pattern syntax", () => {
    // URLPattern wildcards apply within a component — `{*.}?example.test`
    // means "optionally any subdomain". The plain `*` form below is the
    // typical authored shape from the Options-page add input.
    expect(
      matchesDenylist("https://mail.example.test/foo", [
        "https://*.example.test/*",
      ]),
    ).toBe(true);
  });

  it("ignores invalid patterns instead of throwing", () => {
    expect(
      matchesDenylist("https://example.test/", [
        "not-a-valid-pattern",
        "https://example.test/*",
      ]),
    ).toBe(true);
  });
});

describe("findMatchingPatterns", () => {
  it("returns every pattern that matches the URL", () => {
    const patterns = [
      "https://mail.example.test/*",
      "https://*.example.test/*",
      "https://other.test/*",
    ];
    expect(
      findMatchingPatterns("https://mail.example.test/inbox", patterns),
    ).toEqual(["https://mail.example.test/*", "https://*.example.test/*"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(
      findMatchingPatterns("https://example.test/", ["https://other.test/*"]),
    ).toEqual([]);
  });
});

describe("addHostPattern", () => {
  it("appends a scheme-host pattern derived from the URL", () => {
    expect(addHostPattern("https://example.test/foo", [])).toEqual({
      patterns: ["https://example.test/*"],
      added: "https://example.test/*",
    });
  });

  it("is a no-op when the exact pattern is already present", () => {
    const result = addHostPattern("https://example.test/foo", [
      "https://example.test/*",
    ]);
    expect(result).toEqual({
      patterns: ["https://example.test/*"],
      added: null,
    });
  });

  it("returns added: null for non-content scheme URLs", () => {
    const result = addHostPattern("chrome://extensions", []);
    expect(result).toEqual({ patterns: [], added: null });
  });

  it("preserves existing entries", () => {
    const existing = ["https://other.test/*"];
    const result = addHostPattern("https://example.test/", existing);
    expect(result).toEqual({
      patterns: ["https://other.test/*", "https://example.test/*"],
      added: "https://example.test/*",
    });
    // Pure: caller's array untouched.
    expect(existing).toEqual(["https://other.test/*"]);
  });
});

describe("removeMatchingPatterns", () => {
  it("removes every pattern that matches the URL", () => {
    const result = removeMatchingPatterns("https://mail.example.test/inbox", [
      "https://mail.example.test/*",
      "https://*.example.test/*",
      "https://other.test/*",
    ]);
    expect(result).toEqual({
      patterns: ["https://other.test/*"],
      removed: 2,
    });
  });

  it("is a no-op when no pattern matches", () => {
    const result = removeMatchingPatterns("https://example.test/", [
      "https://other.test/*",
    ]);
    expect(result).toEqual({
      patterns: ["https://other.test/*"],
      removed: 0,
    });
  });

  it("returns removed: 0 for unparseable URLs", () => {
    const result = removeMatchingPatterns("not a url", [
      "https://example.test/*",
    ]);
    expect(result).toEqual({
      patterns: ["https://example.test/*"],
      removed: 0,
    });
  });
});

describe("isValidPattern", () => {
  it.each([
    ["https://example.test/*", true],
    ["https://*.example.test/*", true],
    ["https://example.test/foo/:bar", true],
    ["", false],
    ["not-a-url-pattern!! :::", false],
  ])("isValidPattern(%s) = %s", (pattern, expected) => {
    expect(isValidPattern(pattern)).toBe(expected);
  });
});
