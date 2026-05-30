---
title: Use with Hermes Agent
description: Run agent-browser-shield alongside Nous Research's Hermes Agent by attaching Hermes to a local Chromium that has the extension installed.
---

[Hermes Agent](https://github.com/NousResearch/hermes-agent) drives a browser
either through a cloud provider (Browserbase, Browser Use, Firecrawl) or a local
Chromium it controls via CDP. None of those default paths load an unpacked
Chromium extension, so `agent-browser-shield` has to ride along on a browser
that Hermes *attaches* to.

## Local Chromium via `/browser connect`

### 1. Install the extension

Follow [Install](/agent-browser-shield/install/) through `bun run build`. You
will load `extension/dist/` into the Chromium profile that Hermes attaches to in
step 3 — not your default Chrome profile.

### 2. Launch Chrome with remote debugging on a dedicated user-data-dir

Hermes' `/browser connect` attaches over CDP at `localhost:9222`. The
`--user-data-dir` flag is **not optional**: launching a Chromium-family browser
while a regular instance is already running will reuse that running process,
which was not started with `--remote-debugging-port`, so port 9222 never opens.

macOS:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.hermes/chrome-debug" \
  --no-first-run \
  --no-default-browser-check &
```

Linux (Brave shown — same flags for Chrome / Chromium / Edge):

```sh
brave-browser \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/.hermes/chrome-debug \
  --no-first-run \
  --no-default-browser-check &
```

Because this is a fresh user-data-dir, load the extension into *this* profile:
open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
and select `extension/dist/`. Pin the shield icon so you can confirm it's live.

### 3. Attach from the Hermes CLI

```sh
hermes
```

Then, at the interactive prompt:

```text
/browser connect
/browser status
```

`/browser status` should report a connection to `localhost:9222`. Skip to
[Verify](#verify) to confirm the shield woke up on the first page load.

### Caveats for the local-attach path

- **Hybrid routing can intercept public URLs.** If `~/.hermes/.env` has cloud
  credentials set (e.g., `BROWSERBASE_API_KEY`), Hermes' default routing
  (`browser.auto_local_for_private_urls: true`) sends only private/LAN URLs to
  the local browser — public URLs go to the cloud provider, which is *not* the
  browser you installed the shield into. For a pure local-attach run, leave
  cloud credentials out of `~/.hermes/.env`.
- **Your cookies are in scope.** Anything the agent navigates to is acting as
  whoever's logged into the dedicated profile. Treat it like any other
  session-bearing browser.
- **Extension reloads need a tab refresh.** After `bun run watch` rebuilds,
  click the reload icon at `chrome://extensions` and refresh the agent's tabs —
  Hermes won't do it for you.

## Headless / cloud runs

For runs that can't keep a local browser open, see
[Use with OpenClaw → Using a Browserbase remote CDP session](/agent-browser-shield/openclaw/#using-a-browserbase-remote-cdp-session)
for the package / upload / create-session flow that produces a Browserbase
`connectUrl` with the extension already attached. Hermes documents
`/browser connect` only with a `ws://host:port` form; whether its connector
accepts the `wss://…?apiKey=…&sessionId=…` URL Browserbase returns hasn't been
verified here, so this page doesn't prescribe a remote-attach recipe yet.

## Verify

On the first non-trivial page load, look for:

- A circular shield-icon badge in the bottom-right corner (a11y name *"Open
  Agent Browser Shield options"*).
- `[data-abs-rule="<rule-id>"]` attributes in the DOM.
- Inline `[PII masked]` / `[secret masked]` chips on pages with sensitive data.

If none of those markers appear, the extension is not attached. Confirm the
shield is loaded in the Chrome instance running against
`$HOME/.hermes/chrome-debug` (or whatever user-data-dir you used), not your
default profile. `/browser status` from the Hermes CLI confirms the CDP
endpoint.

## Why not Hermes' default browser providers?

Hermes' first-party browser providers — Browserbase via its own session manager,
Browser Use, Firecrawl, and the Camofox local fallback — all create browsers
that Hermes provisions itself, and none of them expose a hook for loading an
unpacked Chromium extension. The path above works around that by handing Hermes
a browser whose extension was loaded at launch and letting Hermes attach instead
of provision.
