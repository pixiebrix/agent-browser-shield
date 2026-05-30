---
title: Install
description: Build the agent-browser-shield extension and load it into Chromium.
---

## Prerequisites

- **Node** ≥ 24 and **Bun** ≥ 1.3 — for the extension build.
- **Chrome / Chromium 148+** — to load the unpacked extension.

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
3. Click **Load unpacked** and select the `extension/dist/` directory.

The extension is now active. Reload any open tabs to pick up the content script.

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

Package the build into a ZIP suitable for the
[Browserbase extensions API](https://docs.browserbase.com/platform/browser/core-features/browser-extensions#browser-extensions):

```sh
cd extension
bun run build
bun run package   # writes output/extension.zip at the repo root
```

## Contributing

See
[CONTRIBUTING.md](https://github.com/pixiebrix/agent-browser-shield/blob/main/CONTRIBUTING.md)
for setup expectations and the contributor-license-agreement workflow.
