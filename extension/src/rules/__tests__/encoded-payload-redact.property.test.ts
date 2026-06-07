// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for `encoded-payload-redact`. The rule decides on
// three signals (encoding regex, length floor, decoded printable-ASCII
// ratio); fuzzing covers the boundary cases that hand-rolled examples
// keep missing.

import fc from "fast-check";

import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { encodedPayloadRedactRule } from "../encoded-payload-redact";

// Constants mirror the rule's thresholds — kept in sync by hand because
// they're not exported.
const MIN_BASE64_LENGTH = 120;
const MIN_HEX_LENGTH = 160;
const MIN_PERCENT_TRIPLETS = 20;
const MIN_DECODED_LENGTH = 40;

const PRINTABLE_LOW = 32;
const PRINTABLE_HIGH = 126;

function base64Encode(text: string): string {
  return btoa(text);
}

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

function hexEncode(text: string): string {
  let out = "";
  for (const char of text) {
    out += (char.codePointAt(0) ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

function percentEncode(text: string): string {
  let out = "";
  for (const char of text) {
    const code = (char.codePointAt(0) ?? 0).toString(16).padStart(2, "0");
    out += `%${code.toUpperCase()}`;
  }
  return out;
}

// Printable ASCII string long enough that any of the three encodings
// clears its length floor. 160 chars => base64 length 216 (≥120),
// hex length 320 (≥160), percent triplet count 160 (≥20). Decoded
// length 160 also clears the 40-byte minimum.
const printableTextArb = fc
  .stringMatching(/^[ -~]{160,200}$/)
  .filter((s) => s.length >= MIN_DECODED_LENGTH);

// Random bytes that mostly fall outside printable ASCII. We sample
// uniformly from 0..255 — printable-ASCII covers ~95/256 ≈ 37% of the
// range, well below the 0.85 ratio threshold.
const highEntropyBytesArb = fc
  .uint8Array({ minLength: 96, maxLength: 160 })
  .filter((bytes) => {
    let printable = 0;
    for (const b of bytes) {
      if (
        (b >= PRINTABLE_LOW && b <= PRINTABLE_HIGH) ||
        b === 9 ||
        b === 10 ||
        b === 13
      ) {
        printable++;
      }
    }
    return printable / bytes.length < 0.5;
  });

function applyToText(text: string): HTMLElement {
  document.body.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = text;
  document.body.append(p);
  encodedPayloadRedactRule.apply(document.body);
  return document.body;
}

afterEach(() => {
  encodedPayloadRedactRule.teardown();
  document.body.innerHTML = "";
});

describe("encoded-payload-redact (property)", () => {
  it("redacts base64-encoded printable text that clears the floor", () => {
    fc.assert(
      fc.property(printableTextArb, (text) => {
        const encoded = base64Encode(text);
        // Sanity — generator must produce inputs that clear the floor.
        expect(encoded.length).toBeGreaterThanOrEqual(MIN_BASE64_LENGTH);
        const body = applyToText(`prefix ${encoded} suffix`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
          "[encoded payload hidden]",
        );
        expect(body.textContent).not.toContain(encoded);
      }),
    );
  });

  it("redacts hex-encoded printable text that clears the floor", () => {
    fc.assert(
      fc.property(printableTextArb, (text) => {
        const encoded = hexEncode(text);
        expect(encoded.length).toBeGreaterThanOrEqual(MIN_HEX_LENGTH);
        const body = applyToText(`prefix ${encoded} suffix`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
          "[encoded payload hidden]",
        );
        expect(body.textContent).not.toContain(encoded);
      }),
    );
  });

  it("redacts percent-encoded printable text that clears the floor", () => {
    fc.assert(
      fc.property(printableTextArb, (text) => {
        const encoded = percentEncode(text);
        // Each char becomes one triplet.
        expect(text.length).toBeGreaterThanOrEqual(MIN_PERCENT_TRIPLETS);
        const body = applyToText(`prefix ${encoded} suffix`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
          "[encoded payload hidden]",
        );
        expect(body.textContent).not.toContain(encoded);
      }),
    );
  });

  it("leaves base64 of high-entropy bytes alone (hashes, binary blobs)", () => {
    fc.assert(
      fc.property(highEntropyBytesArb, (bytes) => {
        const encoded = base64EncodeBytes(bytes);
        // Length must clear the floor for the negative case to be
        // meaningful — otherwise the regex never matches and we'd be
        // proving the wrong thing.
        if (encoded.length < MIN_BASE64_LENGTH) {
          return;
        }
        const body = applyToText(`prefix ${encoded} suffix`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
        expect(body.textContent).toContain(encoded);
      }),
    );
  });

  it("preserves the surrounding prose when redacting", () => {
    fc.assert(
      fc.property(printableTextArb, (text) => {
        const encoded = base64Encode(text);
        const body = applyToText(`prefix ${encoded} suffix`);
        expect(body.textContent).toContain("prefix ");
        expect(body.textContent).toContain(" suffix");
      }),
    );
  });
});

// Render `encoded` inside `<p>`, split across N sibling `<span>` text
// nodes — the markdown-highlight / syntax-color shape that defeated the
// per-node length floors.
function applyToSpanSplitText(
  encoded: string,
  splits: readonly number[],
): HTMLElement {
  document.body.innerHTML = "";
  const p = document.createElement("p");
  let cursor = 0;
  for (const split of splits) {
    const span = document.createElement("span");
    span.textContent = encoded.slice(cursor, split);
    p.append(span);
    cursor = split;
  }
  const tail = document.createElement("span");
  tail.textContent = encoded.slice(cursor);
  p.append(tail);
  document.body.append(p);
  encodedPayloadRedactRule.apply(document.body);
  return document.body;
}

function sortedSplitsArb(length: number) {
  return fc
    .uniqueArray(fc.integer({ min: 1, max: length - 1 }), {
      minLength: 1,
      maxLength: 4,
    })
    .map((indices) => indices.toSorted((a, b) => a - b));
}

// Text-cipher helpers. Encode benign-prose generators into cipher form
// at test time so the source file holds only ciphertext or symbolic
// runs — adversarial phrasing never appears in plaintext.

const A_CODE = 65;
const a_CODE = 97;

function rot13(text: string): string {
  return text.replaceAll(/[a-zA-Z]/g, (c) => {
    const code = c.codePointAt(0) ?? 0;
    const base = code >= a_CODE ? a_CODE : A_CODE;
    return String.fromCodePoint(((code - base + 13) % 26) + base);
  });
}

function atbash(text: string): string {
  return text.replaceAll(/[a-zA-Z]/g, (c) => {
    const code = c.codePointAt(0) ?? 0;
    const base = code >= a_CODE ? a_CODE : A_CODE;
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

// Vocabulary of common English function words drawn from the rule's
// internal qualifier set. Built-in fast-check generators can't conjure
// "looks English to the rule" prose, so the property tests sample from
// this list to build sentences guaranteed to clear the common-word
// floor — no need to enumerate the rule's set in two places, just keep
// a representative subset here.
const COMMON_WORD_VOCAB = [
  "the",
  "and",
  "you",
  "for",
  "this",
  "that",
  "with",
  "have",
  "from",
  "when",
  "what",
  "should",
  "could",
  "would",
  "must",
  "your",
  "their",
  "every",
  "other",
  "every",
] as const;

const commonProseArb = fc
  .array(fc.constantFrom(...COMMON_WORD_VOCAB), {
    minLength: 20,
    maxLength: 40,
  })
  .map((words) => words.join(" "))
  .filter((s) => s.length >= 80);

// Random letters A..Z. Filter out runs that are strict alphabet
// sequences (ABCDE…) — the rule treats those as instructional content.
const natoLettersArb = fc
  .array(
    fc
      .integer({ min: 0, max: 25 })
      .map((i) => String.fromCodePoint(A_CODE + i)),
    { minLength: 10, maxLength: 24 },
  )
  .map((letters) => letters.join(""))
  .filter((letters) => {
    for (let i = 1; i < letters.length; i++) {
      const previous = letters.codePointAt(i - 1) ?? 0;
      const current = letters.codePointAt(i) ?? 0;
      if (current - previous !== 1) {
        return true;
      }
    }
    return false;
  });

describe("encoded-payload-redact text ciphers (property)", () => {
  it("redacts ROT13-encoded common-word prose", () => {
    fc.assert(
      fc.property(commonProseArb, (prose) => {
        const ciphertext = rot13(prose);
        // Parens delimit the cipher candidate so surrounding context
        // doesn't get pulled into the match (`(` is outside the
        // candidate's allowed char class).
        const body = applyToText(`(prefix) ${ciphertext} (suffix)`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
          "[encoded payload hidden]",
        );
        expect(body.textContent).not.toContain(ciphertext);
      }),
    );
  });

  it("redacts Atbash-encoded common-word prose", () => {
    fc.assert(
      fc.property(commonProseArb, (prose) => {
        const ciphertext = atbash(prose);
        const body = applyToText(`(prefix) ${ciphertext} (suffix)`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
          "[encoded payload hidden]",
        );
        expect(body.textContent).not.toContain(ciphertext);
      }),
    );
  });

  it("redacts reversed common-word prose", () => {
    fc.assert(
      fc.property(commonProseArb, (prose) => {
        const ciphertext = reverseText(prose);
        const body = applyToText(`(prefix) ${ciphertext} (suffix)`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
          "[encoded payload hidden]",
        );
        expect(body.textContent).not.toContain(ciphertext);
      }),
    );
  });

  it("redacts NATO-phonetic runs of >= 10 non-sequential letters", () => {
    fc.assert(
      fc.property(natoLettersArb, (letters) => {
        const ciphertext = natoEncode(letters);
        const body = applyToText(`(prefix) ${ciphertext} (suffix)`);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
          "[encoded payload hidden]",
        );
        expect(body.textContent).not.toContain(ciphertext);
      }),
    );
  });

  it("leaves plain English common-word prose alone (no cipher false-fire)", () => {
    fc.assert(
      fc.property(commonProseArb, (prose) => {
        const body = applyToText(prose);
        expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
        expect(body.textContent).toContain(prose);
      }),
    );
  });
});

describe("encoded-payload-redact cross-node detection (property)", () => {
  it("redacts base64 payloads regardless of how they're split across sibling spans", () => {
    fc.assert(
      fc.property(
        printableTextArb.chain((text) => {
          const encoded = base64Encode(text);
          return fc.tuple(
            fc.constant(encoded),
            sortedSplitsArb(encoded.length),
          );
        }),
        ([encoded, splits]) => {
          const body = applyToSpanSplitText(encoded, splits);
          expect(body.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
            "[encoded payload hidden]",
          );
          expect(body.textContent).not.toContain(encoded);
        },
      ),
    );
  });

  // Payloads whose ENCODED length is just over the base64 floor; splitting
  // such a payload in half puts each half below the floor, so the only way
  // the rule could redact would be by concatenating across the block
  // boundary (which it must not do).
  const justOverFloorTextArb = fc
    .stringMatching(/^[ -~]{91,130}$/)
    .filter((s) => s.length >= MIN_DECODED_LENGTH);

  it("never redacts a payload whose halves fall below the floor when split across two paragraphs", () => {
    fc.assert(
      fc.property(justOverFloorTextArb, (text) => {
        const encoded = base64Encode(text);
        // Sanity: the full thing IS detectable when not split.
        expect(encoded.length).toBeGreaterThanOrEqual(MIN_BASE64_LENGTH);
        const mid = Math.floor(encoded.length / 2);
        // Each half must sit below the floor, otherwise the rule could
        // legitimately fire on one half alone — not a cross-block leak.
        expect(mid).toBeLessThan(MIN_BASE64_LENGTH);

        document.body.innerHTML = "";
        const a = document.createElement("p");
        const b = document.createElement("p");
        a.textContent = encoded.slice(0, mid);
        b.textContent = encoded.slice(mid);
        document.body.append(a, b);
        encodedPayloadRedactRule.apply(document.body);

        expect(document.body.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
      }),
    );
  });
});
