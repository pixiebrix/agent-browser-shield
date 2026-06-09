# Architecture Decision Records

This directory holds Architecture Decision Records (ADRs) for
`agent-browser-shield`, written in the [MADR 4.0](https://adr.github.io/madr/)
format.

The records are a back-fill of load-bearing decisions reconstructed from merged
pull requests, issues, and the user-facing docs. Each ADR cites its primary
sources inline so readers can trace any claim back to a PR description, review
thread, issue body, or doc passage. No pro/con or motivation appears in an ADR
that is not supported by one of those citations.

## Index

| #                                                           | Title                                                                                         | Status                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [0001](./0001-source-available-license-and-cla.md)          | Source-available PolyForm Shield 1.0.0 license + CLA                                          | Accepted                                          |
| [0002](./0002-rule-id-naming-taxonomy.md)                   | Rule ID naming taxonomy (`<target>-<verb>`, five verbs)                                       | Accepted                                          |
| [0003](./0003-run-rule-engine-in-all-frames.md)             | Run rule engine in all frames                                                                 | Accepted                                          |
| [0004](./0004-centralize-dom-markers.md)                    | Centralize `data-abs-*` DOM markers in `lib/dom-markers.ts`                                   | Accepted                                          |
| [0005](./0005-lib-rules-import-boundary.md)                 | Enforce `lib/` ↔ `rules/` import boundary via ESLint                                          | Accepted                                          |
| [0006](./0006-re-scan-spa-mutations.md)                     | Re-scan SPA-mutated subtrees via a shared subtree watcher                                     | Accepted                                          |
| [0007](./0007-scrub-instead-of-detach-for-framework-dom.md) | Scrub data carrier, do not detach framework-rendered DOM                                      | Accepted                                          |
| [0008](./0008-shadow-dom-coverage.md)                       | Pierce open shadow roots; document closed roots as out-of-scope                               | Accepted                                          |
| [0009](./0009-rule-defaults-and-build-time-overrides.md)    | Rule defaults centralized in `rule-metadata.ts` + build-time override flag                    | Accepted (supersedes earlier JSON+codegen design) |
| [0010](./0010-no-telemetry.md)                              | No telemetry; opt-in LLM rule is the only outbound call                                       | Accepted                                          |
| [0011](./0011-build-time-decoded-injection-patterns.md)     | Encode prompt-injection patterns in YAML, decode at build time                                | Accepted                                          |
| [0012](./0012-biome-plus-eslint-split.md)                   | Biome + ESLint split with project-specific custom rules                                       | Accepted                                          |
| [0013](./0013-background-worker-purity-canary.md)           | Keep rule files out of the background service worker; enforce with a build-time purity canary | Accepted                                          |
| [0014](./0014-css-first-hide-for-selector-only-rules.md)    | CSS-first hide for selector-only `removeEntirely` rules                                       | Accepted                                          |
| [0015](./0015-calver-workflow-driven-release.md)            | CalVer + `workflow_dispatch`-driven extension release                                         | Accepted                                          |
| [0016](./0016-eslint-style-per-rule-options-shape.md)       | ESLint-style per-rule build-time options shape                                                | Accepted                                          |
| [0017](./0017-numeric-thresholds-as-rule-options.md)        | Numeric thresholds exposed as per-sub-rule options                                            | Accepted                                          |

## Conventions

- File names use `NNNN-kebab-case-title.md`.
- Status values: `Proposed`, `Accepted`, `Superseded by ADR-NNNN`, `Deprecated`.
- "More Information" sections list the primary sources used to write the ADR.
  When a citation gives a date, it is the merge date of the cited PR.
