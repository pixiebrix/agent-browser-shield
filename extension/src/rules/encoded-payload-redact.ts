// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Redact long base64 / hex / percent-encoded runs in text nodes — the
// "decode this and follow it" carrier for indirect prompt injection. An
// attacker drops an encoded blob into a page region the agent reads
// (review body, product description, social embed caption); a human skims
// past it as noise but an LLM agent may helpfully decode the bytes and
// treat the result as content or as an instruction it should obey.
//
// Detection runs three candidate windows per text node — base64/base64url,
// hex, percent-encoded — each gated by a length floor that sits above
// common hash sizes (SHA-256 = 64 hex, SHA-512 = 128 hex). The decisive
// filter is the *decoded printable-ASCII ratio*: instructions decode to
// readable text (ratio ~1.0); hashes, fingerprints, and image bytes decode
// to high-entropy binary (ratio well below 0.85). JWTs are skipped so the
// more specific `secrets-redact` label wins on overlap.
//
// Matches are replaced inline with a click-to-reveal placeholder. False
// positives cost one click, not lost data.

import { ReusableAbortController } from "abort-utils";
import type { InlineMatch } from "../lib/placeholder";
import { replaceMatchesInTextNode } from "../lib/placeholder";
import { subscribeRouteChange } from "../lib/route-change";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { walkTextNodesChunked } from "../lib/yielding-text-walk";
import type { Rule } from "./types";

const RULE_ID = "encoded-payload-redact" as const;

// Length floors per encoding. Tuned to sit above common hash/fingerprint
// sizes (SHA-512 hex = 128, so 160 leaves headroom) and below typical
// instruction-payload sizes seen in indirect-injection samples.
const MIN_BASE64_LENGTH = 120;
const MIN_HEX_LENGTH = 160;
const MIN_PERCENT_TRIPLETS = 20;

// Reject text nodes shorter than the smallest candidate window — cheap
// per-node early-out.
const MIN_TEXT_LENGTH = MIN_BASE64_LENGTH;

// Decoded byte stream must be this fraction printable ASCII (space..~,
// plus \t \n \r) to count as "decodes to readable text". Hashes and
// binary blobs sit well below; UTF-8 prose (even with curly quotes /
// em-dashes whose continuation bytes are non-ASCII) clears it because
// the bulk of the bytes are still printable ASCII.
const PRINTABLE_RATIO_THRESHOLD = 0.85;

// After decoding, require at least this many bytes of mostly-printable
// output. Filters short hashes that happen to score well on the ratio.
const MIN_DECODED_LENGTH = 40;

// JWT shape — `secrets-redact` redacts these with a `[jwt hidden]`
// label. Skip so we don't double-process or override the more specific
// label.
const JWT_RE =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

// Candidate windows. Each is a run of the encoding's alphabet long
// enough to clear the per-encoding floor; the printable-ratio filter
// decides whether the run is a payload or random noise.
const BASE64_CANDIDATE = new RegExp(
  `[A-Za-z0-9+/=_-]{${MIN_BASE64_LENGTH},}`,
  "g",
);
const HEX_CANDIDATE = new RegExp(
  String.raw`\b[0-9a-fA-F]{${MIN_HEX_LENGTH},}\b`,
  "g",
);
// Percent-encoded: a run of `%XX` triplets (possibly interleaved with
// other URL-safe characters) where the total triplet count clears the
// floor. We match one `%XX` at a time and merge adjacent runs in JS.
const PERCENT_TRIPLET = /%[0-9A-Fa-f]{2}/g;

// Printable ASCII range (space..tilde) plus tab / newline / carriage
// return. Decimal literals so neither Biome's number-literal casing nor
// the unicorn `prefer-string-raw`-adjacent hex-case rule have anything
// to argue about.
const PRINTABLE_LOW = 32; // ' '
const PRINTABLE_HIGH = 126; // '~'

function isPrintableByte(byte: number): boolean {
  return (
    (byte >= PRINTABLE_LOW && byte <= PRINTABLE_HIGH) ||
    byte === 9 ||
    byte === 10 ||
    byte === 13
  );
}

function printableRatio(bytes: Uint8Array): number {
  if (bytes.length === 0) {
    return 0;
  }
  let printable = 0;
  for (const byte of bytes) {
    if (isPrintableByte(byte)) {
      printable++;
    }
  }
  return printable / bytes.length;
}

