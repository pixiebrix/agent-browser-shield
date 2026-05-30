---
title: Use with OpenClaw
description: Drive OpenClaw against a Browserbase session that has the agent-browser-shield extension loaded.
---

OpenClaw's [managed browser profile](https://docs.openclaw.ai/tools/browser)
is deliberately isolated and does not accept Chromium extensions. To run
OpenClaw with `agent-browser-shield` active, point it at a remote browser that
does support extension upload — currently only
[Browserbase](https://docs.browserbase.com/platform/browser/core-features/browser-extensions#browser-extensions).

The flow:

1. Build and ZIP the extension.
2. Upload the ZIP to Browserbase to get an extension id.
3. Create a Browserbase session **with that extension id** and capture the
   connect URL.
4. Configure OpenClaw to use that URL as a remote CDP profile.

## 1. Package the extension

Follow [Install](/agent-browser-shield/install/) through `bun run package`.
You'll end up with `output/extension.zip` whose `manifest.json` sits at the
archive root.

## 2. Upload to Browserbase

Grab `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` from *Settings → API
Keys* at <https://www.browserbase.com>:

```sh
export BROWSERBASE_API_KEY=bb_live_...
export BROWSERBASE_PROJECT_ID=...

curl -X POST https://api.browserbase.com/v1/extensions \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  -F "file=@output/extension.zip"
```

Stash the returned `id` — it's reusable across sessions until you upload a
new build.

## 3. Create a session with the extension attached

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

## 4. Point OpenClaw at the session

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
hardcoding them. Restart OpenClaw and start your task — the content script
wakes up on the first page navigation.

## Verify

On the first non-trivial page load, look for:

- A circular shield-icon badge in the bottom-right corner (a11y name *"Open
  Agent Browser Shield options"*).
- `[data-abs-rule="<rule-id>"]` attributes in the DOM.
- Inline `[PII masked]` / `[secret masked]` chips on pages with sensitive data.

If none of those markers appear, the extension is not attached — re-check that
the session was created with the `extensionId` from step 2. There is no way to
add the extension to an already-running session.

## Why not OpenClaw's managed profile?

OpenClaw's `openclaw` profile launches a dedicated Chromium under its own
control service and intentionally rejects unpacked extensions for isolation.
Pointing OpenClaw at a Browserbase CDP session moves the agent's traffic onto
a browser that *does* allow extension upload, without giving up OpenClaw's
control loop.
