// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { registrableDomain, sameRegistrableDomain } from "../domain-trust";

describe("registrableDomain", () => {
  it("returns the eTLD+1 of a plain hostname", () => {
    expect(registrableDomain("example.com")).toBe("example.com");
  });

  it("strips a www prefix via the PSL", () => {
    expect(registrableDomain("www.example.com")).toBe("example.com");
  });

  it("strips deep subdomains", () => {
    expect(registrableDomain("a.b.c.example.com")).toBe("example.com");
  });

  it("handles multi-part ICANN suffixes", () => {
    expect(registrableDomain("foo.co.uk")).toBe("foo.co.uk");
    expect(registrableDomain("bar.foo.co.uk")).toBe("foo.co.uk");
    expect(registrableDomain("baz.com.au")).toBe("baz.com.au");
  });

  // The PSL ships a Private section that lists hosts like github.io,
  // vercel.app, s3.amazonaws.com. We intentionally ignore that section
  // so two pages on `*.github.io` collapse to a single registrable
  // domain — otherwise an unearned-authority check would treat
  // `attacker.github.io` and `victim.github.io` as different
  // registrable identities and silently accept cross-page claims.
  it("ignores the PSL Private section", () => {
    expect(registrableDomain("attacker.github.io")).toBe("github.io");
    expect(registrableDomain("victim.github.io")).toBe("github.io");
    expect(registrableDomain("project.vercel.app")).toBe("vercel.app");
  });

  it("passes IPv4 literals through unchanged", () => {
    expect(registrableDomain("192.168.1.1")).toBe("192.168.1.1");
  });

  it("passes IPv6 literals through (brackets stripped to canonical form)", () => {
    // URL.hostname yields `[::1]` for an IPv6 host; tldts normalizes to
    // the bracketless canonical form. Both forms collapse to the same
    // string, so `sameRegistrableDomain` still compares equal.
    expect(registrableDomain("[::1]")).toBe("::1");
    expect(registrableDomain("::1")).toBe("::1");
  });

  it("returns null for single-label hosts", () => {
    expect(registrableDomain("localhost")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(registrableDomain("")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(registrableDomain("Example.COM")).toBe("example.com");
  });

  it("normalizes punycode IDNs", () => {
    // xn--80akhbyknj4f → испытание (Russian "test" TLD)
    expect(registrableDomain("foo.xn--80akhbyknj4f")).toBe(
      "foo.xn--80akhbyknj4f",
    );
  });
});

describe("sameRegistrableDomain", () => {
  it("matches identical hostnames", () => {
    expect(sameRegistrableDomain("example.com", "example.com")).toBe(true);
  });

  it("matches across subdomains", () => {
    expect(sameRegistrableDomain("www.example.com", "api.example.com")).toBe(
      true,
    );
  });

  it("rejects different registrable domains", () => {
    expect(sameRegistrableDomain("example.com", "evil.example")).toBe(false);
  });

  it("rejects sibling hosts on a multi-part ICANN suffix", () => {
    expect(sameRegistrableDomain("foo.co.uk", "bar.co.uk")).toBe(false);
  });

  it("rejects sibling hosts under a PSL Private suffix as same identity", () => {
    // Both share the ICANN registrable domain `github.io`, so for our
    // conservative comparison they are the same registrable identity.
    expect(
      sameRegistrableDomain("attacker.github.io", "victim.github.io"),
    ).toBe(true);
  });

  it("returns false when either side cannot be resolved", () => {
    expect(sameRegistrableDomain("localhost", "localhost")).toBe(false);
    expect(sameRegistrableDomain("", "example.com")).toBe(false);
    expect(sameRegistrableDomain("example.com", "")).toBe(false);
  });

  it("treats an IP literal as its own registrable identity", () => {
    expect(sameRegistrableDomain("192.168.1.1", "192.168.1.1")).toBe(true);
    expect(sameRegistrableDomain("192.168.1.1", "example.com")).toBe(false);
  });
});
