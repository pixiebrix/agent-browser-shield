---
title: Install
description: Build the agent-browser-shield extension and load it into Chromium.
---

## Prerequisites

- **Chrome / Chromium 148+** — to load the extension. Any Chromium-based browser
  works (Chrome, Edge, Brave, Arc, Opera).
- **Node** ≥ 24 and **Bun** ≥ 1.3 — only needed if you're building from source.

## Install from the Chrome Web Store

The simplest path for everyday use. Install the published extension on any
Chromium-based browser:

[Add to Chrome — Chrome Web Store](https://chromewebstore.google.com/detail/agent-browser-shield/gnejacdioaelglahihpagpfjpddpnamd)

Updates roll out automatically through the store. Skip the rest of this page
unless you need an unpacked build (agent runtimes that load via
`--load-extension`), a ZIP for Browserbase, or a build off a specific commit.

## Download a prebuilt ZIP

Every release attaches the packaged extension to the GitHub Release. The
`latest` redirect follows the most recent release:

```text
https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip
```

`manifest.json` is at the archive root, so the ZIP can be uploaded straight to
[Browserbase](#using-it-with-browserbase), or unzipped and loaded into Chrome as
an unpacked extension (see [Load it into Chrome](#load-it-into-chrome)). Do not
re-zip after unpacking.

Build from source instead if you're iterating on rules or want a specific
commit.

## Build the extension

Clone the repository and build the extension bundle:

```sh
git clone https://github.com/pixiebrix/agent-browser-shield.git
cd agent-browser-shield/extension
bun install
bun run build
```

Build output is written to `extension/dist/`.

## Load it into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select either `extension/dist/` (built from
   source) or the directory you unzipped the prebuilt ZIP into.

The extension is now active. Reload any open tabs to pick up the content script.

## Customizing defaults at build time

Which rules ship on by default is enumerated in
[`extension/src/rules/rule-metadata.ts`](https://github.com/pixiebrix/agent-browser-shield/blob/main/extension/src/rules/rule-metadata.ts).
For one-off changes, edit that file and rebuild.

For infrastructure deployments where the same custom set of defaults should ship
in every build (so an agent doesn't have to flip toggles in the Options page on
each fresh session), pass a JSON override file to `bun run build`. A starting
template lives at
[`extension/data/defaults-overrides.example.json`](https://github.com/pixiebrix/agent-browser-shield/blob/main/extension/data/defaults-overrides.example.json):

```sh
cat > my-defaults.json <<'EOF'
{
  "reviews-redact": false,
  "ads-hide": false,
  "optionsButton": true
}
EOF

bun run build --defaults ./my-defaults.json
# or, equivalent:
EXTENSION_DEFAULTS_FILE=./my-defaults.json bun run build
```

The override file is a flat JSON object. Most keys are rule ids mapped to
booleans — the same shape the Options page exports and imports, so a file
exported from a tuned extension can be fed straight into the next build. A small
set of reserved keys is also accepted for non-rule build-time toggles:

- `optionsButton` (boolean, default **off**) — show the floating shield button
  in the bottom-right corner of every page that opens this extension's options
  page. Off by default because on sparse pages (JSON viewers, error screens,
  interstitials) it can dominate the accessibility tree and become a misleading
  target for browser-use agents. Enable for human-facing deployments where
  on-page access to options is useful.

- `runOnInactiveTabs` (boolean, default **off**) — keep the shared subtree
  watcher observing while the tab is hidden. Off by default because a hidden tab
  gets no observer callbacks, which avoids work the user can't see. Enable when
  something else reads the page while it's in the background (chat copilots,
  accessibility-tree agents, sidebar extensions) — without this, a page that
  mutates while hidden could reach the consumer unredacted.

- `debugTrace` (boolean, default **off**) — start with the dev-mode debug-trace
  recorder enabled. The recorder captures every rule-driven mutation (selector,
  before/after `outerHTML`, segment id) to IndexedDB and exposes
  `window.__abs_dumpTrace()` for CDP-driven harnesses to scrape — for
  investigating false positives (a rule hid, masked, or rewrote something it
  shouldn't have) after the fact. Enable in builds you ship to automation
  harnesses (Browserbase, Hermes, browser-use, OpenClaw) so the trace is on
  every session without a human flipping the popup toggle. See
  [Debug trace](/agent-browser-shield/debug-trace/) for the retrieval recipes
  and event schema.

- `placeholderAdaptivePalette` (boolean, default **off**, experimental) — sample
  each placeholder's ancestor backgrounds at insert time and pick a light or
  dark stripe palette so redactions on dark-themed pages don't flare against the
  page chrome. Off by default while the visual heuristic is still being tuned;
  the toggle is also surfaced in the Options page under the *Placeholder
  display* section so humans can flip it without rebuilding. Enable for
  deployments on consistently dark UIs.

A handful of rules expose sub-rule options in addition to the plain on/off
toggle. For those, a rule's value may be an ESLint-style object instead of a
boolean:

```json
{
  "encoded-payload-redact": {
    "enabled": true,
    "subRules": {
      "leetspeak": false,
      "nato": false,
      "morse": false
    }
  }
}
```

`enabled` is optional — when absent, the rule's committed default state is used.
Sub-rule fields are merged over the committed sub-rule defaults; omitted
sub-rules keep their default state. The rules that take sub-rule options and the
fields each accepts are declared in
[`extension/src/rules/rule-metadata.ts`](https://github.com/pixiebrix/agent-browser-shield/blob/main/extension/src/rules/rule-metadata.ts)
under `RULE_OPTION_DEFAULTS`. Today the only rule that takes options is
`encoded-payload-redact`, which exposes one sub-rule per encoding family
(`base64`, `hex`, `percent`, `substitutionCipher`, `leetspeak`, `nato`, `morse`)
— useful for turning off the higher-false-positive text ciphers without losing
coverage of the byte encodings.

Each sub-rule may also be an object carrying tuning thresholds — length floors,
common-word counts, printable-byte ratios — that override the file-scope
defaults in `rule-metadata.ts`:

```json
{
  "encoded-payload-redact": {
    "subRules": {
      "leetspeak": false,
      "nato": { "enabled": true, "minWords": 14 },
      "morse": { "enabled": true, "validRatio": 0.9 }
    }
  }
}
```

A bare boolean at a sub-rule is shorthand for `{ "enabled": <boolean> }`;
omitted threshold fields keep their committed default. Threshold meanings (and
the rationale for each shipping value) live in the rule source —
`extension/src/rules/encoded-payload-redact.ts` and
`extension/src/rules/rule-metadata.ts`. Threshold values are not range-checked
at the validator; operators tuning them are reading the rule source by
definition.

The file may be partial; rules not listed keep the committed default. A bare
boolean still works for any rule, including those with sub-rule options
(`"encoded-payload-redact": false` disables the entire rule). Unknown keys (rule
ids, reserved keys, sub-rule names, or threshold field names), object values for
rules without declared sub-rule options, and leaf values whose type doesn't
match the declared default (boolean → non-boolean, number → non-finite or
non-number) fail the build with a message naming the offending paths.

Build-time overrides only affect **fresh** `chrome.storage` — users who already
toggled rules in the Options UI keep their preferences. The typical target is
short-lived browser instances (e.g. browserbase containers) where storage starts
empty each session.

See [Rules](/rules/) for the full list of rule ids and what each does.

## Iterating

`bun run watch` rebuilds `extension/dist/` whenever a file in `extension/src/`
changes:

```sh
cd extension
bun run watch
```

After each rebuild, click the reload icon for the extension at
`chrome://extensions` and refresh any open tabs.

## Using it with Browserbase

The
[Browserbase extensions API](https://docs.browserbase.com/platform/browser/core-features/browser-extensions#browser-extensions)
accepts the prebuilt ZIP directly — download it from
`https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip`
and upload as-is.

To build the ZIP from source instead:

```sh
cd extension
bun run build
bun run package   # writes output/agent-browser-shield-extension.zip at the repo root
```

## Contributing

See
[CONTRIBUTING.md](https://github.com/pixiebrix/agent-browser-shield/blob/main/CONTRIBUTING.md)
for setup expectations and the contributor-license-agreement workflow.
