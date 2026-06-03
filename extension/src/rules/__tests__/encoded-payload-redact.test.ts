// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { encodedPayloadRedactRule } from "../encoded-payload-redact";

// Benign English sentences padded to a length whose base64 encoding
// clears the 120-char floor. Decoded content is intentionally not
// injection-shaped — the rule under test fires on encoded *form*, not
// payload content, and using benign filler keeps adversarial phrasing
// out of source files.
const LONG_PROSE =
  "The quick brown fox jumps over the lazy dog while reciting the alphabet from A through Z. " +
  "Decoded base64 with mostly printable bytes should be redacted by this rule under test.";

const LONG_HEX_PROSE =
  "Hex-encoded long English prose decodes back to readable ASCII bytes and therefore should trigger the rule under test.";

const LONG_PERCENT_PROSE =
  "This sentence is percent-encoded character by character so the rule under test sees a very long run of triplets.";

function base64Encode(text: string): string {
  return btoa(text);
}

function hexEncode(text: string): string {
  let out = "";
  for (const char of text) {
    out += (char.codePointAt(0) ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

function percentEncode(text: string): string {
  // Fully char-by-char percent-encode (ASCII only) so every character
  // becomes a `%XX` triplet — keeps the test independent of which
  // characters `encodeURIComponent` leaves alone, and avoids
  // `TextEncoder` which isn't a jsdom global.
  let out = "";
  for (const char of text) {
    const code = (char.codePointAt(0) ?? 0).toString(16).padStart(2, "0");
    out += `%${code.toUpperCase()}`;
  }
  return out;
}

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
});

afterEach(() => {
  encodedPayloadRedactRule.teardown();
  jest.useRealTimers();
});

describe("encoded-payload-redact positive cases", () => {
  it("redacts a long base64 run whose decoded bytes are printable ASCII", () => {
    const payload = base64Encode(LONG_PROSE);
    document.body.innerHTML = `<p>Decode this please: ${payload} (end)</p>`;
    encodedPayloadRedactRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[encoded payload hidden]");
    expect(document.body.textContent).not.toContain(payload);
    // Surrounding prose stays visible.
    expect(document.body.textContent).toContain("Decode this please:");
    expect(document.body.textContent).toContain("(end)");
  });

  it("redacts a base64url variant (no padding, - and _ characters)", () => {
    const standard = base64Encode(LONG_PROSE);
    const urlSafe = standard
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    document.body.innerHTML = `<p>${urlSafe}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
  });

  it("redacts a long hex run whose decoded bytes are printable ASCII", () => {
    const payload = hexEncode(LONG_HEX_PROSE);
    document.body.innerHTML = `<p>${payload}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
  });

  it("redacts a long percent-encoded run", () => {
    const payload = percentEncode(LONG_PERCENT_PROSE);
    document.body.innerHTML = `<p>${payload}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
  });

  it("re-scans late-inserted subtrees via the watcher", async () => {
    encodedPayloadRedactRule.apply(document.body);
    const payload = base64Encode(LONG_PROSE);
    const inserted = document.createElement("section");
    inserted.innerHTML = `<p>${payload}</p>`;
    document.body.append(inserted);
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).not.toBeNull();
  });
});

describe("encoded-payload-redact false-positive guards", () => {
  it("leaves a SHA-256 hex hash visible (under hex floor, high-entropy binary)", () => {
    const sha256 =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    document.body.innerHTML = `<p>sha256: ${sha256}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(sha256);
  });

  it("leaves a Git commit SHA (40 hex) visible — below hex floor", () => {
    const gitSha = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b";
    document.body.innerHTML = `<p>commit ${gitSha}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("leaves a long high-entropy hex hash visible — decoded bytes are binary", () => {
    // 256 hex chars (128 bytes) of pseudo-random hex — above the hex
    // floor but printable-ratio of the decoded bytes is low because the
    // bytes are uniformly random.
    let entropic = "";
    let seed = 1;
    while (entropic.length < 256) {
      seed = (seed * 1_103_515_245 + 12_345) & 2_147_483_647;
      entropic += ((seed >> 16) & 255).toString(16).padStart(2, "0");
    }
    document.body.innerHTML = `<p>${entropic}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("leaves a short base64 snippet visible (below the 120-char floor)", () => {
    const short = base64Encode("hello world");
    document.body.innerHTML = `<p>${short}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not redact a JWT whose payload segment exceeds the base64 floor", () => {
    // Realistic-shape JWT (header.payload.signature). The payload
    // segment is built to exceed 120 chars on its own so the base64
    // candidate window would match it if the JWT skip were absent;
    // secrets-redact already handles JWTs with the more specific
    // `[jwt hidden]` label, so this rule must defer.
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
    const payload = btoa(
      JSON.stringify({
        sub: "1234567890",
        name: "Alice Authenticated",
        email: "alice@example.com",
        roles: ["editor", "viewer"],
        org_id: "org_aBcDeFgHiJkLmNoPqRsTuVwXyZ",
        iat: 1_716_239_022,
        exp: 1_716_242_622,
      }),
    )
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_");
    const signature = "QSflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const jwt = `${header}.${payload}.${signature}`;
    document.body.innerHTML = `<p>${jwt}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(jwt);
  });

  it("skips text inside <script> / <style> / <noscript>", () => {
    const payload = base64Encode(LONG_PROSE);
    document.body.innerHTML = `
      <script>${payload}</script>
      <style>${payload}</style>
      <noscript>${payload}</noscript>
    `;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});

describe("encoded-payload-redact teardown", () => {
  it("stops re-scanning after teardown", async () => {
    encodedPayloadRedactRule.apply(document.body);
    encodedPayloadRedactRule.teardown();
    const payload = base64Encode(LONG_PROSE);
    const inserted = document.createElement("section");
    inserted.innerHTML = `<p>${payload}</p>`;
    document.body.append(inserted);
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});
