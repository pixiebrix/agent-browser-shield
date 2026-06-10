// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// The single source of truth for `RuleId`, `RULE_IDS`, and ship-default state.
// Hand-edited. Adding a rule: append an entry here AND register the runtime in
// `rules/index.ts`. That file constrains its tuple against this `RuleId`
// (`satisfies … { id: RuleId }` + a reverse exhaustiveness assertion), so a
// mismatch in either direction is a compile error at author time. The catalog
// test in `rules/__tests__/catalog.test.ts` keeps the same checks at runtime as
// belt-and-suspenders.
//
// Kept out of `rules/index.ts` so service-worker code (`lib/storage.ts`,
// `background.ts`) can import id metadata without pulling rule files'
// DOM access into the worker bundle (guarded by
// `scripts/check-background-purity.ts`).

export const RULE_DEFAULTS = {
  "pii-redact": true,
  "secrets-redact": true,
  "reviews-redact": true,
  "comments-redact": true,
  "prompt-injection-redact": true,
  "countdown-timer-redact": true,
  "scarcity-redact": true,
  "confirmshame-sanitize": true,
  "footer-redact": true,
  "checkout-checkbox-sanitize": true,
  "cookie-banner-hide": true,
  "chat-widget-hide": true,
  "html-comment-strip": true,
  "hidden-text-strip": true,
  "unicode-invisibles-strip": true,
  "noscript-strip": true,
  "json-ld-sanitize": true,
  "attribute-injection-sanitize": true,
  "meta-injection-strip": true,
  "newsletter-modal-hide": true,
  "svg-sprite-strip": true,
  "svg-text-strip": true,
  "social-embed-redact": true,
  "ads-hide": true,
  "cart-addon-annotate": true,
  "link-spoof-annotate": true,
  "search-url-helper": true,
  "roach-motel-annotate": true,
  "irrelevant-sections-redact": false,
  "cross-origin-frame-redact": false,
  "schema-trust-sanitize": false,
  "trust-badge-annotate": false,
  "disguised-ad-flag": true,
  "encoded-payload-redact": true,
  "webdriver-probe-annotate": false,
  "closed-shadow-root-annotate": false,
  "hidden-fee-annotate": true,
  "form-prefill-annotate": true,
  "hidden-affiliate-sanitize": true,
} as const satisfies Readonly<Record<string, boolean>>;

export type RuleId = keyof typeof RULE_DEFAULTS;

export const RULE_IDS = Object.keys(RULE_DEFAULTS) as readonly RuleId[];

// Build a record that holds an entry for every `RuleId`. `Object.fromEntries`
// types its result with a `string` key, so the assertion back to
// `Record<RuleId, V>` lives here once rather than at each call site. Key
// coverage is guaranteed (the keys come from `RULE_IDS`, the canonical list)
// and `V` is inferred from `value`, so callers keep a checked value type
// instead of a blanket `as` cast over the whole map.
export function buildRuleRecord<V>(
  value: (id: RuleId) => V,
): Record<RuleId, V> {
  return Object.fromEntries(RULE_IDS.map((id) => [id, value(id)])) as Record<
    RuleId,
    V
  >;
}

// Per-rule build-time options. Rules whose behaviour is governed by more than
// a single on/off toggle declare their option shape here. The override file
// loader (`scripts/load-default-overrides.ts`) accepts an object value for any
// rule listed below and validates it against this shape; rules absent from
// this map only accept a plain boolean (existing behaviour).
//
// A sub-rule's value may be a boolean (sub-rule on/off, equivalent to
// `{ enabled: <boolean> }`) or an object with `enabled?: boolean` plus
// finite-number tuning thresholds. Leaf types are validated positionally —
// override boolean→boolean, number→finite number. The structure stays pure
// data so this module is safe to import from the service worker (see file
// header).
export const RULE_OPTION_DEFAULTS = {
  "encoded-payload-redact": {
    // Each sub-rule corresponds to one of the encoded-content detectors in
    // `rules/encoded-payload-redact.ts` (`collectMatches`). The three
    // substitution-cipher decoders (ROT13 / Atbash / reverse) share a single
    // sub-rule because they share the candidate window and first-match-wins
    // resolution; users disable them together or not at all.
    //
    // Numeric thresholds below replace the file-scope `MIN_*` constants the
    // rule used to carry. Operators tuning them are reading the rule source
    // by definition (ADR-0017) — no range checks, knob meanings live in the
    // rule's inline rationale.
    subRules: {
      // Length floor for base64 candidate window. Sized above SHA-512 hex
      // and below typical instruction-payload sizes. Combined with the
      // printable-ratio filter on the decoded bytes.
      base64: {
        enabled: true,
        minLength: 120,
        printableRatio: 0.85,
        minDecodedLength: 40,
      },
      // Length floor for hex candidate window. Sized above SHA-512 hex
      // (128 chars) so common hashes don't match. Same printable-ratio /
      // decoded-length filter as base64.
      hex: {
        enabled: true,
        minLength: 160,
        printableRatio: 0.85,
        minDecodedLength: 40,
      },
      // Minimum count of `%XX` triplets in a percent-encoded run. Runs are
      // merged across short gaps before the count check.
      percent: {
        enabled: true,
        minTriplets: 20,
        printableRatio: 0.85,
        minDecodedLength: 40,
      },
      // Substitution-cipher (ROT13 / Atbash / reverse) candidate floor. The
      // decoded common-word qualifier separates real payloads from random
      // letter noise.
      substitutionCipher: {
        enabled: true,
        minLength: 80,
        minCommonWords: 3,
      },
      // Leetspeak candidate floor. Smaller than the substitution-cipher
      // floor because leet payloads are denser; combined with a minimum
      // count of digit substitutions and the decoded common-word qualifier.
      leetspeak: {
        enabled: true,
        minLength: 40,
        minSubstitutions: 4,
        minCommonWords: 3,
      },
      // NATO phonetic minimum token count. Token count = decoded letter
      // count, so 10 lets a single English directive verb plus object fit.
      nato: {
        enabled: true,
        minWords: 10,
      },
      // Morse minimum dot/dash token count, the share of decoded tokens
      // that must resolve to a known letter (rejects ASCII art and sparse
      // separator runs), and the decoded common-word qualifier.
      morse: {
        enabled: true,
        minTokens: 10,
        validRatio: 0.8,
        minCommonWords: 3,
      },
    },
  },
} as const satisfies Readonly<
  Partial<
    Record<
      RuleId,
      Readonly<
        Record<
          string,
          Readonly<
            Record<string, boolean | Readonly<Record<string, number | boolean>>>
          >
        >
      >
    >
  >
>;

// `as const` narrows every leaf to its literal type (`true`, `120`, `0.85`),
// which would force `no-unnecessary-condition` to flag every sub-rule gate
// and turn every threshold read into a comparison against a literal. The
// resolved option values are intentionally widened to `boolean` / `number`
// so the override file can flip booleans and replace thresholds.
type WidenLeaves<T> = {
  [K in keyof T]: T[K] extends boolean
    ? boolean
    : T[K] extends number
      ? number
      : T[K] extends object
        ? WidenLeaves<T[K]>
        : T[K];
};

export type RuleOptions = WidenLeaves<typeof RULE_OPTION_DEFAULTS>;
export type RuleWithOptionsId = keyof RuleOptions;
