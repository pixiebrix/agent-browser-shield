---
status: Current
last_reviewed: 2026-06-09
---

# Prompt-injection defense

## Purpose

Remove or neutralize content on a page that could carry attacker-controlled
instructions to a browser-use agent. The threat model is **indirect prompt
injection** — attacker text reaches the model via the page the agent reads, not
via the user's prompt — generalized to LLM-driven web agents. Coverage spans
rendered content, non-rendered DOM, page metadata, HTML attributes, and
structured-data surfaces.

## User stories

### Human users

- As a **person using a browser-use agent on real websites**, I want
  user-generated content (comments, reviews, embedded social posts) hidden from
  the agent by default, so that hostile commenters can't redirect the agent away
  from my task.
- As a **person who occasionally needs to see hidden content**, I want
  click-to-reveal placeholders, so that I can opt back into individual
  redactions without disabling the whole rule.

### AI agents

- As a **browser-use agent reading the page**, I want known prompt-injection
  phrasings removed from the rendered text, the accessibility tree, and the
  non-rendered DOM (HTML comments, hidden text, `<noscript>`, `<meta>` content,
  `aria-*`, JSON-LD), so that I don't ingest hostile instructions disguised as
  content.
- As a **browser-use agent that summarizes the page**, I want
  `<meta name="description">`, OpenGraph, and JSON-LD `Article.description`
  scrubbed when they carry instruction-shaped text, so that "what is this page
  about" answers aren't poisoned by metadata I can't see in the rendered view.
- As a **browser-use agent that walks accessibility names and descriptions**, I
  want `aria-label`, `alt`, `title`, `placeholder`, SVG
  `<title>`/`<desc>`/`<text>`, and Unicode-tag-block payloads scrubbed, so that
  the accessibility-tree surface isn't a hidden channel into my context.

## Functional requirements

### Pattern set

- **FR-1.** The prompt-injection pattern set is defined in
  `extension/data/injection-patterns.yaml`, base64-encoded at rest, and decoded
  at build time into `extension/src/rules/injection-patterns.generated.ts`. The
  shipped bundle contains plaintext `RegExp` literals — no runtime `atob` of
  obfuscated strings. See
  [ADR-0011](../decisions/0011-build-time-decoded-injection-patterns.md).
- **FR-2.** The same pattern bundle backs `prompt-injection-redact`,
  `meta-injection-strip`, `attribute-injection-sanitize`, `json-ld-sanitize`,
  `html-comment-strip`, and `svg-text-strip`. Coverage gaps in the bundle
  propagate to all six rules.
- **FR-3.** The bundle is a finite curated catalog of phrasings observed in the
  literature and fixtures. Payloads outside the catalog pass through; this gap
  is intentional and documented.

### Rendered text and user-generated content

- **FR-4.** `prompt-injection-redact` (default **on**) hides page sections
  matching the pattern set; a click-to-reveal placeholder is left behind.
- **FR-5.** `encoded-payload-redact` (default **on**) redacts long base64, hex,
  or percent-encoded runs whose decoded bytes are mostly printable ASCII. JWTs
  are left for `secrets-redact`. Length floors sit above SHA-256/SHA-512/Git
  commit SHA sizes.
- **FR-6.** `comments-redact` (default **on**) hides user-generated comment
  threads on Disqus, Facebook, Reddit, YouTube, and Hacker News.
- **FR-7.** `reviews-redact` (default **on**) hides user-generated review text
  on schema.org `Review` microdata and supported sites (Amazon, Walmart).
  Aggregate star ratings stay visible.
- **FR-8.** `social-embed-redact` (default **on**) replaces embedded
  social-media widgets (Twitter/X, YouTube, Facebook, Instagram, TikTok,
  LinkedIn, Reddit, Spotify, SoundCloud) with a placeholder. Skipped on the
  embed provider's own domain.

### Non-rendered DOM

- **FR-9.** `html-comment-strip` (default **on**) walks every HTML comment and
  **blanks its data** when it matches the pattern set, leaving the Comment node
  attached so SPA hydration markers reconcile. Comments inside `<script>` /
  `<style>` / `<noscript>` are preserved verbatim; framework Suspense/hydration
  boundary comments are left alone.
- **FR-10.** `noscript-strip` (default **on**) blanks every `<noscript>`
  element's children, leaving the element attached. Reasoning: a browser-use
  agent runs in a browser at all because the site requires JS, so `<noscript>`
  content is by definition never rendered to a human.
- **FR-11.** `hidden-text-strip` (default **on**) blanks text-node content
  inside elements matching a hidden-CSS trigger (foreground=background,
  `visibility:hidden`, `opacity:0`, `font-size:0`, off-screen positioning,
  zero-area clipping). The element and descendant element nodes stay attached.
  Screen-reader-only text (`.sr-only`, `.visually-hidden`, `.a-offscreen`,
  `.aok-offscreen`, MUI `visuallyHidden`, 1×1 + `overflow:hidden` +
  `position:absolute`) is preserved. `display:none` is left alone.
- **FR-12.** `unicode-invisibles-strip` (default **on**) removes Unicode
  invisibles with no visible glyph from text nodes and attribute values: Unicode
  Tags block (`U+E0000–U+E007F`), bidi override and isolate characters
  (`U+202A–U+202E`, `U+2066–U+2069`), and zero-width chars (`U+200B`,
  `U+2060–U+2064`, `U+FEFF`, `U+180E`). Script-shaping codepoints (ZWJ `U+200D`,
  ZWNJ `U+200C`, LRM/RLM `U+200E`/`U+200F`) are preserved.

### HTML metadata and attributes

