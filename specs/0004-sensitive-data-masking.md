---
status: Current
last_reviewed: 2026-06-09
---

# Sensitive-data masking

## Purpose

Replace credentials and personal identifiers with click-to-reveal placeholders
before they reach a browser-use agent. The masking is in-place on text nodes —
the page still renders normally for a human.

## User stories

### Human users

- As a **person whose page contains my name, phone number, or credit card on a
  confirmation screen**, I want those values hidden from the agent by default,
  so that a routine task can't ship PII to the model unnoticed.
- As a **person who needs the agent to read a specific masked value**, I want a
  click-to-reveal placeholder, so that I can opt into per-value exposure rather
  than disabling the whole rule.

### AI agents

- As a **browser-use agent reading the page**, I want PII and high-entropy
  credentials masked at read-time, so that I don't carry them into model context
  or downstream tool calls.
- As a **browser-use agent that may decide to reveal a value**, I want per-value
  placeholders labeled with the masked kind (e.g. `[card hidden]`,
  `[secret hidden]`), so that I can reason about whether to act on the redaction
  rather than guessing what was hidden.

## Functional requirements

- **FR-1.** `pii-redact` (default **on**) masks credit-card numbers
  (Luhn-validated), phone numbers, and US Social Security numbers in text-node
  content.
- **FR-2.** `secrets-redact` (default **on**) masks API keys, OAuth tokens,
  JWTs, private-key blocks, and other high-entropy credential shapes in
  text-node content.
- **FR-3.** Each masked value is replaced with an inline placeholder carrying
  the masked kind in its label, formatted `[<kind> hidden]` (e.g.
  `[card hidden]`, `[ssn hidden]`, `[phone hidden]`, `[jwt hidden]`,
  `[aws key hidden]`, `[secret hidden]`). The placeholder is a `<button>`
  element so screen readers and browser-use agents see it as actionable in the
  accessibility tree.
- **FR-4.** A click (or programmatic equivalent issued by the agent on the
  button) reveals the original text node in place and stamps
  `data-abs-revealed="<rule-id>"` on the restored node so a subsequent
  subtree-watcher scan doesn't immediately re-mask it.
- **FR-5.** Both rules re-scan late-inserted subtrees via the shared
  subtree-watcher (skipPlaceholderSubtrees: true) so credentials and PII
  arriving via SPA route changes, AJAX, or lazy lists are masked the same way as
  initial content.
- **FR-6.** Masking is text-node only. Both rules walk text content; element
  attributes are handled separately by
  [`attribute-injection-sanitize`](./0003-prompt-injection-defense.md) (against
  prompt-injection patterns, not credentials).
- **FR-7.** `secrets-redact` defers to itself rather than to `pii-redact` for
  JWTs — JWTs are excluded from `encoded-payload-redact` so the more specific
  secret label applies.

## Non-functional requirements

- **NFR-P-1.** Walks use the yielding text-walk helper
  (`lib/yielding-text-walk.ts`) so a large document doesn't block the main
  thread on a single scan.
- **NFR-S-1.** Masking is destructive at the carrier level (the placeholder
  replaces the text content). Originals live on the placeholder node for
  click-to-reveal but are otherwise not retained.
- **NFR-S-2.** The masking patterns are heuristic, not authoritative. Rules err
  on the side of false positives within the documented carrier shapes; full
  coverage of every PII format is explicitly out of scope (e.g. international
  phone formats, non-US national IDs).
- **NFR-O-1.** Per-frame mutation counts surface in the popup and badge so
  operators can see how often a page triggers masking.

## Current implementation

- FR-1: `extension/src/rules/pii-redact.ts`, tested in
  `extension/src/rules/__tests__/pii-redact.test.ts` and the property test
  `extension/src/rules/__tests__/pii-redact.property.test.ts`.
- FR-2: `extension/src/rules/secrets-redact.ts`,
  `extension/src/rules/__tests__/secrets-redact.test.ts`.
- FR-3, FR-4: `extension/src/lib/inline-text-redact.ts`,
  `extension/src/lib/placeholder.ts`.
- FR-5: `extension/src/lib/subtree-watcher.ts` shared subscription.
- FR-7: `extension/src/rules/encoded-payload-redact.ts` (JWT exclusion),
  `extension/src/rules/secrets-redact.ts` (JWT inclusion).

## Future work

- International phone and non-US national-ID coverage — out of scope today; no
  tracking issue.
- Email-address masking — not a current rule. The `attribute-injection-sanitize`
  rule covers `placeholder=…` text on hidden/disabled inputs against injection
  phrasings, but emails in rendered text pass through.
- Document-scoped redaction (e.g. driver license, passport number) — not
  shipped.

## Related

- ADRs: [ADR-0002](../decisions/0002-rule-id-naming-taxonomy.md) (rule-naming),
  [ADR-0010](../decisions/0010-no-telemetry.md) (no values exfiltrated).
- Docs: [`docs/src/content/docs/rules.md`](../docs/src/content/docs/rules.md)
  §"Sensitive-data masking".
- Specs: [0003](./0003-prompt-injection-defense.md) (overlapping carriers),
  [0013](./0013-privacy-and-egress.md).
