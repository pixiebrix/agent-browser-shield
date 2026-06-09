---
status: accepted
date: 2025-10-09
---

# Source-available PolyForm Shield 1.0.0 license + CLA

## Context and Problem Statement

`agent-browser-shield` is published publicly and is intended to be usable
commercially, internally, or for research, while still allowing PixieBrix to
fund continued development against well-resourced competitors that could fork
the project and ship a rival. The choice of license also has to be compatible
with accepting outside contributions whose copyright the contributors retain.

## Decision Drivers

- "Permissive OSS licenses are great for adoption but they don't give us a way
  to fund continued development of `agent-browser-shield` against well-resourced
  competitors who could fork it and ship a rival product." (`LICENSING.md` §"Why
  not Apache 2.0 or MIT?")
- The need to keep the source open and freely usable, "including by commercial
  users", while reserving the right to ship a competing agent-protection product
  for PixieBrix's commercial customers (`LICENSING.md`).
- The need for outside contributions to be re-licensable under commercial terms
  so PixieBrix can sell commercial licenses to would-be competitors
  (`LICENSING.md` §"Contributions").

## Considered Options

- Apache 2.0 / MIT (permissive OSS).
- PolyForm Shield 1.0.0 (source-available with a competitor carve-out).

## Decision Outcome

Chosen option: **PolyForm Shield 1.0.0**, applied via `LICENSE` and explained in
`LICENSING.md`, plus a Contributor License Agreement that all contributors sign
once on their first PR. The CLA grants PixieBrix the right to relicense
contributions, "including under commercial terms — which is what lets us sell
commercial licenses to would-be competitors while keeping the project
source-available for everyone else" (`LICENSING.md` §"Contributions").

### Consequences

- Good, because use is permitted "for any purpose, including commercial use",
  subject to a single carve-out: building "a product that competes with
  `agent-browser-shield` or with any PixieBrix product built on top of it"
  requires a commercial license (`LICENSING.md` §"What's allowed for free",
  §"What requires a commercial license").
- Good, because contributors retain copyright while PixieBrix gets the
  re-licensing right needed to sustain a commercial track (`LICENSING.md`
  §"Contributions").
- Neutral, because dependencies licensed under Apache 2.0 / MIT / BSD / ISC
  remain under their own terms; the combined work is bound by PolyForm Shield
  because of this project's license, not theirs (`LICENSING.md`
  §"Dependencies").

### Confirmation

- The `LICENSE` file at the repo root holds the PolyForm Shield 1.0.0 text.
- The CLA flow is enforced by `CONTRIBUTING.md` §"Legal: license and CLA" and
  the `.github/CLA.md` document linked from contributor onboarding.

## Pros and Cons of the Options

### Apache 2.0 / MIT

- Good, because permissive OSS licenses help adoption (`LICENSING.md` §"Why not
  Apache 2.0 or MIT?").
- Bad, because they "don't give us a way to fund continued development of
  `agent-browser-shield` against well-resourced competitors who could fork it
  and ship a rival product." (`LICENSING.md` §"Why not Apache 2.0 or MIT?").

### PolyForm Shield 1.0.0

- Good, because it "keeps the source open and freely usable — including by
  commercial users — while reserving the right to ship a competing
  agent-protection product for PixieBrix's commercial customers."
  (`LICENSING.md` §"Why not Apache 2.0 or MIT?").

## More Information

- [`LICENSE`](../LICENSE)
- [`LICENSING.md`](../LICENSING.md)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) §"Legal: license and CLA"
- [`.github/CLA.md`](../.github/CLA.md)