- **FR-13.** `meta-injection-strip` (default **on**) walks every `<meta>` with a
  `content` attribute and every `<title>`; on pattern match it blanks the
  `content` attribute (or title text). Both elements stay attached. The rule
  scans `document.head` in addition to the engine's apply root so SPA route
  changes that mutate `<head>` are covered. The rule does not gate on specific
  `name=` / `property=` values — any meta whose content carries
  instruction-shaped text is scrubbed.
- **FR-14.** `attribute-injection-sanitize` (default **on**) removes a matching
  attribute (rather than blanking it) on a fixed allowlist: `aria-label`,
  `aria-description`, `aria-roledescription`, `aria-placeholder`,
  `aria-valuetext`, `aria-keyshortcuts`, `alt`, `title`, `placeholder`,
  `data-tooltip`, and `value` on disabled / hidden `<input>` elements.
  Attributes outside the allowlist are not inspected.

### Structured data

- **FR-15.** `json-ld-sanitize` (default **on**) parses every
  `<script type="application/ld+json">`, recursively replaces matching string
  fields with `""`, and re-serializes. Structural fields useful to the agent
  (`price`, `priceCurrency`, `availability`, `sku`, `identifier`, `ratingValue`,
  `reviewCount`, `position`) are preserved exactly. Malformed JSON-LD is left
  alone.
- **FR-16.** `svg-text-strip` (default **on**) blanks `<title>`, `<desc>`, and
  `<text>` content inside an `<svg>` when it matches the pattern set. The
  element shell is preserved so accessibility-tree mappings and rendered
  geometry stay intact.

## Non-functional requirements

- **NFR-S-1.** No file under `extension/src/` may reproduce the literal
  injection phrasings in plaintext source. The base64-encoded YAML
  - build-time decode (FR-1) is the only path; user-facing docs and marketing
    must keep example phrasings abstract.
- **NFR-S-2.** **Remove over annotate** for adversarial content — strip or
  redact carriers rather than label them. Annotations are reserved for
  capability signals (closed shadow roots, webdriver-probe reads, link spoofs)
  where the page itself is the artifact under inspection.
- **NFR-O-1.** Each rule reports its per-frame mutation count via the standard
  rule-count reporter (spec 0010), so operators can see how often each carrier
  triggers in real traffic.
- **NFR-M-1.** New patterns flow through the YAML → codegen pipeline; no rule
  file imports the YAML directly.

## Current implementation

- FR-1, FR-2, FR-3: `extension/data/injection-patterns.yaml`,
  `extension/scripts/build-injection-patterns.ts`,
  `extension/src/rules/injection-patterns.generated.ts`.
- FR-4: `extension/src/rules/prompt-injection-redact.ts`,
  `extension/src/rules/__tests__/prompt-injection-redact.test.ts`.
- FR-5: `extension/src/rules/encoded-payload-redact.ts`,
  `extension/src/rules/__tests__/encoded-payload-redact.test.ts`,
  `extension/src/rules/__tests__/encoded-payload-redact.property.test.ts`.
- FR-6: `extension/src/rules/comments-redact.ts`,
  `extension/src/rules/__tests__/comments-redact.test.ts`.
- FR-7: `extension/src/rules/reviews-redact.ts`,
  `extension/src/rules/__tests__/reviews-redact.*.test.ts`.
- FR-8: `extension/src/rules/social-embed-redact.ts`,
  `extension/src/rules/__tests__/social-embed-redact.test.ts`,
  `extension/src/rules/__tests__/social-embed-redact.owner-host.test.ts`.
- FR-9: `extension/src/rules/html-comment-strip.ts`,
  `extension/src/rules/__tests__/html-comment-strip.test.ts`,
  `extension/src/rules/__tests__/html-comment-strip.property.test.ts`.
- FR-10: `extension/src/rules/noscript-strip.ts`,
  `extension/src/rules/__tests__/noscript-strip.test.ts`.
- FR-11: `extension/src/rules/hidden-text-strip.ts`,
  `extension/src/rules/__tests__/hidden-text-strip.test.ts`,
  `extension/src/rules/__tests__/hidden-text-strip.property.test.ts`.
- FR-12: `extension/src/rules/unicode-invisibles-strip.ts`,
  `extension/src/rules/__tests__/unicode-invisibles-strip.test.ts`.
- FR-13: `extension/src/rules/meta-injection-strip.ts`,
  `extension/src/rules/__tests__/meta-injection-strip.test.ts`,
  `extension/src/rules/__tests__/meta-injection-strip.property.test.ts`.
- FR-14: `extension/src/rules/attribute-injection-sanitize.ts`,
  `extension/src/rules/__tests__/attribute-injection-sanitize.test.ts`,
  `extension/src/rules/__tests__/attribute-injection-sanitize.property.test.ts`.
- FR-15: `extension/src/rules/json-ld-sanitize.ts`,
  `extension/src/rules/__tests__/json-ld-sanitize.test.ts`.
- FR-16: `extension/src/rules/svg-text-strip.ts`,
  `extension/src/rules/__tests__/svg-text-strip.test.ts`.

## Future work

- Novel-payload coverage — the bundle is a curated catalog (FR-3). Expanding to
  non-catalog phrasings, role markers from new agent APIs, and multilingual
  variants is ongoing PR-by-PR; there is no in-extension generic classifier
  today.
- Localized confirmshame phrasings — `confirmshame-sanitize` is English-only by
  design (see spec 0005); the same constraint applies to pattern-set phrasings
  that ship in English.

## Related

- ADRs:
  [ADR-0007](../decisions/0007-scrub-instead-of-detach-for-framework-dom.md),
  [ADR-0011](../decisions/0011-build-time-decoded-injection-patterns.md).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Indirect prompt injection".
- Specs: [0002](./0002-rule-engine.md),
  [0007](./0007-visual-identity-and-trust.md),
  [0008](./0008-cross-origin-and-shadow-dom.md).
