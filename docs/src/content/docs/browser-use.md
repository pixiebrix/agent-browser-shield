---
title: Use with browser-use
description: Run agent-browser-shield with browser-use by pointing its Agent at a local Chromium that has the extension installed, or at a Browserbase remote CDP session.
---

[browser-use](https://github.com/browser-use/browser-use) drives Chromium over
the Chrome DevTools Protocol. Its built-in `Browser()` launches a fresh Chromium
that does not load unpacked extensions, so `agent-browser-shield` has to ride
along on a browser the Agent merely *connects to* via `cdp_url`. Two paths work:

- **Local Chromium via `cdp_url`** — install the extension in a dedicated Chrome
  profile, launch it with `--remote-debugging-port`, and point the Agent's
  `BrowserSession` at `http://localhost:9222`. Best for development and for
  tasks that need your logged-in sessions.
- **Browserbase remote CDP** — upload a ZIP of the extension to Browserbase,
  create a session with the extension attached, and pass the session's
  `connect_url` as `cdp_url`. Best for headless / cloud runs.

## Local Chromium via `cdp_url`

### 1. Install the extension

Get the extension directory — either build from source (follow
[Install](/agent-browser-shield/install/) through `bun run build` for
`extension/dist/`) or download and unzip the
[prebuilt ZIP](/agent-browser-shield/install/#download-a-prebuilt-zip). You will
load that directory into the Chromium profile browser-use attaches to in step 3
— not your default Chrome profile.

### 2. Launch Chrome with remote debugging on a dedicated user-data-dir

browser-use connects over CDP at `localhost:9222`. The `--user-data-dir` flag is
**not optional**: launching a Chromium-family browser while a regular instance
is already running will reuse that running process, which was not started with
`--remote-debugging-port`, so port 9222 never opens.

macOS:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.browser-use/chrome-debug" \
  --no-first-run \
  --no-default-browser-check &
```

Linux:

```sh
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/.browser-use/chrome-debug \
  --no-first-run \
  --no-default-browser-check &
```

Because this is a fresh user-data-dir, load the extension into *this* profile:
open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**,
and select the directory from step 1. Pin the shield icon so you can confirm
it's live.

### 3. Wire up the Agent with `cdp_url`

Pass `cdp_url` through `BrowserProfile` to a `BrowserSession`, then hand the
session to the Agent:

```python
import asyncio
from browser_use import Agent
from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.llm import ChatOpenAI

async def main():
    browser_session = BrowserSession(
        browser_profile=BrowserProfile(
            cdp_url="http://localhost:9222",
            is_local=True,
        ),
    )

    agent = Agent(
        task="Find the top story on Hacker News and summarize the top comment.",
        llm=ChatOpenAI(model="gpt-4.1-mini"),
        browser_session=browser_session,
    )
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())
```

The Chrome you launched in step 2 stays running — browser-use attaches to it and
drives whatever tab is open. Skip to [Verify](#verify) to confirm the shield
woke up on the first page load.

### Caveats for the local-attach path

- **Your cookies are in scope.** Anything the agent navigates to is acting as
  whoever's logged into the dedicated profile. Treat it like any other
  session-bearing browser.
- **Extension reloads need a tab refresh.** After `bun run watch` rebuilds,
  click the reload icon at `chrome://extensions` and refresh the agent's tabs —
  browser-use won't do it for you.
- **`is_local=True` matters.** It tells browser-use the CDP endpoint is on the
  same machine, which enables file-download handling and other local-only
  affordances.

## Browserbase remote CDP

When you can't keep a local browser open — headless runs, CI, disposable
sessions — upload the extension to Browserbase and use the session's
`connect_url` as `cdp_url`. Follow
[Use with Browserbase (Python) → Upload the extension](/agent-browser-shield/browserbase-python/#upload-the-extension)
to get an `extension_id`, then create the session yourself and hand its URL to
browser-use:

```python
import asyncio
import os
from browserbase import Browserbase
from browser_use import Agent
from browser_use.browser import BrowserProfile, BrowserSession
from browser_use.llm import ChatOpenAI

async def main():
    bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])
    with open("output/extension.zip", "rb") as fh:
        extension = bb.extensions.create(file=fh)

    session = bb.sessions.create(
        project_id=os.environ["BROWSERBASE_PROJECT_ID"],
        extension_id=extension.id,
    )

    browser_session = BrowserSession(
        browser_profile=BrowserProfile(cdp_url=session.connect_url),
    )

    agent = Agent(
        task="Find the top story on Hacker News and summarize the top comment.",
        llm=ChatOpenAI(model="gpt-4.1-mini"),
        browser_session=browser_session,
    )
    await agent.run()

if __name__ == "__main__":
    asyncio.run(main())
```

The session is bound to the **extension at creation time**. A session created
without `extension_id` runs unguarded — there is no way to attach the extension
after the session starts. End it and start a new one.

## Brief the agent on what the shield changes

The extension rewrites the DOM — masked text becomes `[PII masked]`, dark
patterns get suppressed, and `[data-abs-rule="<rule-id>"]` attributes appear on
touched elements. Agents that don't know about these markers can get confused by
the redactions or try to bypass them.

The `skills/agent-browser-shield/SKILL.md` file in the repo is a system-prompt
fragment briefing the agent on what to expect. Pass its body (frontmatter
stripped) to the Agent via `extend_system_message` so the brief augments
browser-use's default system prompt instead of replacing it:

```python
from pathlib import Path

brief = Path("skills/agent-browser-shield/SKILL.md").read_text()
brief = brief.split("---", 2)[-1].strip()  # drop YAML frontmatter

agent = Agent(
    task="...",
    llm=ChatOpenAI(model="gpt-4.1-mini"),
    browser_session=browser_session,
    extend_system_message=brief,
)
```

Use `override_system_message` only if you've already replaced browser-use's
default prompt with your own.

## Verify

On the first non-trivial page load, look for:

- A circular shield-icon badge in the bottom-right corner (a11y name *"Open
  Agent Browser Shield options"*).
- `[data-abs-rule="<rule-id>"]` attributes in the DOM.
- Inline `[PII masked]` / `[secret masked]` chips on pages with sensitive data.

If none of those markers appear, the extension is not attached:

- *Local profile:* confirm the shield is pinned in the Chrome instance running
  against `$HOME/.browser-use/chrome-debug` (or whatever user-data-dir you
  used), not your default profile. `curl http://localhost:9222/json/version`
  confirms the CDP endpoint is up.
- *Browserbase:* confirm the session was created with `extension_id` from the
  upload step — there's no way to add the extension to an already-running
  session.

## Why not browser-use's built-in `Browser()`?

`Browser()` launches a fresh Chromium under browser-use's control and does not
expose a hook for loading an unpacked extension. Both paths above work around
that by handing browser-use a browser whose extension was loaded at launch and
letting it attach over CDP instead of provision.
