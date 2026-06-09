// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { __resetRouteChangeForTesting } from "../../lib/route-change";
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

// Benign English sentence rich in distinct common function words. Used as
// the *cleartext* for the text-cipher positive cases: the ciphers
// encode this string at test time so the source file holds only the
// resulting gibberish (ROT13/Atbash) or symbolic form (NATO/Morse),
// keeping adversarial phrasing out of the file while still exercising
// the decoded common-word qualifier (>= 3 distinct hits).
const CIPHER_CLEARTEXT =
  "you can see this from above and you know what should come next " +
  "when the time comes for you to look around";

function rot13(text: string): string {
  const A = 65;
  const a = 97;
  return text.replaceAll(/[a-zA-Z]/g, (c) => {
    const code = c.codePointAt(0) ?? 0;
    const base = code >= a ? a : A;
    return String.fromCodePoint(((code - base + 13) % 26) + base);
  });
}

function atbash(text: string): string {
  const A = 65;
  const a = 97;
  return text.replaceAll(/[a-zA-Z]/g, (c) => {
    const code = c.codePointAt(0) ?? 0;
    const base = code >= a ? a : A;
    return String.fromCodePoint(26 - 1 - (code - base) + base);
  });
}

function reverseText(text: string): string {
  // `charAt` (vs `text[i]`) keeps the result `string` rather than
  // `string | undefined`. Test inputs are pure ASCII so no
  // astral-pair correctness concern with code-unit iteration.
  let out = "";
  for (let i = text.length - 1; i >= 0; i--) {
    out += text.charAt(i);
  }
  return out;
}

const LEET_ENCODE: Record<string, string> = {
  o: "0",
  i: "1",
  e: "3",
  a: "4",
  s: "5",
  t: "7",
  b: "8",
};

function leetEncode(text: string): string {
  return text.replaceAll(
    /[oieasbtOIEASBT]/g,
    (c) => LEET_ENCODE[c.toLowerCase()] ?? c,
  );
}

const NATO_ENCODE: Record<string, string> = {
  A: "alpha",
  B: "bravo",
  C: "charlie",
  D: "delta",
  E: "echo",
  F: "foxtrot",
  G: "golf",
  H: "hotel",
  I: "india",
  J: "juliet",
  K: "kilo",
  L: "lima",
  M: "mike",
  N: "november",
  O: "oscar",
  P: "papa",
  Q: "quebec",
  R: "romeo",
  S: "sierra",
  T: "tango",
  U: "uniform",
  V: "victor",
  W: "whiskey",
  X: "xray",
  Y: "yankee",
  Z: "zulu",
};

function natoEncode(letters: string): string {
  const out: string[] = [];
  for (const char of letters.toUpperCase()) {
    const word = NATO_ENCODE[char];
    if (word) {
      out.push(word);
    }
  }
  return out.join(" ");
}

const MORSE_ENCODE: Record<string, string> = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
};

function morseEncode(text: string): string {
  return text
    .toUpperCase()
    .split(" ")
    .map((word) => {
      const symbols: string[] = [];
      for (const c of word) {
        const sym = MORSE_ENCODE[c];
        if (sym) {
          symbols.push(sym);
        }
      }
      return symbols.join(" ");
    })
    .filter(Boolean)
    .join(" / ");
}

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
  history.replaceState(null, "", "/initial");
  __resetRouteChangeForTesting();
});

