// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Per-site enforcement denylist. Each entry is a URL Pattern string accepted
// by `new URLPattern(string)`. When the active tab's top-frame URL matches
// any entry, the rule engine treats this tab as enforcement-off (same code
// path as the global enforcement kill-switch, scoped to the tab). See
// ADR-0018 and spec 0010 §"Per-site enforcement denylist".
//
// Authoring shape:
//   - Popup writes `${scheme}//${host}/*` for the active tab on click.
//   - Options-page list shows every entry with a remove control plus an
//     add-by-pattern input that validates against `new URLPattern(string)`.
//   - Build-time overrides file's `siteDenylist` reserved key seeds fresh
//     `chrome.storage` only; user-edited storage wins on rebuild
//     (spec 0011 FR-6).
//
// The matcher matches against the top-frame URL only. Subframes inherit the
// tab's effective enforcement from `effective-enforcement.ts` rather than
// matching their own URL — keeps the user model ("this site") clean even
// when a denylisted page embeds a cross-origin iframe.

import { URLPattern } from "urlpattern-polyfill";
import { createChromeStorageValue } from "./chrome-storage-value";

export const SITE_DENYLIST_STORAGE_KEY = "agent-browser-shield.site-denylist";

// Compiles a URL Pattern string. Returns null for any input that doesn't
// satisfy `new URLPattern(string)`. Callers use the null to drop invalid
// entries on read; build-time validation is loud (see
// `scripts/load-default-overrides.ts`).
function compilePattern(pattern: string): URLPattern | null {
  try {
    return new URLPattern(pattern);
  } catch {
    return null;
  }
}

// Drops non-string entries and entries that don't parse as a URL Pattern.
// Mirrors the silent-degrade posture of `lib/storage.ts`'s `normalize` and
// of `EXTENSION_DEFAULT_OVERRIDES` parsing (ADR-0009 + ADR-0018 §"Decision
// Outcome").
function normalize(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && compilePattern(entry) !== null) {
      result.push(entry);
    }
  }
  return result;
}

// `process.env.EXTENSION_DEFAULT_DENYLIST` is substituted by build.ts when
// the operator passes a defaults file with a `siteDenylist` array. The
// build-time loader validates each entry with `new URLPattern(entry)` and
// fails the build loudly on a bad pattern (spec 0011 FR-4). Here we still
// normalize defensively — if the substitution ever lands as malformed JSON,
// degrade to an empty list rather than crash the content script.
function parseBuildDefault(): string[] {
  const raw = process.env.EXTENSION_DEFAULT_DENYLIST;
  if (!raw) {
    return [];
  }
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

const BUILD_DEFAULT: string[] = parseBuildDefault();

export const siteDenylistStorage = createChromeStorageValue<string[]>({
  key: SITE_DENYLIST_STORAGE_KEY,
  defaultValue: BUILD_DEFAULT,
  normalize,
});

// Tabs the popup can offer a per-site toggle on. The content script doesn't
// run on `chrome://`, `about:`, `view-source:`, etc., so the affordance
// would be a no-op on those URLs even if storage accepted a pattern for
// them. file:// runs the content script when the user has granted access,
// so we include it.
const CONTENT_SCHEME_PROTOCOLS = new Set(["http:", "https:", "file:"]);

export function isContentSchemeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return CONTENT_SCHEME_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

// Pattern the popup writes when the user clicks "Disable on this site".
// Preserves the scheme and host as they appear in the URL bar; no eTLD+1
// inference, no port stripping. Returns null for non-content schemes and
// unparseable URLs so callers can no-op gracefully.
export function hostPatternFor(url: string): string | null {
  if (!isContentSchemeUrl(url)) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return `${parsed.protocol}//${parsed.host}/*`;
}

// True iff at least one pattern in `patterns` matches `url`. Invalid
// patterns silently no-op (they should already have been filtered by
// `normalize`; this is belt-and-suspenders).
export function matchesDenylist(
  url: string,
  patterns: readonly string[],
): boolean {
  if (!url || patterns.length === 0) {
    return false;
  }
  for (const pattern of patterns) {
    const compiled = compilePattern(pattern);
    if (compiled?.test(url) === true) {
      return true;
    }
  }
  return false;
}

// Returns every pattern in `patterns` that matches `url`. Used by the popup
// to surface the count of patterns that "Re-enable on this site" would
// remove (ADR-0018 §"Decision Outcome": removing every matching pattern is
// the only way to honor the user's intent of "I want rules to run here").
export function findMatchingPatterns(
  url: string,
  patterns: readonly string[],
): string[] {
  if (!url || patterns.length === 0) {
    return [];
  }
  const matching: string[] = [];
  for (const pattern of patterns) {
    const compiled = compilePattern(pattern);
    if (compiled?.test(url) === true) {
      matching.push(pattern);
    }
  }
  return matching;
}

// Append `hostPatternFor(url)` to `current` unless an identical entry is
// already present. Returns the next array and the pattern that was added
// (or null if no pattern was written — non-content scheme, or already
// present). Pure: caller persists the next array.
export function addHostPattern(
  url: string,
  current: readonly string[],
): { patterns: string[]; added: string | null } {
  const pattern = hostPatternFor(url);
  if (pattern === null) {
    return { patterns: [...current], added: null };
  }
  if (current.includes(pattern)) {
    return { patterns: [...current], added: null };
  }
  return { patterns: [...current, pattern], added: pattern };
}

// Drop every pattern in `current` whose `URLPattern.test` returns true for
// `url`. Returns the next array and the number of patterns removed. Pure:
// caller persists the next array.
export function removeMatchingPatterns(
  url: string,
  current: readonly string[],
): { patterns: string[]; removed: number } {
  const matching = findMatchingPatterns(url, current);
  if (matching.length === 0) {
    return { patterns: [...current], removed: 0 };
  }
  const matchingSet = new Set(matching);
  return {
    patterns: current.filter((pattern) => !matchingSet.has(pattern)),
    removed: matching.length,
  };
}

// Predicate the Options-page *Add pattern* input uses to validate the
// user's string before saving. Exported separately from `compilePattern`
// so test code can assert it without coupling to the internal nullable
// shape.
export function isValidPattern(pattern: string): boolean {
  return compilePattern(pattern) !== null;
}
