---
title: Use with Browserbase (Python)
description: Upload agent-browser-shield to Browserbase and drive a session with the Python SDK — direct CDP via Playwright, or higher-level frameworks like Stagehand.
---

[Browserbase](https://www.browserbase.com) runs remote Chromium sessions that
accept Chromium extensions at session-create time. Once the extension is
uploaded, any Python client — raw Playwright, Stagehand, browser-use, etc. — can
connect over CDP and inherit the shield's protections on every page it visits.

The flow:

1. Build and ZIP the extension.
2. Upload the ZIP to Browserbase to get an extension id.
3. Create a session **with that extension id**.
4. Connect over CDP from Python and drive it.

See the
[Browserbase extensions docs](https://docs.browserbase.com/platform/browser/core-features/browser-extensions)
for the canonical API reference; this page covers what's specific to
`agent-browser-shield`.

## Prerequisites

- A packaged extension zip — follow [Install](/agent-browser-shield/install/)
  through `bun run package` to produce `output/extension.zip`.
- `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` from *Settings → API
  Keys* at <https://www.browserbase.com>.
- Python ≥ 3.11 with the
  [`browserbase`](https://pypi.org/project/browserbase/) SDK and (for the
  Playwright example below) [`playwright`](https://pypi.org/project/playwright/).

## Upload the extension

The extension is bound to a **session**, not the project. A session created
without `extension_id` runs unguarded — there is no way to attach the extension
after the session starts. The uploaded extension id is reusable across sessions
until you upload a new build.

```python
import os
from browserbase import Browserbase

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])

with open("output/extension.zip", "rb") as fh:
    extension = bb.extensions.create(file=fh)

print(extension.id)  # ext_...
```

Stash `extension.id` somewhere reusable (env var, config, in-memory for the
duration of the run). Re-upload only when you rebuild.

## Create a session with the extension attached

```python
session = bb.sessions.create(
    project_id=os.environ["BROWSERBASE_PROJECT_ID"],
    extension_id=extension.id,
)

print(session.connect_url)  # wss://connect.browserbase.com?...
```

Creating a session with an extension is slower than without — Browserbase
restarts the remote browser to load it. Build the session once and reuse it for
the whole task instead of paying that cost per page.

## Drive it from Playwright

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp(session.connect_url)
    page = browser.contexts[0].pages[0]
    page.goto("https://news.ycombinator.com")
    # ... agent loop, scraping, etc.
    browser.close()
```

The content script wakes up on the first non-trivial navigation; the shield
badge and `[data-abs-rule="…"]` markers appear in the DOM as soon as a rule
fires. See [Verify](#verify) below.

## Higher-level frameworks

Any Python framework that accepts a Browserbase `connect_url` (or
`extension_id` via session-create params) works the same way:

- **Stagehand** — pass `extension_id` through
  `browserbase_session_create_params` when starting the session. The repo's
  `scripts/agent_task.py` is a working example; run it with `--with-extension`
  to upload `output/extension.zip` and attach it to a Stagehand-managed
  session.
- **browser-use, LangChain browser tools, etc.** — create the session with
  `bb.sessions.create(..., extension_id=...)` yourself, then hand
  `session.connect_url` to the framework's CDP entry point.

## Brief the agent on what the shield changes

The extension rewrites the DOM — masked text becomes `[PII masked]`, dark
patterns get suppressed, and `[data-abs-rule="<rule-id>"]` attributes appear
on touched elements. Agents that don't know about these markers can get
confused by the redactions or try to bypass them.

The `skills/agent-browser-shield/SKILL.md` file in the repo is a system-prompt
fragment briefing the agent on what to expect. `scripts/agent_task.py`
auto-prepends it when `--with-extension` is set; for your own client, read the
file and prepend its body (frontmatter stripped) to your agent's instructions.

## Verify

On the first non-trivial page load, look for:

- A circular shield-icon badge in the bottom-right corner (a11y name *"Open
  Agent Browser Shield options"*).
- `[data-abs-rule="<rule-id>"]` attributes in the DOM.
- Inline `[PII masked]` / `[secret masked]` chips on pages with sensitive
  data.

Open the session's live view at
`https://www.browserbase.com/sessions/<session.id>` to inspect the rendered
page directly.

If none of those markers appear, the session was almost certainly created
without the `extension_id` — confirm the upload step succeeded and that
`extension_id` was passed to `bb.sessions.create()`. There is no way to add
the extension to an already-running session; end it and start a new one.
