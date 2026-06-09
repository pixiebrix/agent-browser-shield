---
status: accepted
date: 2026-06-04
---

# No telemetry; opt-in LLM rule is the only outbound call

## Context and Problem Statement

`agent-browser-shield` runs as a content script that inspects every page the
user visits. Telemetry would create both a privacy footprint and a Chrome Web
Store review surface. PR #134 documents the project's stance so users and
reviewers don't have to infer it from code.

## Decision Drivers

- The extension already does all rule processing locally; documenting the
  absence of telemetry makes the privacy story legible (`README.md` §"Privacy";
  `docs/src/content/docs/index.mdx` Privacy section, via PR #134).

## Considered Options

- Add product analytics / usage telemetry.
- Ship zero telemetry; explicitly document the one opt-in outbound call.

## Decision Outcome

Chosen option: **zero telemetry, with one explicitly opt-in outbound call.**

- "The extension does not collect, store, or send any telemetry, analytics, or
  usage data. Rule processing runs locally in your browser; nothing is reported
  back to PixieBrix or any other server." (`README.md` §"Privacy")
- "The one outbound network call the extension can make is the optional
  `irrelevant-sections-redact` rule (off by default), which sends a compressed
  page tree to OpenAI's API for classification when you enable the rule and
  configure an API key." (`README.md` §"Privacy")
- The same wording lands on the docs landing page so the privacy statement
  appears between the GitHub-star tip and the Disclaimer (PR #134 §"Summary").

### Consequences

- Good, because the privacy footprint is "nothing" by default — there is no
  analytics ingest to operate, secure, or document beyond this short statement.
- Neutral, because the LLM-backed rule (`irrelevant-sections-redact`) is off by
  default and requires the user to supply an API key (PR #26 §"Summary";
  `README.md` §"Privacy").

### Confirmation

- Privacy statement is reproduced verbatim in `README.md` §"Privacy" and
  `docs/src/content/docs/index.mdx`; future drift between the two is caught by
  review (PR #134 §"Test plan": "Skim the README on GitHub after merge to
  confirm the new section formats cleanly.").
- The LLM rule's network call is the only place the extension talks to a
  non-local endpoint; it is opt-in and gated on a user-supplied key (PR #26
  §"Summary").

## Pros and Cons of the Options

### Add product analytics

- Bad, because it conflicts with the documented "nothing is reported back"
  stance and would require a corresponding privacy-policy surface (`README.md`
  §"Privacy").

### Zero telemetry + opt-in LLM call

- Good, because users can verify the stance by inspecting the extension; there
  is no hidden surface.

## More Information

- PR
  [#134 — Document that the extension collects no telemetry](https://github.com/pixiebrix/agent-browser-shield/pull/134)
- PR
  [#26 — feat(extension): allow user-supplied OpenAI key to enable LLM rule](https://github.com/pixiebrix/agent-browser-shield/pull/26)
- [`README.md`](../README.md) §"Privacy"
- `docs/src/content/docs/index.mdx`
