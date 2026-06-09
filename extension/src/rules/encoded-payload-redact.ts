// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Redact long encoded runs in text nodes — the "decode this and follow
// it" carrier for indirect prompt injection. An attacker drops an
// encoded blob into a page region the agent reads (review body, product
// description, social embed caption); a human skims past it as noise but
// an LLM agent may helpfully decode the bytes and treat the result as
// content or as an instruction it should obey.
//
// Two families of detector run per inline group:
//
//   * **Byte encodings** — base64 / base64url, hex, percent-encoded.
//     Each is gated by a length floor that sits above common hash sizes
//     (SHA-256 = 64 hex, SHA-512 = 128 hex). The decisive filter is the
//     *decoded printable-ASCII ratio*: instructions decode to readable
//     text (ratio ~1.0); hashes, fingerprints, and image bytes decode
//     to high-entropy binary (ratio well below 0.85). JWTs are skipped
//     so the more specific `secrets-redact` label wins on overlap.
//
//   * **Text ciphers** — ROT13, Atbash, reverse, leetspeak, NATO
//     phonetic, Morse. The encoded form is itself printable text, so
//     the printable-ASCII ratio is useless. The qualifier is instead a
//     count of distinct common English function words in the decoded
//     output: cipher payloads of useful length decode to several;
//     random gibberish or non-cipher prose does not. For the
//     letter-substitution ciphers (ROT13, Atbash, reverse, leetspeak)
//     we additionally require the *original* candidate not already be
//     English, so ordinary prose decodes to gibberish and falls
//     through. NATO and Morse have distinctive enough forms that the
//     candidate regex alone is selective; the decoded common-word check
//     guards against ASCII art or coincidental Morse-shape runs.
//
// Matches are replaced inline with a click-to-reveal placeholder. False
// positives cost one click, not lost data.

import { defineInlineTextRedactRule } from "../lib/inline-text-redact";
import type { InlineMatch } from "../lib/placeholder";
import { getRuleOptions } from "../lib/rule-options";

const SUB_RULES = getRuleOptions("encoded-payload-redact").subRules;

// Length floors per encoding. Tuned to sit above common hash/fingerprint
// sizes (SHA-512 hex = 128, so 160 leaves headroom) and below typical
// instruction-payload sizes seen in indirect-injection samples.
const MIN_BASE64_LENGTH = 120;
const MIN_HEX_LENGTH = 160;
const MIN_PERCENT_TRIPLETS = 20;

// Text-cipher candidate floor. Substitution ciphers (ROT13, Atbash,
// leetspeak) and reverse need enough characters to carry a meaningful
// instruction; under 80 chars the candidate is too short to clear the
// common-word qualifier even when the decode is real.
const MIN_TEXT_CIPHER_LENGTH = 80;

// Leetspeak candidate floor. Smaller than the other ciphers because a
// leet payload is denser (digit substitutions concentrate intent in
// fewer chars). Combined with the digit-substitution count below, the
// floor avoids matching ordinary text that happens to contain digits.
const MIN_LEET_LENGTH = 40;
const MIN_LEET_SUBSTITUTIONS = 4;

// Distinct common-English-word hits required for the decoded output of
// a text cipher to qualify as a payload. Three hits across a 40-char
// decode is rare for random letter noise but routine for any English
// sentence carrying a directive.
const MIN_COMMON_WORDS = 3;

// NATO and Morse minima — both encodings spell one letter per token, so
// the token count IS the decoded length. Ten letters is the smallest
// payload that can fit a single English directive verb plus its object.
const MIN_NATO_WORDS = 10;
const MIN_MORSE_TOKENS = 10;

// Morse decoders that resolve to a known letter must clear this share
// of the decoded tokens; below it the run is likely incidental dots and
// dashes (ASCII art, bullets, repeated `---` separators) rather than a
// payload.
const MIN_MORSE_VALID_RATIO = 0.8;

// Reject text nodes shorter than the smallest candidate window — cheap
// per-node early-out. The smallest cipher floor (Morse: 10 tokens of
// 1+ symbol each, separated by single whitespace) is ~19 chars; we use
// 20 so the dispatcher sees every plausible cipher payload while still
// skipping short text nodes (UI labels, tab text, badges).
const MIN_TEXT_LENGTH = 20;

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

