---
title: Install
description: Build the agent-browser-shield extension and load it into Chromium.
---

## Prerequisites

- **Chrome / Chromium 148+** — to load the extension.
- **Node** ≥ 24 and **Bun** ≥ 1.3 — only needed if you're building from source.

## Download a prebuilt ZIP

Each release publishes the packaged extension to S3. The `latest/` pointer
follows the most recent release:

```text
https://agent-browser-shield.s3.us-east-2.amazonaws.com/latest/extension.zip
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
`https://agent-browser-shield.s3.us-east-2.amazonaws.com/latest/extension.zip`
and upload as-is.

To build the ZIP from source instead:

```sh
cd extension
bun run build
bun run package   # writes output/extension.zip at the repo root
```

## Contributing

See
[CONTRIBUTING.md](https://github.com/pixiebrix/agent-browser-shield/blob/main/CONTRIBUTING.md)
for setup expectations and the contributor-license-agreement workflow.