function decodeBase64(candidate: string): Uint8Array | null {
  // Normalize base64url to base64 so atob accepts it. Pad if missing.
  let normalized = candidate.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4;
  switch (padding) {
    case 2: {
      normalized += "==";

      break;
    }
    case 3: {
      normalized += "=";

      break;
    }
    case 1: {
      // Invalid length; atob would throw.
      return null;
    }
    // No default
  }
  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      // codePointAt is the unicorn-blessed accessor; for the ASCII-range
      // bytes atob produces it's equivalent to charCodeAt.
      bytes[i] = binary.codePointAt(i) ?? 0;
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeHex(candidate: string): Uint8Array | null {
  if (candidate.length % 2 !== 0) {
    return null;
  }
  // Pure-numeric hex (a long decimal number that happens to be valid
  // hex) is not a payload. Require at least one a–f character.
  if (!/[a-fA-F]/.test(candidate)) {
    return null;
  }
  const bytes = new Uint8Array(candidate.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const high = Number.parseInt(candidate[i * 2] ?? "", 16);
    const low = Number.parseInt(candidate[i * 2 + 1] ?? "", 16);
    if (Number.isNaN(high) || Number.isNaN(low)) {
      return null;
    }
    bytes[i] = (high << 4) | low;
  }
  return bytes;
}

function decodePercent(candidate: string): Uint8Array | null {
  // Each `%XX` triplet IS a byte — parse them directly so the printable
  // check operates on the raw byte stream (UTF-8 multibyte sequences
  // get each continuation byte counted individually, which is what we
  // want for the ratio).
  const triplets = candidate.match(PERCENT_TRIPLET) ?? [];
  if (triplets.length === 0) {
    return null;
  }
  const bytes = new Uint8Array(triplets.length);
  for (const [i, triplet] of triplets.entries()) {
    bytes[i] = Number.parseInt(triplet.slice(1), 16);
  }
  return bytes;
}

function qualifies(decoded: Uint8Array | null): boolean {
  if (decoded === null) {
    return false;
  }
  if (decoded.length < MIN_DECODED_LENGTH) {
    return false;
  }
  return printableRatio(decoded) >= PRINTABLE_RATIO_THRESHOLD;
}

function collectJwtRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const m of text.matchAll(JWT_RE)) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function overlapsAny(
  start: number,
  end: number,
  ranges: readonly (readonly [number, number])[],
): boolean {
  return ranges.some(([rs, re]) => start < re && end > rs);
}

function collectBase64(
  text: string,
  jwtRanges: readonly (readonly [number, number])[],
  matches: InlineMatch[],
): void {
  for (const m of text.matchAll(BASE64_CANDIDATE)) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlapsAny(start, end, jwtRanges)) {
      continue;
    }
    if (qualifies(decodeBase64(m[0]))) {
      matches.push({ start, end, label: "[encoded payload hidden]" });
    }
  }
}

function collectHex(text: string, matches: InlineMatch[]): void {
  for (const m of text.matchAll(HEX_CANDIDATE)) {
    if (qualifies(decodeHex(m[0]))) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        label: "[encoded payload hidden]",
      });
    }
  }
}

function collectPercentRuns(
  text: string,
): Array<{ start: number; end: number }> {
  // Group adjacent `%XX` triplets into runs. Triplets separated by other
  // characters (a single letter, a digit) still belong to the same
  // logical encoded token — e.g. `foo%20bar%20baz`. We allow up to
  // `MAX_GAP` non-triplet characters between consecutive triplets before
  // closing the run.
  const MAX_GAP = 8;
  const runs: Array<{ start: number; end: number; count: number }> = [];
  let current: { start: number; end: number; count: number } | null = null;
  for (const m of text.matchAll(PERCENT_TRIPLET)) {
    const start = m.index;
    const end = start + 3;
    if (current === null) {
      current = { start, end, count: 1 };
      continue;
    }
    if (start - current.end <= MAX_GAP) {
      current.end = end;
      current.count++;
    } else {
      runs.push(current);
      current = { start, end, count: 1 };
    }
  }
  if (current !== null) {
    runs.push(current);
  }
  return runs
    .filter((run) => run.count >= MIN_PERCENT_TRIPLETS)
    .map(({ start, end }) => ({ start, end }));
}

function collectPercent(text: string, matches: InlineMatch[]): void {
  for (const run of collectPercentRuns(text)) {
    const slice = text.slice(run.start, run.end);
    if (qualifies(decodePercent(slice))) {
      matches.push({
        start: run.start,
        end: run.end,
        label: "[encoded payload hidden]",
      });
    }
  }
}

function collectMatches(text: string): InlineMatch[] {
  const matches: InlineMatch[] = [];
  const jwtRanges = collectJwtRanges(text);
  collectBase64(text, jwtRanges, matches);
  collectHex(text, matches);
  collectPercent(text, matches);

  // Sort by start, then prefer the longest on ties so a base64 candidate
  // wins over a hex prefix of the same span. Merge by dropping any match
  // whose start falls inside the previous match's range.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: InlineMatch[] = [];
  for (const match of matches) {
    const last = merged.at(-1);
    if (last && match.start < last.end) {
      continue;
    }
    merged.push(match);
  }
  return merged;
}

// See pii-redact for lifecycle rationale.
const lifecycle = new ReusableAbortController();
let unsubscribeRouteChange: (() => void) | null = null;

function scanAndMask(root: ParentNode): void {
  const signal = lifecycle.signal;
  walkTextNodesChunked(root, {
    signal,
    minLength: MIN_TEXT_LENGTH,
    process: (chunk) => {
      for (const node of chunk) {
        const matches = collectMatches(node.nodeValue ?? "");
        if (matches.length > 0) {
          replaceMatchesInTextNode(node, matches, RULE_ID);
        }
      }
    },
  });
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndMask(root);
    }
  },
});

function apply(root: ParentNode): void {
  unsubscribeRouteChange ??= subscribeRouteChange(() => {
    lifecycle.abortAndReset();
  });
  scanAndMask(root);
  watcher.start(root);
}

export const encodedPayloadRedactRule = {
  id: RULE_ID,
  label: "Redact Encoded Payloads",
  description:
    "Redact long base64, hex, or percent-encoded runs in text nodes whose decoded bytes are mostly readable text. Defends against the 'decode this and follow it' indirect-injection carrier; hashes, fingerprints, and binary blobs are left alone.",
  apply,
  teardown: () => {
    watcher.stop();
    lifecycle.abortAndReset();
    unsubscribeRouteChange?.();
    unsubscribeRouteChange = null;
  },
} satisfies Rule;
