---
name: agent-browser-shield-install
description: Install the agent-browser-shield Chromium extension into a claw browser session at startup. Three install paths — local headed Chrome (unpacked load), Browserbase remote (ZIP upload), and CDP-attach to a Chrome where the extension is already loaded. Use at session bootstrap, before navigating to any target page.
---

# Installing agent-browser-shield

Agent-browser-shield is a Manifest V3 Chromium extension that masks PII and
secrets, neutralizes dark patterns (sneak-into-basket add-ons, pre-checked
checkout boxes, scarcity / urgency cues), and strips prompt-injection surfaces
and engagement noise from the DOM **before the agent sees the page**. Runtime
behavior is documented in the companion `agent-browser-shield` skill; this skill
only covers getting the extension loaded.

## Pick your install path

| Browser session looks like…                                   | Use        |
| ------------------------------------------------------------- | ---------- |
| Your own headed Chromium with a persistent profile            | **Path A** |
| Remote browser running on Browserbase                         | **Path B** |
| Attaching via CDP / MCP to a Chrome the user already controls | **Path C** |

The hosted ZIP is at
`https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip`
and has `manifest.json` at the archive root. Do not re-zip it.

## Path A — Local headed Chromium, unpacked load

1. Download
   `https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip`
   and unzip to a stable directory, e.g.
   `~/.cache/agent-browser-shield/extension/`. The unzipped directory must
   contain `manifest.json` directly (no nested folder).

2. Launch Chromium **headed** with both flags pointing at that directory:

   ```text
   --load-extension=/abs/path/to/agent-browser-shield/extension
   --disable-extensions-except=/abs/path/to/agent-browser-shield/extension
   ```

3. If using Playwright, use `launch_persistent_context(user_data_dir, …)` —
   `launch()` ignores `--load-extension`.

4. **Headless mode silently drops `--load-extension`.** If you have no display,
   wrap Chromium in Xvfb (`xvfb-run -a …`).

5. OpenClaw / Hermes Claw and similar runtimes that ship their own managed
   Chromium profile: launch into the **user / existing-session** profile, not
   the isolated managed profile, otherwise the extension is sandboxed away from
   the pages the claw drives. Consult your runtime's CLI for the exact flag.

## Path B — Browserbase remote, ZIP upload

1. **Get credentials.** Sign in at <https://www.browserbase.com>, open *Settings
   → API Keys*, create a key. From the same dashboard copy the *Project ID*.
   Export both:

   ```sh
   export BROWSERBASE_API_KEY=bb_live_...
   export BROWSERBASE_PROJECT_ID=...
   ```

2. **Download** the ZIP from
   `https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip`.
   Do not unzip.

3. **Upload** the ZIP and capture the returned `id`. Pick one of the four
   transports below — they all hit the same endpoint and return the same
   extension id.

   **a. Browse CLI** (current, published as `browse`):

   ```sh
   npm install -g browse
   browse cloud extensions upload ./agent-browser-shield-extension.zip
   ```

   **b. Legacy Browserbase CLI** (`@browserbasehq/cli`, command `bb`). Still
   works, but the package is deprecated in favor of `browse`. Migrate with
   `npm uninstall -g @browserbasehq/cli && npm install -g browse`.

   ```sh
   npm install -g @browserbasehq/cli
   bb extensions upload ./agent-browser-shield-extension.zip
   ```

   **c. SDK:**

   ```ts
   const { id } = await bb.extensions.create({ file });   // Node
   ```

   ```py
   ext = bb.extensions.create(file=open("agent-browser-shield-extension.zip", "rb"))  # Python
   ```

   **d. REST:**

   ```sh
   curl -X POST https://api.browserbase.com/v1/extensions \
     -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
     -F "file=@agent-browser-shield-extension.zip"
   ```

4. Pass the returned id when creating the session: `extensionId` (Node SDK) or
   `extension_id` (Python SDK / REST). Sessions launched without it run an
   unguarded browser. The extension is tied to the session, not the project —
   every new session needs the id passed in.