// Distinct high-frequency English function words — articles, pronouns,
// prepositions, conjunctions, modal/auxiliary verbs, common short
// verbs. Deliberately *generic*: any English sentence of useful length
// hits several, and the set carries no injection-specific phrasing per
// the docs-style guidance to keep adversarial vocabulary out of source.
const COMMON_ENGLISH_WORDS = new Set([
  "the",
  "and",
  "you",
  "for",
  "are",
  "with",
  "this",
  "that",
  "your",
  "have",
  "from",
  "they",
  "will",
  "what",
  "when",
  "but",
  "not",
  "any",
  "can",
  "out",
  "all",
  "one",
  "now",
  "about",
  "after",
  "before",
  "these",
  "their",
  "them",
  "than",
  "then",
  "into",
  "would",
  "could",
  "should",
  "must",
  "more",
  "some",
  "such",
  "only",
  "very",
  "just",
  "also",
  "where",
  "which",
  "while",
  "who",
  "why",
  "how",
  "his",
  "her",
  "she",
  "him",
  "its",
  "been",
  "were",
  "was",
  "yes",
  "let",
  "make",
  "use",
  "see",
  "get",
  "give",
  "take",
  "made",
  "want",
  "tell",
  "ask",
  "show",
  "find",
  "know",
  "think",
  "look",
  "come",
  "say",
  "good",
  "well",
  "back",
  "down",
  "over",
  "under",
  "between",
  "below",
  "above",
  "every",
  "each",
  "other",
  "another",
  "anyone",
  "everyone",
]);

function countDistinctCommonWords(text: string): number {
  const seen = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[a-z]+/g)) {
    const word = m[0];
    if (COMMON_ENGLISH_WORDS.has(word)) {
      seen.add(word);
    }
  }
  return seen.size;
}

// Substitution-cipher decoders. All are 1:1 on the character axis so
// the decoded length equals the original — match indices map straight
// through.
const LOWER_A = 97; // 'a'
const UPPER_A = 65; // 'A'
const ALPHABET_LENGTH = 26;
const ROT13_SHIFT = 13;

function rot13(text: string): string {
  return text.replaceAll(/[a-zA-Z]/g, (c) => {
    const code = c.codePointAt(0) ?? 0;
    const base = code >= LOWER_A ? LOWER_A : UPPER_A;
    return String.fromCodePoint(
      ((code - base + ROT13_SHIFT) % ALPHABET_LENGTH) + base,
    );
  });
}

function atbash(text: string): string {
  return text.replaceAll(/[a-zA-Z]/g, (c) => {
    const code = c.codePointAt(0) ?? 0;
    const base = code >= LOWER_A ? LOWER_A : UPPER_A;
    return String.fromCodePoint(ALPHABET_LENGTH - 1 - (code - base) + base);
  });
}

function reverseText(text: string): string {
  // Unicode-aware reverse so any astral pairs survive. Array.from over a
  // string splits on code points (handling surrogate pairs), which is what
  // we want here; spread would trigger no-misused-spread.
  // eslint-disable-next-line unicorn/prefer-spread
  return Array.from(text).toReversed().join("");
}

// Leetspeak substitution table — only the substitutions that obscure a
// letter behind a digit or symbol. Pure digits (`2nd`, `iPhone 13`) get
// mapped too, which on its own would be a false positive; the
// surrounding gate requires a minimum substitution count AND a decoded
// common-word floor, so prose with incidental digits doesn't qualify.
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
};

// Character class covers every leet substitution we recognize. Each
// occurrence is a candidate disguised letter; we require a minimum
// count of these in any candidate window before attempting a decode so
// that ordinary text with incidental digits doesn't qualify.
const LEET_SUBSTITUTION_RE = /[0134578@$!]/g;

function deleet(text: string): string {
  return text.replaceAll(LEET_SUBSTITUTION_RE, (c) => LEET_MAP[c] ?? c);
}

// NATO phonetic alphabet — one word per encoded letter. Includes both
// "juliet" and "juliett" spellings; "x-ray" / "xray" handled as the
// hyphen-stripped token because the candidate scanner already strips
// hyphens out of word tokens.
const NATO_FIRST_LETTER: Record<string, string> = {
  alpha: "A",
  alfa: "A",
  bravo: "B",
  charlie: "C",
  delta: "D",
  echo: "E",
  foxtrot: "F",
  golf: "G",
  hotel: "H",
  india: "I",
  juliet: "J",
  juliett: "J",
  kilo: "K",
  lima: "L",
  mike: "M",
  november: "N",
  oscar: "O",
  papa: "P",
  quebec: "Q",
  romeo: "R",
  sierra: "S",
  tango: "T",
  uniform: "U",
  victor: "V",
  whiskey: "W",
  whisky: "W",
  xray: "X",
  yankee: "Y",
  zulu: "Z",
};

