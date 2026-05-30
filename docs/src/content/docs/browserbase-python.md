---
title: Use with Browserbase (Python)
description: Upload agent-browser-shield to Browserbase and drive a session with the Python SDK — either via a managed agent run (Stagehand) or pure CDP (Playwright).
---

[Browserbase](https://www.browserbase.com) runs remote Chromium sessions that
accept Chromium extensions at session-create time. Once the extension is
uploaded, any Python client — Stagehand's managed agent loop, raw Playwright,
browser-use, etc. — can drive the session and inherit the shield's protections
on every page it visits.

The flow:

1. Build and ZIP the extension.
2. Upload the ZIP to Browserbase to get an extension id.
3. Create a session **with that extension id**.
4. Drive it from Python — either via a managed agent run or directly over CDP.

See the
[Browserbase extensions docs](https://docs.browserbase.com/platform/browser/core-features/browser-extensions)
for the canonical API reference; this page covers what's specific to
`agent-browser-shield`.

## Agent run vs. pure CDP — which to use?

Two patterns work with the extension, and the choice is independent of the
shield itself:

- **Managed agent run (Stagehand)** — you hand Stagehand a natural-language
  instruction and stream back tool-call events. Stagehand owns the LLM ↔
  browser loop server-side; you don't write the loop. Easy model swaps via
  Browserbase Model Gateway. Best for "give the agent a task and watch it
  go" — research, form-filling, end-to-end task benchmarks.
- **Pure CDP (Playwright / Selenium)** — you connect your own client to the
  session's `connect_url` and write the automation loop yourself, whether
  that's deterministic scraping or a custom agent framework (browser-use,
  LangChain, your own). Full Playwright API surface — waits, screenshots,
  request interception, multi-page coordination. Best for deterministic
  scrapers, integrations with non-Stagehand agent frameworks, or fine-grained
  DOM work the agent shouldn't be making decisions about.

Both paths upload and attach the extension the same way — only the driver
differs. You can also mix them: start with a Stagehand-managed session and
later attach Playwright to the same `connect_url` for surgical interventions.

## Prerequisites

- A packaged extension zip — follow [Install](/agent-browser-shield/install/)
  through `bun run package` to produce `output/extension.zip`.
- `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` from *Settings → API
  Keys* at <https://www.browserbase.com>.
- Python ≥ 3.11 with the
  [`browserbase`](https://pypi.org/project/browserbase/) SDK, plus
  [`stagehand`](https://pypi.org/project/stagehand/) (managed agent run) or
  [`playwright`](https://pypi.org/project/playwright/) (pure CDP).

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

Creating a session with an extension is slower than without — Browserbase
restarts the remote browser to load it. Build the session once and reuse it for
the whole task instead of paying that cost per page.

## Path A: Managed agent run (Stagehand)

Stagehand owns session creation when you use its agent loop — pass the
`extension_id` through `browserbase_session_create_params` so Stagehand's
server-side context has the extension attached from the start.

```python
import os
from browserbase import Browserbase
from stagehand import Stagehand

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])
with open("output/extension.zip", "rb") as fh:
    extension = bb.extensions.create(file=fh)

stagehand = Stagehand(
    browserbase_api_key=os.environ["BROWSERBASE_API_KEY"],
    browserbase_project_id=os.environ["BROWSERBASE_PROJECT_ID"],
)

session = stagehand.sessions.start(
    model_name="openai/gpt-5-mini",
    browserbase_session_create_params={"extension_id": extension.id},
)
stagehand.sessions.navigate(id=session.id, url="https://news.ycombinator.com")

for event in stagehand.sessions.execute(
    id=session.id,
    agent_config={"model": "openai/gpt-5-mini"},
    execute_options={
        "instruction": "Find the top story and summarize the top comment.",
        "maxSteps": 15,
    },
):
    print(event)

stagehand.sessions.end(id=session.id)
```

Stagehand has to own the session — if you create it with `bb.sessions.create()`
and try to attach Stagehand after the fact, `sessions.execute()` fails with a
null-active-page error because Stagehand's server-side context has no page to
drive.

For a fully wired runner with logging, skill briefing, and CLI flags, see
`scripts/agent_task.py` in the repo — pass `--with-extension` to upload and
attach `output/extension.zip` automatically.

## Path B: Pure CDP (Playwright)

You own the session and the driver. Create the Browserbase session yourself
with `extension_id`, then connect Playwright (or Selenium) to `connect_url`:

```python
import os
from browserbase import Browserbase
from playwright.sync_api import sync_playwright

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])
with open("output/extension.zip", "rb") as fh:
    extension = bb.extensions.create(file=fh)

session = bb.sessions.create(
    project_id=os.environ["BROWSERBASE_PROJECT_ID"],
    extension_id=extension.id,
)

with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp(session.connect_url)
    page = browser.contexts[0].pages[0]
    page.goto("https://news.ycombinator.com")
    # ... your scraping / agent loop ...
    browser.close()
```

The content script wakes up on the first non-trivial navigation; the shield
badge and `[data-abs-rule="…"]` markers appear in the DOM as soon as a rule
fires. From here you can use Playwright as normal — `page.locator()`,
`page.evaluate()`, network interception, screenshots, etc.

Any Python framework that accepts a CDP URL works the same way — pass
`session.connect_url` to browser-use, LangChain's browser tools, or your own
agent runner.

## Brief the agent on what the shield changes

The extension rewrites the DOM — masked text becomes `[PII masked]`, dark
patterns get suppressed, and `[data-abs-rule="<rule-id>"]` attributes appear
on touched elements. Agents that don't know about these markers can get
confused by the redactions or try to bypass them.

The `skills/agent-browser-shield/SKILL.md` file in the repo is a system-prompt
fragment briefing the agent on what to expect:

- **Stagehand agent run** — prepend the skill body (frontmatter stripped) to
  the `instruction` you pass to `execute_options`. `scripts/agent_task.py`
  does this automatically when `--with-extension` is set.
- **Pure CDP with your own agent** — prepend the skill body to whatever
  system prompt your agent framework uses.
- **Deterministic scrapers** — skip the brief; just read the markers
  directly.

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
`extension_id` was passed to `bb.sessions.create()` (pure CDP) or
`browserbase_session_create_params` (Stagehand). There is no way to add the
extension to an already-running session; end it and start a new one.
