# Licensing

`agent-browser-shield` is **source-available** under the
[PolyForm Shield 1.0.0](./LICENSE) license. The source is public and you can
read, fork, modify, distribute, and use it commercially — the carve-out is that
you can't use it to build a product that competes with `agent-browser-shield`
itself or with any PixieBrix product that's built on top of it.

## What's allowed for free

PolyForm Shield permits use for **any purpose**, including commercial use, with
one exception (see
[What requires a commercial license](#what-requires-a-commercial-license)). That
covers, for example:

- Personal use: research, experiment, study, hobby projects.
- Internal use at a for-profit company — including incorporating it into
  internal tooling that supports revenue-generating activity.
- Embedding it inside a product or service whose value comes from something
  other than agent-browsing protection (e.g., a SaaS app that uses
  `agent-browser-shield` to harden its own agentic workflows).
- Use by charities, educational institutions, nonprofits, and government.

If your use falls in any of these buckets, you don't need to talk to us.

## What requires a commercial license

You need a separate commercial license from PixieBrix, Inc. if you want to
**provide a product that competes with `agent-browser-shield` or with any
PixieBrix product built on top of it**. Under PolyForm Shield, "competes" is
interpreted broadly: a competing product can be a service, library, plug-in,
port to a different platform or language, or even a free offering — what matters
is whether it's marketed as a practical substitute for the software or for one
of PixieBrix's products that uses it.

Concretely, that means you need a commercial license to:

- Sell, host, or otherwise offer a product whose core value is browser-agent
  shielding/redaction/preprocessing for end users or developers.
- Repackage or rebrand `agent-browser-shield` (or a derivative) as your own
  agent-protection product.
- Build a competitor to a PixieBrix commercial offering that incorporates
  `agent-browser-shield`.

If you're not sure whether your use is competing, **please ask** — it's faster
and cheaper than guessing wrong.

## How to obtain a commercial license

Email <support@pixiebrix.com> with:

- Your company and a brief description of the intended use.
- Approximate scale (number of seats, number of agents, deployment model).
- Whether you need indemnification, warranty, or support terms.

We respond within 5 business days.

## Contributions

By submitting a pull request to this repository, you agree to the terms of
PixieBrix's Contributor License Agreement (CLA). Sign once via the
[CLA form](FORM_URL) — see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

The CLA grants PixieBrix the right to relicense your contribution — including
under commercial terms — which is what lets us sell commercial licenses to
would-be competitors while keeping the project source-available for everyone
else. You retain copyright in your work.

## Dependencies

The dependencies that `agent-browser-shield` builds on are licensed permissively
(Apache 2.0, MIT, BSD, ISC) and remain under their own terms. The combined work
— `agent-browser-shield` plus its dependencies — is bound by PolyForm Shield
because of this project's license, not because of theirs.

## Why not Apache 2.0 or MIT?

Permissive OSS licenses are great for adoption but they don't give us a way to
fund continued development of `agent-browser-shield` against well-resourced
competitors who could fork it and ship a rival product. PolyForm Shield keeps
the source open and freely usable — including by commercial users — while
reserving the right to ship a competing agent-protection product for PixieBrix's
commercial customers. If you'd like to argue for a different license, please
open an issue — we're listening.
