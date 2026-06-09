---
status: Current
last_reviewed: 2026-06-09
---

# Visual identity and trust verification

## Purpose

Flag visual-identity spoofs and unverifiable trust claims that depend on the
asymmetry between **rendered glyphs** (what humans and vision-based agents read)
and **structured page data** (what DOM-walking agents read). The rules in this
area annotate rather than remove, because the artifact itself is the thing under
inspection.

## User stories

### Human users

- As a **person reading a phishing-style page**, I want anchor text that
  visually mimics a brand or whose domain differs from the `href` flagged with
  an inline chip, so that I can see the asymmetry without having to hover-check
  every link.
- As a **person on a page covered in "trusted" badges**, I want unverifiable
  third-party endorsements (Norton Secured, McAfee SECURE, BBB Accredited,
  TrustPilot, "Verified Seller") flagged, so that I don't weight them as if the
  chrome TLS UI backed them.

### AI agents

- As a **vision-based browser-use agent**, I want a visible chip acknowledging
  the rendered-glyph-vs-href asymmetry, so that I see the same signal the
  sighted user sees rather than ingesting the spoofed domain as fact.
- As a **DOM-walking browser-use agent reading structured data**, I want
  schema.org `Organization` impersonation flagged (blanked) when the publisher
  claim resolves to a different registrable domain, so that I don't cite
  borrowed authority as the page's own.

## Functional requirements

### Visual identity spoofing

- **FR-1.** `link-spoof-annotate` (default **on**) annotates `<a>` elements
  whose visible text is visually spoofed relative to the link's actual
  destination. Three checks signal with a visible inline chip:
  1. **Mixed-script word.** A word mixes Latin letters with letters from Greek
     (`U+0370–03FF`), Cyrillic (`U+0400–04FF`), Armenian (`U+0530–058F`), or
     Cherokee (`U+13A0–13FF`) — the script blocks supplying Latin confusables. A
     pure-Cyrillic word adjacent to a pure-Latin word does not match; this test
     requires within-word script mixing.
  2. **Single-script homograph.** The visible text contains a domain whose
     letters are drawn entirely from one non-Latin script but whose visual
     skeleton — via a curated subset of the Unicode TR39 confusables table —
     collapses to a pure-Latin string. The chip surfaces the Latin form the
     domain mimics.
  3. **Visible-text / href domain mismatch.** A fully-formed domain in the
     visible text whose registrable identity (PSL, ICANN section) doesn't match
     the link's actual host. Both visible candidate and `href` are normalized to
     punycode before comparison, so legitimate IDN links don't surface while
     attacker-redirect cases do. Gated to `http(s):` hrefs.
- **FR-2.** The `link-spoof-annotate` chip renders as visible markup (not just a
  `data-*` attribute) because the rule's threat model is the asymmetry where
  vision-based agents and sighted users read the rendered glyphs but the
  navigation target lives in the unrendered `href`.

### Trust-badge claims

- **FR-3.** `trust-badge-annotate` (default **off**, experimental) annotates
  image-shaped trust badges — Norton Secured, McAfee SECURE, BBB Accredited,
  TrustPilot, Verified Seller, and similar — whose accessible name asserts
  third-party endorsement that no content-script-accessible signal backs. The
  badge itself is left in place; the chip notes the claim is not verifiable from
  page content.
- **FR-4.** `trust-badge-annotate` detection is intentionally narrow. Only
  `<img>`, `<svg>`, and elements with `role="img"` are considered (plain text
  labels like "Verified Purchase" on a review are out of scope). The accessible
  name is read in standard precedence (`aria-label` → `aria-labelledby` → SVG
  `<title>` → `alt` → `title`), capped at a short length, matched against a
  curated phrase set with word boundaries. Bare single words like "verified" or
  "trusted" do not match. Badges on the issuer's own registrable domain (a
  Norton page showing its own logo, BBB.org showing its accreditation seal) are
  exempted as first-party.

### Structured-data trust

- **FR-5.** `schema-trust-sanitize` (default **off**, experimental) walks
  JSON-LD blocks and microdata items for schema.org `Organization`-typed claims
  (`Article.publisher`, `Article.sourceOrganization`, `ClaimReview.author`,
  top-level brand assertions) and blanks `name`, `url`, and `@id` when the
  claim's `url` resolves to a different registrable domain than the page
  asserting it. Structural fields (`@type`, `logo`, `datePublished`, `price`,
  `ratingValue`) are preserved exactly. Name-only claims with no `url` to anchor
  against are left alone.
- **FR-6.** The rule short-circuits on known syndicators (Google News, Yahoo
  News, MSN, Apple News, Flipboard, SmartNews, Feedly, Pocket), web archives,
  AMP cache, and Google Translate proxies, where mismatched publisher claims are
  expected.
- **FR-7.** `Person`-typed claims get a weaker treatment: when a `Person` is
  nested under an authority-context property (`author`, `editor`, `publisher`,
  `creator`, `contributor`, `reviewedBy`, `funder`, `sponsor`, similar) and its
  `url` is on a different registrable domain than the page, the rule annotates
  with `abs:unverified-authority: true` (JSON-LD) or
  `data-abs-schema-trust-unverified="true"` (microdata) rather than blanking.
  Standalone `@type: Person` (a personal homepage) is left alone regardless of
  URL. Reasoning: blanking legitimate guest-author and academic bylines, which
  routinely link off-domain, would erase real metadata.

## Non-functional requirements

- **NFR-S-1.** `link-spoof-annotate` and `trust-badge-annotate` preserve the
  underlying control — the link still navigates, the badge still renders.
  Annotation surfaces a signal alongside; it does not remove agency.
- **NFR-S-2.** `schema-trust-sanitize` blanks identity strings only; structural
  fields the agent needs to read the page's content are preserved exactly
  (FR-5).
- **NFR-U-1.** `link-spoof-annotate` chips are visible to humans precisely
  because the threat model includes sighted users acting on the rendered glyphs.
  They are not screen-reader-only.

## Current implementation

- FR-1, FR-2: `extension/src/rules/link-spoof-annotate.ts`,
  `extension/src/lib/confusables.ts`,
  `extension/src/rules/__tests__/link-spoof-annotate.test.ts`,
  `extension/src/rules/__tests__/link-spoof-annotate.property.test.ts`.
- FR-3, FR-4: `extension/src/rules/trust-badge-annotate.ts`,
  `extension/src/rules/__tests__/trust-badge-annotate.test.ts`.
- FR-5, FR-6, FR-7: `extension/src/rules/schema-trust-sanitize.ts`,
  `extension/src/lib/schema-trust.ts`, `extension/src/lib/domain-trust.ts`,
  `extension/src/rules/__tests__/schema-trust-sanitize.test.ts`,
  `extension/src/rules/__tests__/schema-trust-sanitize-skip.test.ts`.

## Future work

- Move `trust-badge-annotate` and `schema-trust-sanitize` from experimental
  (off-by-default) to default-on once the false-positive rate is characterized
  in real traffic.
- Native (non-image) text-only trust assertions ("100% Money Back Guarantee",
  "Industry-Leading Security") — out of scope for `trust-badge-annotate` today;
  would need a different shape gate than `<img>`/`<svg>`/`role="img"`.

## Related

- ADRs: [ADR-0002](../decisions/0002-rule-id-naming-taxonomy.md) (annotate verb
  is reserved for capability signals like this).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Visual identity spoofing".
- Specs: [0005](./0005-dark-pattern-defense.md) (related: `roach-motel-annotate`
  uses similar annotation posture).