// Morse map — letters and digits only. Punctuation codes are excluded:
// payloads rarely need them and including them widens the false-match
// surface for sparse dot/dash strings.
const MORSE_MAP: Record<string, string> = {
  ".-": "A",
  "-...": "B",
  "-.-.": "C",
  "-..": "D",
  ".": "E",
  "..-.": "F",
  "--.": "G",
  "....": "H",
  "..": "I",
  ".---": "J",
  "-.-": "K",
  ".-..": "L",
  "--": "M",
  "-.": "N",
  "---": "O",
  ".--.": "P",
  "--.-": "Q",
  ".-.": "R",
  "...": "S",
  "-": "T",
  "..-": "U",
  "...-": "V",
  ".--": "W",
  "-..-": "X",
  "-.--": "Y",
  "--..": "Z",
  "-----": "0",
  ".----": "1",
  "..---": "2",
  "...--": "3",
  "....-": "4",
  ".....": "5",
  "-....": "6",
  "--...": "7",
  "---..": "8",
  "----.": "9",
};

// Candidate windows. Each is conservatively scoped: word-shaped runs
// long enough that the qualifier will see useful signal, with endpoints
// anchored on alphanumerics so trailing punctuation doesn't drift the
// match boundary into surrounding prose.
const TEXT_CIPHER_CANDIDATE = new RegExp(
  String.raw`[A-Za-z][A-Za-z\s.,'"!?:;\-]{${MIN_TEXT_CIPHER_LENGTH - 2},}[A-Za-z]`,
  "g",
);
const LEET_CANDIDATE = new RegExp(
  String.raw`[A-Za-z0-9@$!][A-Za-z0-9@$!\s.,'"?:;\-]{${MIN_LEET_LENGTH - 2},}[A-Za-z0-9@$!]`,
  "g",
);
const MORSE_CANDIDATE = new RegExp(
  String.raw`(?:[.\-]{1,7}[ \t/]+){${MIN_MORSE_TOKENS - 1},}[.\-]{1,7}`,
  "g",
);

function countLeetSubstitutions(text: string): number {
  return (text.match(LEET_SUBSTITUTION_RE) ?? []).length;
}

interface CipherDecodeResult {
  decoded: string;
  commonWords: number;
}

function tryCipherDecode(
  candidate: string,
  decoder: (text: string) => string,
): CipherDecodeResult | null {
  const decoded = decoder(candidate);
  const commonWords = countDistinctCommonWords(decoded);
  if (commonWords < MIN_COMMON_WORDS) {
    return null;
  }
  return { decoded, commonWords };
}

// For substitution ciphers, skip candidates whose original text is
// already English — applying ROT13/Atbash/reverse to English prose
// would produce gibberish (zero common-word hits), so this is only a
// performance gate, not a correctness one.
function alreadyEnglish(candidate: string): boolean {
  return countDistinctCommonWords(candidate) >= MIN_COMMON_WORDS;
}

interface NatoRun {
  start: number;
  end: number;
  decoded: string;
}

function isAlphabetSequence(letters: string): boolean {
  // A run is a sequential alphabet drill (ABCDE… or BCDEF…) iff every
  // adjacent pair differs by exactly 1 in code-point order. We treat
  // these as instructional content rather than a payload — alphabet
  // pages and signal-corps drills shouldn't be redacted.
  for (let i = 1; i < letters.length; i++) {
    const previous = letters.codePointAt(i - 1) ?? 0;
    const current = letters.codePointAt(i) ?? 0;
    if (current - previous !== 1) {
      return false;
    }
  }
  return true;
}

