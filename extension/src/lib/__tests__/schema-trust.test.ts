// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import {
  isAnnotateOnlyAuthorityType,
  isAuthorityContextProperty,
  isAuthorityType,
  isAuthorityUrlMismatch,
  shouldSkipPage,
  typeNames,
} from "../schema-trust";

describe("typeNames", () => {
  it("handles a bare string @type", () => {
    expect(typeNames("Organization")).toEqual(["Organization"]);
  });

  it("strips the schema.org IRI prefix", () => {
    expect(typeNames("https://schema.org/NewsMediaOrganization")).toEqual([
      "NewsMediaOrganization",
    ]);
  });

  it("handles an array @type", () => {
    expect(
      typeNames(["Organization", "https://schema.org/Corporation"]),
    ).toEqual(["Organization", "Corporation"]);
  });

  it("ignores non-string entries", () => {
    expect(typeNames([null, 5, "Person"])).toEqual(["Person"]);
  });

  it("returns an empty list for undefined", () => {
    expect(typeNames(undefined)).toEqual([]);
  });
});

describe("isAuthorityType", () => {
  it("matches Organization", () => {
    expect(isAuthorityType("Organization")).toBe(true);
  });

  it("matches NewsMediaOrganization via the long-form IRI", () => {
    expect(isAuthorityType("https://schema.org/NewsMediaOrganization")).toBe(
      true,
    );
  });

  it("does not match Person (Person goes through the annotate path, not the sanitize path)", () => {
    expect(isAuthorityType("Person")).toBe(false);
  });

  it("does not match Article", () => {
    expect(isAuthorityType("Article")).toBe(false);
  });
});

describe("isAnnotateOnlyAuthorityType", () => {
  it("matches Person", () => {
    expect(isAnnotateOnlyAuthorityType("Person")).toBe(true);
  });

  it("matches Person via the long-form IRI", () => {
    expect(isAnnotateOnlyAuthorityType("https://schema.org/Person")).toBe(true);
  });

  it("does not match Organization (sanitized, not annotated)", () => {
    expect(isAnnotateOnlyAuthorityType("Organization")).toBe(false);
  });
});

describe("isAuthorityContextProperty", () => {
  it("matches author / editor / publisher", () => {
    expect(isAuthorityContextProperty("author")).toBe(true);
    expect(isAuthorityContextProperty("editor")).toBe(true);
    expect(isAuthorityContextProperty("publisher")).toBe(true);
  });

  it("matches reviewedBy", () => {
    expect(isAuthorityContextProperty("reviewedBy")).toBe(true);
  });

  it("does not match arbitrary properties", () => {
    expect(isAuthorityContextProperty("headline")).toBe(false);
    expect(isAuthorityContextProperty("about")).toBe(false);
  });
});

describe("shouldSkipPage", () => {
  it("skips news aggregators", () => {
    expect(shouldSkipPage("news.google.com")).toBe(true);
    expect(shouldSkipPage("news.yahoo.com")).toBe(true);
  });

  it("skips AMP cache subdomains via suffix match", () => {
    expect(shouldSkipPage("example-com.cdn.ampproject.org")).toBe(true);
  });

  it("skips Google Translate proxy domains", () => {
    expect(shouldSkipPage("example-com.translate.goog")).toBe(true);
  });

  it("does not skip ordinary publisher hosts", () => {
    expect(shouldSkipPage("nytimes.com")).toBe(false);
    expect(shouldSkipPage("www.nytimes.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(shouldSkipPage("News.Google.com")).toBe(true);
  });
});

describe("isAuthorityUrlMismatch", () => {
  it("flags a different registrable domain", () => {
    expect(
      isAuthorityUrlMismatch(
        "https://www.nytimes.com/about",
        "randomspam.example",
      ),
    ).toBe(true);
  });

  it("allows matching registrable domains", () => {
    expect(
      isAuthorityUrlMismatch("https://www.nytimes.com/about", "nytimes.com"),
    ).toBe(false);
  });

  it("allows subdomain claims that share the page RD", () => {
    expect(
      isAuthorityUrlMismatch("https://www.example.com", "blog.example.com"),
    ).toBe(false);
  });

  it("returns false for unparseable claim URLs", () => {
    expect(isAuthorityUrlMismatch("not a url", "example.com")).toBe(false);
  });

  it("returns false for non-http schemes", () => {
    expect(
      isAuthorityUrlMismatch("mailto:editor@evil.example", "example.com"),
    ).toBe(false);
  });

  it("returns false when either RD is unresolvable (fails closed)", () => {
    expect(isAuthorityUrlMismatch("https://localhost/about", "localhost")).toBe(
      false,
    );
  });
});