afterEach(() => {
  encodedPayloadRedactRule.teardown();
  __resetRouteChangeForTesting();
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

describe("encoded-payload-redact cross-node detection", () => {
  // Splitting an encoded payload across sibling text nodes (e.g. wrapped
  // in highlight `<span>`s after a markdown render) used to defeat the
  // per-node length floors — each fragment fell below MIN_BASE64_LENGTH
  // even when the full concatenation cleared it. Audit gap #203/#7.
  it("redacts a long base64 run split across two sibling spans", () => {
    const payload = base64Encode(LONG_PROSE);
    const half = Math.floor(payload.length / 2);
    const first = payload.slice(0, half);
    const second = payload.slice(half);
    document.body.innerHTML = `<p><span>${first}</span><span>${second}</span></p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    expect(document.body.textContent).not.toContain(payload);
  });

  it("redacts a long hex run split across sibling spans", () => {
    const payload = hexEncode(LONG_HEX_PROSE);
    const a = payload.slice(0, 80);
    const b = payload.slice(80);
    document.body.innerHTML = `<p><span>${a}</span><span>${b}</span></p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
  });

  it("redacts a long percent-encoded run split across sibling spans", () => {
    const payload = percentEncode(LONG_PERCENT_PROSE);
    const mid = Math.floor(payload.length / 2);
    // Slice on a triplet boundary so each half is still well-formed.
    const a = payload.slice(0, mid - (mid % 3));
    const b = payload.slice(mid - (mid % 3));
    document.body.innerHTML = `<p><span>${a}</span><span>${b}</span></p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
  });

  it("does not redact a payload split across a <br>", () => {
    const payload = base64Encode(LONG_PROSE);
    const half = Math.floor(payload.length / 2);
    document.body.innerHTML = `<p>${payload.slice(0, half)}<br>${payload.slice(half)}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not redact a payload split across two block elements", () => {
    const payload = base64Encode(LONG_PROSE);
    const half = Math.floor(payload.length / 2);
    document.body.innerHTML = `<div>${payload.slice(0, half)}</div><div>${payload.slice(half)}</div>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });
});

describe("encoded-payload-redact text-cipher positive cases", () => {
  it("redacts a ROT13-encoded English sentence", () => {
    const ciphertext = rot13(CIPHER_CLEARTEXT);
    // Parens break the cipher candidate regex (`(` and `)` aren't in its
    // char class), so the surrounding prose stays as its own text run.
    document.body.innerHTML = `<p>(prefix) ${ciphertext} (suffix)</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    expect(document.body.textContent).not.toContain(ciphertext);
    expect(document.body.textContent).toContain("(prefix)");
    expect(document.body.textContent).toContain("(suffix)");
  });

  it("redacts an Atbash-encoded English sentence", () => {
    const ciphertext = atbash(CIPHER_CLEARTEXT);
    document.body.innerHTML = `<p>${ciphertext}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    expect(document.body.textContent).not.toContain(ciphertext);
  });

  it("redacts a reversed English sentence", () => {
    const ciphertext = reverseText(CIPHER_CLEARTEXT);
    document.body.innerHTML = `<p>${ciphertext}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    expect(document.body.textContent).not.toContain(ciphertext);
  });

  it("redacts a leetspeak-encoded English sentence", () => {
    const ciphertext = leetEncode(CIPHER_CLEARTEXT);
    document.body.innerHTML = `<p>${ciphertext}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    expect(document.body.textContent).not.toContain(ciphertext);
  });

  it("redacts a NATO-phonetic spelling run of >= 10 non-sequential letters", () => {
    // Spells THEQUICKBROWNFOX — 16 NATO tokens, not an alphabet sequence.
    const ciphertext = natoEncode("thequickbrownfox");
    document.body.innerHTML = `<p>${ciphertext}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    expect(document.body.textContent).not.toContain(ciphertext);
  });

  it("redacts a Morse-encoded English phrase", () => {
    const ciphertext = morseEncode(
      "the quick brown fox jumps over the lazy dog and you can see this",
    );
    document.body.innerHTML = `<p>${ciphertext}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    expect(document.body.textContent).not.toContain(ciphertext);
  });
});

describe("encoded-payload-redact text-cipher false-positive guards", () => {
  it("leaves ordinary English prose alone (no cipher fires)", () => {
    const prose =
      "You can see this paragraph from the homepage and you know what " +
      "should come next when the time comes for you to look around.";
    document.body.innerHTML = `<p>${prose}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(prose);
  });

  it("leaves a NATO alphabet drill (A..J) visible", () => {
    // Sequential NATO spelling — the rule treats this as instructional
    // content (alphabet page / signal-corps drill), not a payload.
    const drill =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    document.body.innerHTML = `<p>${drill}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(drill);
  });

  it("leaves a short ROT13 snippet (under 80-char floor) alone", () => {
    const ciphertext = rot13("you can see this from above");
    document.body.innerHTML = `<p>${ciphertext}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("leaves text with a single incidental digit alone (leet floor)", () => {
    // Product copy with one leet-shape digit ("1") — below the
    // MIN_LEET_SUBSTITUTIONS=4 floor, so the leet detector skips it.
    const prose =
      "Limited time offer for 1 day only: get our flagship product before midnight tonight and have it shipped tomorrow.";
    document.body.innerHTML = `<p>${prose}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("leaves English prose carrying a leet-shaped version number alone", () => {
    // Real changelog copy: a version string like "11.16.0" supplies four
    // leet-shape digits (1,1,1,0), clearing the substitution-count floor.
    // The text is already English, so `deleet` leaves it readable and it
    // would clear the common-word floor on its own — the already-English
    // gate is what keeps it visible. (github.blog npm v12 changelog FP.)
    const prose =
      "Upgrade to npm 11.16.0 or later, run your normal install, and " +
      "review the warnings.";
    document.body.innerHTML = `<p>${prose}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(prose);
  });

  it("leaves a sparse dot/dash ASCII-art run alone (Morse valid-ratio floor)", () => {
    // Repeating `--- . --- . ---` style separators — many tokens but
    // most decode to letters with no decoded common-word hits, and the
    // chosen pattern is below the valid-ratio + common-word qualifiers.
    const ascii = "... --- ... --- ... --- ... --- ... --- ... --- ...";
    document.body.innerHTML = `<p>${ascii}</p>`;
    encodedPayloadRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("leaves a single NATO word in prose alone (below 10-word floor)", () => {
    const prose =
      "Our flagship product is called Tango and customers love it for the quality of the materials.";
    document.body.innerHTML = `<p>${prose}</p>`;
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

  it("teardown aborts the in-flight chunked walk", () => {
    const payload = base64Encode(LONG_PROSE);
    document.body.innerHTML = Array.from(
      { length: 200 },
      (_, i) => `<p>blob-${i}: ${payload}</p>`,
    ).join("");

    encodedPayloadRedactRule.apply(document.body);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );

    encodedPayloadRedactRule.teardown();
    jest.advanceTimersByTime(0);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );
  });

  it("route change aborts the in-flight chunked walk", () => {
    const payload = base64Encode(LONG_PROSE);
    document.body.innerHTML = Array.from(
      { length: 200 },
      (_, i) => `<p>blob-${i}: ${payload}</p>`,
    ).join("");

    encodedPayloadRedactRule.apply(document.body);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );

    history.replaceState(null, "", "/new-route");
    globalThis.dispatchEvent(new Event("popstate"));
    jest.advanceTimersByTime(0);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );
  });
});

// Loads a fresh copy of the rule with `process.env.EXTENSION_RULE_OPTIONS`
// set to the given sub-rule overrides. The rule reads its options once at
// module init via `getRuleOptions`, so testing the toggles or threshold
// tuning requires a fresh module graph per override. Sub-rule values may be
// a boolean (bare-boolean shorthand for `{ enabled }`) or an object with
// `enabled` and/or named threshold overrides — same shape as the
// build-time override file (ADR-0016, ADR-0017).
async function loadRuleWithSubRuleOverrides(
  subRules: Record<string, boolean | Record<string, number | boolean>>,
): Promise<typeof encodedPayloadRedactRule> {
  const previous = process.env.EXTENSION_RULE_OPTIONS;
  process.env.EXTENSION_RULE_OPTIONS = JSON.stringify({
    "encoded-payload-redact": { subRules },
  });
  let reloaded: typeof encodedPayloadRedactRule | undefined;
  await jest.isolateModulesAsync(async () => {
    // The rule module's top-level `getRuleOptions` call reads
    // EXTENSION_RULE_OPTIONS at evaluation time, so each override needs a
    // fresh module graph.
    const ruleModule = await import("../encoded-payload-redact");
    reloaded = ruleModule.encodedPayloadRedactRule;
  });
  if (previous === undefined) {
    delete process.env.EXTENSION_RULE_OPTIONS;
  } else {
    process.env.EXTENSION_RULE_OPTIONS = previous;
  }
  if (!reloaded) {
    throw new Error("Failed to reload encoded-payload-redact rule");
  }
  return reloaded;
}

describe("encoded-payload-redact sub-rule toggles", () => {
  it("with leetspeak disabled, leet payloads pass through unchanged", async () => {
    const rule = await loadRuleWithSubRuleOverrides({ leetspeak: false });
    const ciphertext = leetEncode(CIPHER_CLEARTEXT);
    document.body.innerHTML = `<p>${ciphertext}</p>`;
    rule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(ciphertext);
    rule.teardown();
  });

  it("with leetspeak disabled, base64 payloads still redact (sanity)", async () => {
    const rule = await loadRuleWithSubRuleOverrides({ leetspeak: false });
    const payload = base64Encode(LONG_PROSE);
    document.body.innerHTML = `<p>${payload}</p>`;
    rule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    rule.teardown();
  });

  it("with nato and morse disabled, those candidates pass through", async () => {
    const rule = await loadRuleWithSubRuleOverrides({
      nato: false,
      morse: false,
    });
    const natoText = natoEncode("thequickbrownfox");
    const morseText = morseEncode(
      "you can see this from above and you know what",
    );
    document.body.innerHTML = `<p>${natoText}</p><p>${morseText}</p>`;
    rule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(natoText);
    rule.teardown();
  });

  it("with substitutionCipher disabled, ROT13 / Atbash / reverse all pass through", async () => {
    const rule = await loadRuleWithSubRuleOverrides({
      substitutionCipher: false,
    });
    const rot = rot13(CIPHER_CLEARTEXT);
    const ats = atbash(CIPHER_CLEARTEXT);
    const rev = reverseText(CIPHER_CLEARTEXT);
    document.body.innerHTML = `<p>${rot}</p><p>${ats}</p><p>${rev}</p>`;
    rule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`).length).toBe(0);
    rule.teardown();
  });

  it("with all sub-rules disabled, the rule produces no matches", async () => {
    const rule = await loadRuleWithSubRuleOverrides({
      base64: false,
      hex: false,
      percent: false,
      substitutionCipher: false,
      leetspeak: false,
      nato: false,
      morse: false,
    });
    document.body.innerHTML = `
      <p>${base64Encode(LONG_PROSE)}</p>
      <p>${hexEncode(LONG_HEX_PROSE)}</p>
      <p>${percentEncode(LONG_PERCENT_PROSE)}</p>
      <p>${rot13(CIPHER_CLEARTEXT)}</p>
      <p>${leetEncode(CIPHER_CLEARTEXT)}</p>
      <p>${natoEncode("thequickbrownfox")}</p>
    `;
    rule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`).length).toBe(0);
    rule.teardown();
  });
});

describe("encoded-payload-redact threshold tuning", () => {
  it("lowering nato.minWords matches a previously too-short candidate", async () => {
    // Six NATO tokens — under the default minWords=10, so the default build
    // leaves it alone. With minWords=6 the same run becomes a payload.
    const shortNato = natoEncode("FOXBAT");
    document.body.innerHTML = `<p>${shortNato}</p>`;

    const defaultRule = await loadRuleWithSubRuleOverrides({});
    defaultRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    defaultRule.teardown();

    document.body.innerHTML = `<p>${shortNato}</p>`;
    const tunedRule = await loadRuleWithSubRuleOverrides({
      nato: { minWords: 6 },
    });
    tunedRule.apply(document.body);
    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[encoded payload hidden]",
    );
    tunedRule.teardown();
  });

  it("raising base64.minLength leaves a previously-matching payload visible", async () => {
    const payload = base64Encode(LONG_PROSE);
    document.body.innerHTML = `<p>${payload}</p>`;

    const tunedRule = await loadRuleWithSubRuleOverrides({
      base64: { minLength: payload.length + 1 },
    });
    tunedRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(payload);
    tunedRule.teardown();
  });

  it("raising leetspeak.minCommonWords rejects a previously-matching payload", async () => {
    const ciphertext = leetEncode(CIPHER_CLEARTEXT);
    document.body.innerHTML = `<p>${ciphertext}</p>`;

    // CIPHER_CLEARTEXT carries ~12 distinct common-word hits after deleet;
    // raising the floor above that count rejects the payload.
    const tunedRule = await loadRuleWithSubRuleOverrides({
      leetspeak: { minCommonWords: 50 },
    });
    tunedRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(ciphertext);
    tunedRule.teardown();
  });
});
