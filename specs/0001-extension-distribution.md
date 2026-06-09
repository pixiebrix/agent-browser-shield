---
status: Current
last_reviewed: 2026-06-09
---

# Extension distribution

## Purpose

How `agent-browser-shield` reaches end users and agent runtimes — the shipping
formats, supported browser, and licensing posture that gate use. Covers Chrome
Web Store install, prebuilt ZIP, and build-from-source paths.

## User stories

### Human users

- As a **person who wants the shield on my own browser**, I want a one-click
  Chrome Web Store install that auto-updates, so that I don't have to track
  releases manually.
- As a **person evaluating the extension on a managed profile**, I want a
  prebuilt ZIP I can load unpacked, so that I can run a specific release without
  going through the store.
- As a **person iterating on rules**, I want to build from source and
  hot-reload, so that I can test a change in minutes.

### AI agents

- As a **CDP/Browserbase harness operator**, I want a ZIP whose `manifest.json`
  sits at the archive root, so that I can upload directly to the Browserbase
  extensions API.
- As an **agent runtime that attaches via existing session (OpenClaw)**, I want
  the extension to install normally into a real Chromium profile, so that
  attaching over CDP inherits the loaded extension.

## Functional requirements

- **FR-1.** A published build is available on the Chrome Web Store under
  extension ID `gnejacdioaelglahihpagpfjpddpnamd`.
- **FR-2.** The extension targets **Chromium 148+** (any Chromium-based browser:
  Chrome, Edge, Brave, Arc, Opera).
- **FR-3.** Every GitHub Release attaches a prebuilt ZIP at the conventional URL
  `https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip`.
  `manifest.json` sits at the ZIP root; the archive can be uploaded to
  Browserbase as-is or unzipped and loaded unpacked.
- **FR-4.** `bun run build` in `extension/` produces an unpacked build at
  `extension/dist/`; `bun run package` writes a ZIP to
  `output/agent-browser-shield-extension.zip`.
- **FR-5.** `bun run watch` rebuilds `extension/dist/` on source changes,
  supporting hot-reload via `chrome://extensions`.
- **FR-6.** The extension is licensed under [PolyForm Shield 1.0.0](../LICENSE).
  Use is permitted for any purpose including commercial use, with a single
  carve-out: building a product that competes with `agent-browser-shield` or
  with a PixieBrix product built on it requires a commercial license.
- **FR-7.** Contributors sign a CLA on their first PR; this preserves
  contributor copyright while granting PixieBrix the relicensing right needed to
  sell commercial licenses.
- **FR-8.** Releases follow CalVer and are cut via `workflow_dispatch`.

## Non-functional requirements

- **NFR-M-1.** The published Chrome Web Store build must be reproducible from
  the tagged commit (no proprietary build steps).
- **NFR-S-1.** Releases must not bundle obfuscated code; build-time decoding
  (e.g. injection patterns) emits plaintext sources before bundling. See
  [ADR-0011](../decisions/0011-build-time-decoded-injection-patterns.md).
- **NFR-U-1.** A first-time installer should be able to go from "want this" to
  "extension active" in under three clicks via the Chrome Web Store.

## Current implementation

- FR-1, FR-2: `extension/src/manifest.json` (`minimum_chrome_version: 148`).
- FR-3: GitHub Releases workflow; see
  [ADR-0015](../decisions/0015-calver-workflow-driven-release.md).
- FR-4, FR-5: `extension/package.json` scripts (`build`, `package`, `watch`),
  `extension/build.ts`.
- FR-6: [`LICENSE`](../LICENSE), [`LICENSING.md`](../LICENSING.md).
- FR-7: [`CONTRIBUTING.md`](../CONTRIBUTING.md) §"Legal: license and CLA",
  [`.github/CLA.md`](../.github/CLA.md).
- FR-8: [ADR-0015](../decisions/0015-calver-workflow-driven-release.md).

## Future work

- Edge add-ons store / Firefox add-ons listing — neither shipped today; Firefox
  would require a separate MV3 build path and is out of scope.

## Related

- ADRs: [ADR-0001](../decisions/0001-source-available-license-and-cla.md),
  [ADR-0015](../decisions/0015-calver-workflow-driven-release.md).
- Docs:
  [`docs/src/content/docs/install.md`](../docs/src/content/docs/install.md).
- Specs: [0011](./0011-build-time-customization.md).
