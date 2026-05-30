---
name: agent-browser-shield-diagnose
description: Diagnose why a specific benchmark task underperformed on guarded vs baseline — whether that's a judge pass/fail regression or a cost regression (extra tokens, steps, or duration). Use when the user asks "why did task X fail on guarded", "why is the guarded run worse than baseline on Y", "why did guarded cost more on Z", "what went wrong with run_<id>", or wants to investigate a flaky or expensive (scenario, task) cell in a benchmark report.
---

# Diagnosing an agent-browser-shield benchmark regression

Each benchmark run lives under `output/results/<run_id>/`. A regression is any
(task) where the guarded scenario underperforms baseline — either by judging
worse (pass/fail) or by spending materially more tokens / steps / time. Your job
is to explain *why* using the per-step trace data.

## 1. Locate the run and rows of interest

- Manifest: `output/results/<run_id>/manifest.json` — lists scenarios (with
  `extension: true|false`), tasks (`task`, `success_criteria`), and judge model.
- Results: `output/results/<run_id>/results.jsonl` — one row per (scenario,
  task, rep). Key fields: `scenario_id`, `task_id`, `repetition`, `judge.pass`,
  `judge.reason`, `extracted_answer.value`, `final_answer`, `steps_taken`,
  `duration_s`, `tokens`, `session_url`, `error`,
  `blocked_by_defense.{blocked,defense_type,step_index,reason}` (set by an
  inline LLM detector that classifies anti-bot interstitials like Cloudflare,
  captcha, 403/access-denied, 429/rate-limit, login walls).

A pass/fail regression is a (task_id) where the guarded scenario's `judge.pass`
rate trails the baseline scenario's. **Always check `blocked_by_defense.blocked`
first** — when the guarded scenario gets blocked at a different rate than
baseline, that's the regression's cause, not the agent's behavior, and the rest
of the diagnostic flow doesn't apply. A **cost regression** is one where the
guarded scenario's `tokens.total`, `steps_taken`, or `duration_s` is materially
higher than baseline — even when both scenarios pass. The two diagnostic flows
share the same data; what differs is which fields you sort and diff on.

For cost regressions specifically: compare `tokens.total` (and `tokens.input`,
since input tokens dominate at large a11y-tree sizes), `steps_taken`, and
per-step `tool_result.text` length across matched `ariaTree` steps. The
proximate cause is usually one of:

- the guarded tree is larger at each step (more markers, less hiding),
- the agent takes extra steps before acting (re-querying, retrying, hunting for
  placeholders), or
- a defense rule rerouted the agent down a longer path.

## 2. Read the structured trace bundle (preferred)

Build the bundles if not present:

```bash
uv run scripts/build_traces.py --run-id <run_id>
```

Per-trace files live at:

```text
output/results/<run_id>/traces/<scenario>__<task>__r<n>/
  summary.json    # the results.jsonl row
  steps.json      # ordered agent actions with reasoning + tool_call + tool_result
  messages.json   # the full LLM message log, normalized
```

`steps.json` is the primary diagnostic input. Each step has:

- `type` — `goto` / `act` / `ariaTree` / `extract` / `done` / `wait`
- `instruction`, `reasoning`, `page_url`, `ms_since_start`
- `tool_call.input` — what the agent asked the tool to do
- `tool_result.text` — what the tool returned. For `ariaTree` steps with
  `kind == "aria_tree"` this is the accessibility tree the agent observed.
- `tool_result.kind` — one of:
  - `aria_tree` — real a11y tree snapshot (starts with "Accessibility Tree:")
  - `aria_tree_placeholder` — Stagehand placeholder string returned when the
    tree wasn't materialized for that call; **diff these only against other
    placeholders, never against real trees**
  - `json` — structured tool output (e.g. `extract`, `done`, `goto`)
  - `text` / `empty` — plain text or no output
- `tool_result.text_sha256` — quick equality check between baseline and guarded.

## 3. Compare baseline vs guarded — the a11y-tree delta is the signal

agent-browser-shield modifies the page DOM (hides noise, masks PII, neutralizes
dark patterns, etc.). The fingerprint of those modifications is the **delta
between baseline and guarded `ariaTree` tool-result text at the same
milestone**. That delta is usually the proximate cause of a regression: a button
got hidden, a value got masked, a critical landmark got removed, or the tree got
large enough to push the agent over its step budget.

Two ways to view the diff:

- **HTML viewer (humans):** `output/reports/<run_id>__<task>.html` —
  side-by-side step list with an "a11y diff vs other side" `<details>` block on
  each real-tree `ariaTree` step. Open with:

  ```bash
  uv run scripts/build_traces.py --run-id <run_id> --task-id <task> --open
  ```

- **Programmatic (you):** read both `steps.json` files. Filter each to
  `type == "ariaTree"` AND `tool_result.kind == "aria_tree"`. Walk the resulting
  lists in order; the Nth real tree on each side describes the same diagnostic
  milestone (the build_traces diff viewer uses the same pairing). Where
  `text_sha256` differs, diff the two `tool_result.text` blocks. Pay attention
  to:

  - Missing nodes on the guarded side that the baseline used to read
  - `abs-placeholder` lines on the guarded side (see the `agent-browser-shield`
    skill for marker semantics) — the agent may have failed to recognize these
  - Extra `abs-cart-addon-flag` or `data-abs-cleared` markers
  - Truncation: large guarded trees can blow past the model's context budget

## 4. Cross-check against the reasoning chain

Once you see *what* the agent saw differently, read its `reasoning` text on the
step immediately after the diverging `ariaTree`. That's where the agent decided
what to do with the new view of the page. Common failure shapes:

- **Misread placeholder** — agent treats the placeholder's descriptor
  (`[… hidden — click to reveal]`, on the button's `aria-label`) as the literal
  answer instead of clicking through. Check the `agent-browser-shield` skill's
  "Required behavior" section for the contract.
- **Lost landmark** — agent can't find the element the baseline used; falls back
  to a worse heuristic and lands on the wrong row/listing/price.
- **Step exhaustion** — guarded run hits `max_steps` because the agent burns
  steps re-querying after the page changed under it. Check `summary.json`
  `steps_taken` vs `max_steps` and `completed_within_budget`.
- **Extraction schema miss** — `extract` step on guarded returns null/empty
  because the field was masked. Look at the step's `extract_result.value` and
  for tool results with `kind == "json"` carrying an empty/null value.

## 5. If the bundles aren't available

If `traces/` is empty (build hasn't been run), the same data is in
`output/results/<run_id>/events/<scenario>_<task>_r<n>.jsonl`. Each "data"
event's `payload.result` carries `actions[]`, `messages[]`, `usage`,
`completed`, `message`. Treat it as the raw form of `steps.json` —
`build_traces.py` is just a structured pass over this stream. Or run the script:
`uv run scripts/build_traces.py --run-id <run_id>` and proceed from §2.

## 6. Report back

When summarizing for the user, lead with the concrete a11y-tree delta or
behavioral divergence, not generic claims. Cite step index and `ms_since_start`
so they can jump straight to it in the HTML viewer. Example:

> On `wiki-claude` r1, the guarded run's step 3 `ariaTree` is missing the
> Wikipedia search-result link the baseline used (line "[0-218] link: Claude
> (language model)"). The agent's step-4 reasoning hunts for the heading
> instead, lands on the disambiguation page, and reports "DeepMind" — judge
> failed. Baseline's step 3 has the link present and clicks straight through.

Don't speculate beyond what the trace shows. If the cause isn't clear from
`steps.json` + `messages.json`, say so and recommend checking the Browserbase
session URL (in `summary.json`) while it's still within retention.
