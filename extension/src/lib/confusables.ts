// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Visual-confusables skeleton: maps a curated subset of Unicode codepoints
// that visually mimic Latin letters back to their Latin form, so a string
// like "аррӏе.com" (all Cyrillic) skeletons to "apple.com". Used by
// `link-spoof-annotate` to detect single-script homograph attacks (where
// every letter in a brand-mimicking word is drawn from one non-Latin
// script and the existing intra-word mixed-script regex never matches).
//
// This is a deliberately narrow subset of Unicode TR39 confusables.txt —
// just Cyrillic, Greek, and Armenian codepoints whose lowercased glyph is
// the recognized phishing carrier for a Latin letter. The full TR39 table
// has ~12k entries; the curated subset here covers the codepoints actually
// observed in URL-bar homograph attacks (Cyrillic а/е/о/р/с/у/х and their
// uppercase forms account for the bulk).
//
// Confusables that don't have a clear Latin target (e.g. Devanagari,
// Hebrew) are intentionally omitted — including them risks false positives
// on legitimate non-Latin text without any phishing-defense win, since
// those scripts don't have a single-letter Latin shape to imitate.

const CONFUSABLE_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  // Cyrillic lowercase
  ["а", "a"], // а
  ["е", "e"], // е
  ["о", "o"], // о
  ["р", "p"], // р
  ["с", "c"], // с
  ["у", "y"], // у
  ["х", "x"], // х
  ["ј", "j"], // ј
  ["і", "i"], // і
  ["ѕ", "s"], // ѕ
  ["ӏ", "l"], // ӏ
  ["ԁ", "d"], // ԁ
  // Cyrillic uppercase
  ["А", "A"], // А
  ["В", "B"], // В
  ["Е", "E"], // Е
  ["К", "K"], // К
  ["М", "M"], // М
  ["Н", "H"], // Н
  ["О", "O"], // О
  ["Р", "P"], // Р
  ["С", "C"], // С
  ["Т", "T"], // Т
  ["Х", "X"], // Х
  ["Ѕ", "S"], // Ѕ
  ["І", "I"], // І
  ["Ј", "J"], // Ј
  ["Ү", "Y"], // Ү

  // Greek lowercase
  ["α", "a"], // α
  ["ο", "o"], // ο
  ["ρ", "p"], // ρ
  ["ν", "v"], // ν
  ["κ", "k"], // κ
  ["τ", "t"], // τ
  ["υ", "u"], // υ
  ["ι", "i"], // ι
  ["ε", "e"], // ε
  ["η", "n"], // η
  ["ϲ", "c"], // ϲ
  // Greek uppercase
  ["Α", "A"], // Α
  ["Β", "B"], // Β
  ["Ε", "E"], // Ε
  ["Ζ", "Z"], // Ζ
  ["Η", "H"], // Η
  ["Ι", "I"], // Ι
  ["Κ", "K"], // Κ
  ["Μ", "M"], // Μ
  ["Ν", "N"], // Ν
  ["Ο", "O"], // Ο
  ["Ρ", "P"], // Ρ
  ["Τ", "T"], // Τ
  ["Υ", "Y"], // Υ
  ["Χ", "X"], // Χ
  ["Ϲ", "C"], // Ϲ

  // Armenian lowercase — only the few with a stable Latin shape
  ["օ", "o"], // օ
  ["ո", "n"], // ո
  ["ս", "u"], // ս
  ["հ", "h"], // հ
];

const CONFUSABLE_TO_LATIN = new Map(CONFUSABLE_ENTRIES);

// Skeleton: replace every confusable codepoint with its Latin target, then
// lowercase. Codepoints not in the map are passed through unchanged, so
// genuine non-Latin text (e.g. "президент.рф") still contains non-Latin
// glyphs after skeleton and won't be misread as Latin downstream.
export function skeleton(text: string): string {
  let out = "";
  for (const ch of text) {
    out += CONFUSABLE_TO_LATIN.get(ch) ?? ch;
  }
  return out.toLowerCase();
}
