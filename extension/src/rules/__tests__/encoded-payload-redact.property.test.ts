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