function findNatoRuns(text: string): NatoRun[] {
  // Scan word tokens linearly so a long alternation regex doesn't
  // backtrack. A NATO run is a maximal sequence of NATO tokens
  // separated by whitespace, hyphens, or commas; any other token
  // (including non-NATO words) ends the run.
  const runs: NatoRun[] = [];
  const lower = text.toLowerCase();
  const TOKEN_RE = /[a-z]+/g;
  let current: { start: number; end: number; letters: string } | null = null;
  let lastTokenEnd = -1;
  for (const m of lower.matchAll(TOKEN_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    const gap = text.slice(lastTokenEnd, start);
    const letter = NATO_FIRST_LETTER[m[0]];
    const gapIsSeparator = lastTokenEnd === -1 || /^[\s,-]+$/.test(gap);
    if (letter && (current === null || gapIsSeparator)) {
      if (current === null) {
        current = { start, end, letters: letter };
      } else {
        current.end = end;
        current.letters += letter;
      }
    } else {
      if (current !== null && current.letters.length >= MIN_NATO_WORDS) {
        runs.push({
          start: current.start,
          end: current.end,
          decoded: current.letters,
        });
      }
      current = letter ? { start, end, letters: letter } : null;
    }
    lastTokenEnd = end;
  }
  if (current !== null && current.letters.length >= MIN_NATO_WORDS) {
    runs.push({
      start: current.start,
      end: current.end,
      decoded: current.letters,
    });
  }
  return runs;
}

interface MorseDecodeResult {
  decoded: string;
  validRatio: number;
}

function decodeMorse(candidate: string): MorseDecodeResult {
  // Word separator: `/` (with optional whitespace). Letter separator:
  // any whitespace run.
  const words = candidate.split(/\s*\/\s*/);
  const decodedWords: string[] = [];
  let valid = 0;
  let total = 0;
  for (const word of words) {
    const symbols = word.trim().split(/\s+/).filter(Boolean);
    let chunk = "";
    for (const sym of symbols) {
      total++;
      const letter = MORSE_MAP[sym];
      if (letter) {
        valid++;
        chunk += letter;
      }
    }
    if (chunk.length > 0) {
      decodedWords.push(chunk);
    }
  }
  return {
    decoded: decodedWords.join(" "),
    validRatio: total === 0 ? 0 : valid / total,
  };
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

// All substitution-style decoders share the same candidate window and
// already-English gate, so we iterate TEXT_CIPHER_CANDIDATE once and try
// each decoder. The first one that produces a readable decode wins; the
// rest are skipped for that candidate (their match spans would overlap
// and merge identically downstream anyway).
const SUBSTITUTION_DECODERS: ReadonlyArray<(text: string) => string> = [
  rot13,
  atbash,
  reverseText,
];

function collectSubstitutionCiphers(
  text: string,
  matches: InlineMatch[],
): void {
  for (const m of text.matchAll(TEXT_CIPHER_CANDIDATE)) {
    const candidate = m[0];
    if (alreadyEnglish(candidate)) {
      continue;
    }
    for (const decoder of SUBSTITUTION_DECODERS) {
      if (tryCipherDecode(candidate, decoder) !== null) {
        matches.push({
          start: m.index,
          end: m.index + candidate.length,
          label: "[encoded payload hidden]",
        });
        break;
      }
    }
  }
}

function collectLeet(text: string, matches: InlineMatch[]): void {
  for (const m of text.matchAll(LEET_CANDIDATE)) {
    const candidate = m[0];
    if (countLeetSubstitutions(candidate) < MIN_LEET_SUBSTITUTIONS) {
      continue;
    }
    if (tryCipherDecode(candidate, deleet) !== null) {
      matches.push({
        start: m.index,
        end: m.index + candidate.length,
        label: "[encoded payload hidden]",
      });
    }
  }
}

function collectNato(text: string, matches: InlineMatch[]): void {
  for (const run of findNatoRuns(text)) {
    if (isAlphabetSequence(run.decoded)) {
      continue;
    }
    matches.push({
      start: run.start,
      end: run.end,
      label: "[encoded payload hidden]",
    });
  }
}

function collectMorse(text: string, matches: InlineMatch[]): void {
  for (const m of text.matchAll(MORSE_CANDIDATE)) {
    const candidate = m[0];
    const { decoded, validRatio } = decodeMorse(candidate);
    if (validRatio < MIN_MORSE_VALID_RATIO) {
      continue;
    }
    if (countDistinctCommonWords(decoded) < MIN_COMMON_WORDS) {
      continue;
    }
    matches.push({
      start: m.index,
      end: m.index + candidate.length,
      label: "[encoded payload hidden]",
    });
  }
}

function collectMatches(text: string): InlineMatch[] {
  const matches: InlineMatch[] = [];
  // JWT ranges are needed only to suppress overlapping base64 matches; skip
  // the scan when base64 is disabled.
  const jwtRanges = SUB_RULES.base64 ? collectJwtRanges(text) : [];
  if (SUB_RULES.base64) {
    collectBase64(text, jwtRanges, matches);
  }
  if (SUB_RULES.hex) {
    collectHex(text, matches);
  }
  if (SUB_RULES.percent) {
    collectPercent(text, matches);
  }
  if (SUB_RULES.substitutionCipher) {
    collectSubstitutionCiphers(text, matches);
  }
  if (SUB_RULES.leetspeak) {
    collectLeet(text, matches);
  }
  if (SUB_RULES.nato) {
    collectNato(text, matches);
  }
  if (SUB_RULES.morse) {
    collectMorse(text, matches);
  }

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

export const encodedPayloadRedactRule = defineInlineTextRedactRule({
  id: "encoded-payload-redact",
  label: "Redact Encoded Payloads",
  description:
    "Redact long encoded runs in text nodes whose decoded form is readable English. Covers base64 / hex / percent (byte encodings) and ROT13 / Atbash / reverse / leetspeak / NATO phonetic / Morse (text ciphers). Defends against the 'decode this and follow it' indirect-injection carrier; hashes, fingerprints, and binary blobs are left alone.",
  minLength: MIN_TEXT_LENGTH,
  collectMatches,
});
