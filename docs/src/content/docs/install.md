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

The file may be partial; rules not listed keep the committed default. Unknown
keys (neither a registered rule id nor a reserved key) and non-boolean values
fail the build with a message naming them.

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