5. **Driving the session from OpenClaw.** OpenClaw connects to Browserbase as a
   remote browser over CDP and does not itself upload extensions. The flow is:

   - Upload once via step 3 above and stash the returned id (it's reusable
     across sessions until you upload a new build).
   - Create the Browserbase session **with that extension id** (step 4), then
     hand OpenClaw the resulting CDP / WebSocket URL.
   - If you connect OpenClaw to a session that wasn't created with the extension
     id, the browser comes up unguarded — there is no way to attach the
     extension after the session starts.

6. The most common upload failure is `manifest.json` not at the archive root.
   The hosted ZIP is already correctly shaped; if you build your own, zip from
   inside the dist directory
   (`cd dist && zip -r ../agent-browser-shield-extension.zip .`), never the
   parent.

## Path C — CDP / MCP attach to user-controlled Chrome

The user is responsible for installing the extension once; the claw only
attaches.

1. Tell the user (once, then remember it's done):
   1. Download
      `https://github.com/pixiebrix/agent-browser-shield/releases/latest/download/agent-browser-shield-extension.zip`
      and unzip somewhere stable.
   2. Open `chrome://extensions`, enable **Developer mode**, click **Load
      unpacked**, select the unzipped directory.
   3. Confirm the extension is loaded by visiting `chrome://extensions` (or by
      checking the toolbar icon menu). The floating on-page options button is
      off by default — see *Customizing build-time defaults* below to ship a
      build with it on.
2. Attach via your runtime's normal CDP / Chrome DevTools MCP mechanism. No
   per-session extension setup on the claw side.

## Verify before doing real work

After the browser is up and you've navigated to any non-trivial page:

- Look for `[data-abs-rule]` attributes anywhere in the DOM, or for
  `.abs-placeholder` buttons whose text matches `[… hidden — click to reveal]`,
  or for inline `[PII masked]` / `[secret masked]` chips.
- If the build enables the floating on-page options button (off by default), a
  circular badge with selector `[data-abs="open-options"]` appears in the
  bottom-right corner.
- If none of those markers appear: the MV3 service worker may not have woken up.
  Navigate to a page that would trigger a rule (e.g. a product page for
  cart-addon-annotate, a page with an email address for pii-redact) and recheck. If
  still nothing, the extension is not installed.

## Customizing build-time defaults

For infra deployments where the same custom defaults should ship every session
(so the agent doesn't have to flip toggles at runtime), build from source with a
JSON override file instead of using the hosted ZIP.

1. Write a JSON file mapping rule ids to booleans, plus any of the reserved
   non-rule keys below. Rules not listed keep their committed default from
   `extension/data/rule-defaults.json`:

   ```json
   {
     "reviews-redact": false,
     "ads-hide": false,
     "optionsButton": true
   }
   ```

   Reserved non-rule keys:

   - `optionsButton` (boolean, default **off**) — show the floating shield
     button in the bottom-right corner of every page that opens this extension's
     options page. The button is visible to humans and to browser-use agents
     reading the accessibility tree. Off by default because on sparse pages
     (JSON viewers, error screens, interstitials) it can dominate the a11y tree
     and become a misleading "click me to make progress" target. Enable for
     human-facing deployments where on-page access to options is useful.

2. Pass the path via CLI flag or env var to `bun run build`:

   ```sh
   cd extension
   bun run build --defaults /abs/path/to/defaults.json
   # or:
   EXTENSION_DEFAULTS_FILE=/abs/path/to/defaults.json bun run build
   ```

3. Unknown keys (neither a registered rule id nor a reserved key) and
   non-boolean values fail the build with a clear error — catch typos before
   shipping.

4. Package and deploy as usual (`bun run package` then upload via Path A / B / C
   above). The overrides are baked into the bundle.

Build-time overrides apply only when `chrome.storage` is empty (fresh session).
Users with previously toggled state keep their preferences. The right fit is
short-lived browser instances (e.g. fresh Browserbase containers per session).

## After install

Load the companion skills if your runtime supports it:

- `agent-browser-shield` — what the DOM markers mean and how to act on them.
- `agent-browser-shield-config` — toggling individual rules and pasting JSON
  configs.
