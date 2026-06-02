---
title: Use with OpenClaw
description: Run agent-browser-shield with OpenClaw — either inside your own browser profile via the existing-session driver, or in a Browserbase remote CDP session.
---

OpenClaw's [managed browser profile](https://docs.openclaw.ai/tools/browser) is
deliberately isolated and does not accept Chromium extensions, so
`agent-browser-shield` has to ride along on a browser OpenClaw merely *attaches*
to. Two paths work:

- **Local browser via existing-session** — install the extension in your own
  Chrome/Brave/Edge profile and have OpenClaw attach over CDP. Best for
  development and for tasks that need your logged-in sessions.
- **Browserbase remote CDP** — upload a ZIP of the extension to Browserbase and
  point OpenClaw at the session's connect URL. Best for headless / cloud runs.

The rest of this page covers both.

:::tip[Skill-aware agents]

If you're driving OpenClaw with a skill-aware agent, install the
`agent-browser-shield` skill from ClawHub instead of pasting these steps into a
prompt — it bundles the install paths below plus the runtime behavior rules:

```sh
clawhub install agent-browser-shield
```

:::

## Letting OpenClaw run your browser profile

This is the path you want when you'd rather hand OpenClaw the keys to a real
profile than spin up a remote browser. The extension installs normally; OpenClaw
attaches via CDP and inherits whatever's already loaded.

### 1. Install the extension into the profile

Get the extension directory — either build from source (follow
[Install](/agent-browser-shield/install/) through `bun run build` for
`extension/dist/`) or download and unzip the
[prebuilt ZIP](/agent-browser-shield/install/#download-a-prebuilt-zip). Then, in
the Chromium-based browser whose profile OpenClaw will drive:

1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select that directory.
4. Pin the shield icon so it's easy to confirm the extension is live.

Use a dedicated browser profile for agent runs if you don't want OpenClaw
touching your everyday tabs and cookies — create one from the browser's profile
switcher and install the extension only there.

### 2. Enable remote debugging and let OpenClaw attach

OpenClaw's `existing-session` driver (Chrome DevTools MCP under the hood)
attaches to a running Chromium instance. The built-in `user` profile targets
your default Chrome installation; add a custom profile for Brave, Edge, or a
non-default Chrome user data dir.

`~/.openclaw/config.json5`:

```json5
{
  browser: {
    enabled: true,
    defaultProfile: "shielded-local",
    profiles: {
      "shielded-local": {
        driver: "existing-session",
        attachOnly: true,
        // Point at the user-data-dir that has the extension installed.
        // Omit for the default Chrome profile (use the built-in `user` profile instead).
        userDataDir: "~/Library/Application Support/Google/Chrome/Profile 2",
        color: "#F97316",
      },
    },
  },
}
```

Then, with the browser running:

1. Open `chrome://inspect` (or the equivalent for your browser) and enable
   remote debugging.

2. Start the session:

   ```sh
   openclaw browser --browser-profile shielded-local start
   openclaw browser --browser-profile shielded-local tabs
   ```

3. Approve the connection prompt the browser shows when OpenClaw attaches.

Because `attachOnly: true` is set, OpenClaw will not launch or kill the browser
— keep it running for the duration of the agent task. Skip to [Verify](#verify)
to confirm the shield is active.

### Caveats for the local-profile path

- **Your cookies are in scope.** Anything the agent navigates to is acting as
  *you*. Use a separate profile for anything sensitive.
- **No isolation between tabs.** OpenClaw drives whatever tab you point it at,
  including ones you opened manually.
- **Extension reloads need a tab refresh.** After `bun run watch` rebuilds,
  click reload at `chrome://extensions` and refresh the agent's tabs — OpenClaw
  won't do it for you.

## Using a Browserbase remote CDP session

When OpenClaw can't attach to a local browser — headless runs, CI, or anywhere
you want disposable browser state — upload the extension to Browserbase and have
OpenClaw connect over CDP.

The flow:

1. Build and ZIP the extension.
2. Upload the ZIP to Browserbase to get an extension id.
3. Create a Browserbase session **with that extension id** and capture the
   connect URL.
4. Configure OpenClaw to use that URL as a remote CDP profile.

### 1. Get the extension ZIP

Download the
[prebuilt ZIP](/agent-browser-shield/install/#download-a-prebuilt-zip), or
follow [Install](/agent-browser-shield/install/) through `bun run package` to
build one yourself at `output/agent-browser-shield-extension.zip`. Either way,
`manifest.json` sits at the archive root — do not re-zip it.

### 2. Upload to Browserbase

Grab `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` from *Settings → API
Keys* at <https://www.browserbase.com>, then use the
[`browse` CLI](https://docs.browserbase.com/integrations/skills/browse-cli) to
upload:

```sh
npm install -g browse

export BROWSERBASE_API_KEY=bb_live_...
export BROWSERBASE_PROJECT_ID=...

browse cloud extensions upload ./output/agent-browser-shield-extension.zip
```

Stash the printed extension `id` — it's reusable across sessions until you
upload a new build.

### 3. Create a session with the extension attached

The extension is bound to the **session**, not the project. A session created
without `extensionId` runs unguarded — there is no way to attach the extension
after the session starts.

```sh
EXTENSION_ID=ext_...

curl -X POST https://api.browserbase.com/v1/sessions \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$BROWSERBASE_PROJECT_ID\",\"extensionId\":\"$EXTENSION_ID\"}"
```

Capture `connectUrl` from the response. It looks like
`wss://connect.browserbase.com?apiKey=...&sessionId=...`.

### 4. Point OpenClaw at the session

Add a remote CDP profile to your OpenClaw config:

```json5
{
  browser: {
    enabled: true,
    defaultProfile: "shielded",
    profiles: {
      shielded: {
        cdpUrl: "wss://connect.browserbase.com?apiKey=...&sessionId=...",
        color: "#F97316",
      },
    },
  },
}
```

Read the API key and connect URL from environment variables rather than
hardcoding them. Restart OpenClaw and start your task — the content script wakes
up on the first page navigation.

## Verify

On the first non-trivial page load, look for:

- A circular shield-icon badge in the bottom-right corner (a11y name *"Open
  Agent Browser Shield options"*).
- `[data-abs-rule="<rule-id>"]` attributes in the DOM.
- Inline `[PII masked]` / `[secret masked]` chips on pages with sensitive data.

If none of those markers appear, the extension is not attached:

- *Local profile:* confirm the shield is pinned in the browser whose
  `userDataDir` OpenClaw is attached to, and reload the agent's tabs.
- *Browserbase:* confirm the session was created with the `extensionId` from
  step 2 — there's no way to add the extension to an already-running session.

## Why not OpenClaw's managed profile?

OpenClaw's `openclaw` profile launches a dedicated Chromium under its own
control service and intentionally rejects unpacked extensions for isolation.
Both paths above work around that: existing-session reuses a browser you
control, and Browserbase moves traffic onto a remote browser that accepts
extension upload — neither gives up OpenClaw's control loop.
