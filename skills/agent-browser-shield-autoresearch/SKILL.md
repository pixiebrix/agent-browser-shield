---
name: agent-browser-shield-autoresearch
description: Run an experiment to understand how the guarded extension affects an agent on a specific task — for one model or across several — and turn the observations into concrete rule-change proposals (tighten a built-in default, add a site-specific rule, drop a rule, or ship a new defense). Use when the user asks "research how guard does on task X", "is the extension helping on Y", "what should we change to do better on Z", "test this task across models", "should we add a site rule for this", or "see if our rules pay off here". NOT for explaining an existing benchmark row (use `agent-browser-shield-diagnose`), authoring new task CSV rows (use `agent-browser-shield-tasks`), adding selectors to a known site after you've already decided the recipe (use `agent-browser-shield-site-rules`), or extension build/install configuration (use `agent-browser-shield-install`).
---

# Autoresearch: guarded vs unguarded on a focused task

This skill drives `scripts/compare_scenarios.py` as a research loop. The goal is
to *learn* whether the extension helps, hurts, or is neutral on a given task —
and decide what to change next: tune a built-in rule default, add a per-site
recipe under `extension/data/sites/`, drop a rule that's hurting more than it
helps, or propose a new defense.

This is the proactive counterpart to `agent-browser-shield-diagnose`. Diagnose
explains an existing run; autoresearch runs a fresh experiment focused on one
task and forms a recommendation.

## When to invoke

- User points at a specific task (or task pattern) and asks how the extension
  performs on it.
- User suspects a defense is helping or hurting and wants a measurement.
- User wants to test the same task across multiple models to see whether the
  guard's benefit generalizes.
- User wants concrete change proposals grounded in the trace, not speculation.

If the user already has a run in hand and just wants the *why*, hand off to
`agent-browser-shield-diagnose` instead.

## Pre-flight

- `output/extension.zip` exists (any scenario with `extension: true` needs it).
  Build with `cd extension && bun run build && bun run package && cd ..` if not.
- `OPENAI_API_KEY` is in `.env` (the judge always calls OpenAI directly,
  regardless of the agent model).
- `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` are in `.env`.
- The two scenarios you'll compare both exist in
  `benchmark/scenarios.example.yaml` (or whatever `--scenarios-file` you pass).
  The shipped file defines `gpt5-mini-baseline` and `gpt5-mini-guarded`. For
  "across models", scenarios for additional model pairs need to be added there
  first — don't guess names, ask the user or read the file.
- The task id exists in `benchmark/tasks.csv` (or the BU Bench file).
- `scripts/llm_proxy.py` is running with a public tunnel
  (`cloudflared tunnel --url http://127.0.0.1:8787`) and `OPENAI_API_KEY` set in
  the proxy's env. The proxy is OpenAI-only today — see `benchmark/README.md`
  "Capturing the LLM messages (proxy)". The runner appends `/v1` to the tunnel
  URL automatically; pass the bare tunnel root to `--llm-proxy-url`. If the
  proxy is not running, stop and ask the user to start it before continuing — do
  not run a comparison without it (see §1 for why).

## 1. Run the focused comparison

Default: 3 reps per scenario to absorb agent stochasticity (which can swing step
counts by ±2 on the same task even without rule changes).

```bash
uv run scripts/compare_scenarios.py \
    --scenario <baseline_id> \
    --scenario <guarded_id> \
    --task <task_id> \
    -n 3 \
    --llm-proxy-url <tunnel-root>
```

`--llm-proxy-url` is required for autoresearch, not optional. Stagehand stubs
intermediate `ariaTree` tool returns to a 48-byte placeholder ("ARIA tree
extracted for context of page elements") and only embeds the *final* page's full
a11y tree into `messages.json`. Without the proxy, you cannot see what the agent
saw on intermediate pages — which is usually where the rule fingerprint that
derailed it lives. The proxy captures the actual request bodies the runner ships
to OpenAI, including the full tree at every turn. If the user declines to run
the proxy, say so and proceed with `steps.json`/`messages.json` alone, but flag
that intermediate-page conclusions will be speculative.

The script writes:

- `output/results/<run_id>/cost_diff.md` — aggregate + per-rep token/cost/step
  deltas, paired step-by-step a11y-byte deltas. Read this first.
- `output/results/<run_id>/traces/<scenario>__<task>__r<n>/{summary,steps,messages}.json`
  — per-rep structured traces. `messages.json` only shows the final-page tree at
  full size; everything earlier is stubbed.
- `output/llm-proxy/proxy_<UTC-timestamp>.jsonl` — one JSON record per LLM call
  with the full request body (system prompt, history, current a11y-tree-bearing
  user message) and response. This is the authoritative per-turn view;
  cross-reference by timestamp with `steps.json`.
- `output/reports/<run_id>__<task>.html` — side-by-side HTML diff (for humans).

## 2. Read the digest

Pull the headline numbers from `cost_diff.md`:

- Pass-rate per scenario.
- Aggregate Δ on `steps (mean)`, `total tokens (mean)`, `cost USD (mean)`,
  `duration (mean)`. Anything < ±10% with n=3 is likely noise.
- Per-rep table: if 2/3 reps are roughly equal and 1 rep is wildly different,
  the delta is probably stochastic (one rep happened to take a different path).
  Read `final_answer` for those reps to confirm they reached the same
  conclusion.

Classify the outcome:

- **Guard helps** — fewer steps and/or tokens, same pass rate or better.
- **Guard hurts** — more steps/tokens or worse pass rate.
- **Guard is neutral** — within noise on every metric.
- **Guard flips behavior** — same aggregate cost but different step types (e.g.
  agent chose `goto` instead of `act`+`keys`). Worth investigating because it
  implies a rule is steering the agent.

## 3. Find the rule fingerprint

Open the proxy log and diff the a11y trees at the turn where the two scenarios
*first diverged* in step type or target — that's where the rule changed the
agent's mind. Diff with **node IDs normalized** (raw IDs like `[0-7195]` shift
between captures even when content is identical — without normalization the diff
is mostly noise).

```python
import json, re, difflib

# Stagehand sends the current a11y tree as the latest user-role message
# in the messages array; pluck the user-role text from each proxy record.
def turns(log_path, session_id=None):
    out = []
    with open(log_path) as f:
        for line in f:
            r = json.loads(line)
            req = r.get("request_body") or {}
            msgs = req.get("messages") or []
            # Last user message carries the current ariaTree
            for m in reversed(msgs):
                if m.get("role") == "user":
                    c = m.get("content")
                    text = c if isinstance(c, str) else " ".join(
                        p.get("text","") for p in c if isinstance(p, dict))
                    out.append((r.get("timestamp"), text))
                    break
    return out

baseline = turns("output/llm-proxy/proxy_<ts>.jsonl")  # filter to baseline session if multi
guarded  = turns("output/llm-proxy/proxy_<ts>.jsonl")  # filter to guarded session

# Pick the turn at the divergence point (usually 1-3 turns after both
# scenarios agree on the same opening act/goto)
bt, gt = baseline[N][1], guarded[N][1]
norm = re.compile(r"\[\d+-\d+\]")
strip = lambda t: [norm.sub("[ID]", l) for l in t.splitlines()]
diff = list(difflib.unified_diff(strip(bt), strip(gt), n=0, lineterm=""))
for l in diff:
    if l and l[0] in "+-" and not l.startswith(("+++", "---")):
        print(l[:160])
```

If the proxy multiplexed multiple parallel sessions into one log (the runner's
default concurrency is `len(scenarios) × reps`), filter records by the
session-correlation field the proxy writes — check the first record's keys, or
split logs per run by stopping/starting the proxy between scenarios.

The `-` lines are what the extension *stripped* from the page; the `+` lines are
what it *added* (placeholders like `[footer hidden — click to reveal]`, helper
notes like `abs URL helper`, marker buttons). Those together are the guard's
fingerprint at the divergence turn.

Cross-check with the agent's next move: the next assistant-role message in the
proxy log shows the tool call the agent issued *given* that tree. Did it act on
a hint the extension injected? Did it get blocked by a placeholder it couldn't
interpret? Did stripped content leave the next-best clickable target looking
artificially attractive?

## 4. Propose changes

Map what you observed to a concrete change. Pick one of:

- **Tighten a built-in rule default** — `extension/data/rule-defaults.json`.
  Disable a rule that's hurting more than it helps, or enable one that's
  off-by-default but would help.
- **Add a site-specific rule** — `extension/data/sites/<host>.yaml`. Hand off to
  `agent-browser-shield-site-rules` for the selector-authoring workflow. Common
  case: the guard's generic stripping missed something host-specific, or the
  agent would benefit from a search-URL helper hint that doesn't yet exist for
  this host.
- **Drop or narrow a rule** — when the trace shows a rule firing on
  false-positive content (e.g. masking a real product price as PII, or stripping
  a navigation element the agent needed).
- **Ship a new defense rule** — when no existing rule covers the observed bad
  content (a new dark-pattern variant, a new PII shape, etc.). Reference the
  `agent-browser-shield` skill for the rule contract.
- **Do nothing** — the delta is within noise, or the guard is already optimal on
  this task.

State the proposal in terms of: the file to change, the specific change, and the
trace evidence supporting it. Don't propose changes that aren't grounded in the
trace.

## 5. Across-model loop (optional)

If the user asked "across models" and multiple `(baseline, guarded)` scenario
pairs exist in the scenarios file:

1. Run §1 once per pair.
2. Apply §2–§3 to each run.
3. Synthesize: does the guard's effect generalize across models, or is it
   model-specific?

Common patterns:

- **Helps small models more** — guard's hints (e.g. URL helpers) substitute for
  capabilities the larger model already has. Recommendation: keep the rule on by
  default; it's cheap insurance.
- **Helps large models more** — the guard reveals enough page structure for a
  smarter model to choose better, but a weaker model can't capitalize.
  Recommendation: depends on the target deployment.
- **Hurts one model, helps another** — likely a rule that interacts with how a
  specific model interprets the page. Worth a per-rule investigation.

If there's only one model pair available (the shipped file), say so and
recommend adding scenarios for the other models the user cares about before
extending the experiment.

## 6. Report back

Lead with: the classification (helps / hurts / neutral / flips), the headline
metric delta with its noise caveat (`n=3`), the *specific* rule fingerprint
observed in the a11y diff, and the proposed change. Cite paths so the user can
verify:

> On `wiki-claude` (n=3), guarded is **-14% tokens, -17% steps** vs baseline,
> 3/3 pass on both. The aggregate is dominated by 1 rep where guarded chose
> `goto` (1 step) instead of the typical search-click-wait path (3 steps); the
> other 2 reps were equal. The a11y diff at the article-page snapshot shows the
> extension injects an `abs URL helper` note ("prefer URL navigation over
> typing. Direct article: /wiki/{Title_With_Underscores}") — that's the hint the
> agent followed in rep 2. Footer stripping accounts for the other -1,400 bytes
> per article-page tree.
>
> **Proposal**: keep `search-url-helper` enabled (`rule-defaults.json` shows
> it's already true). Optionally add more Wikipedia URL templates to
> `extension/data/sites/wikipedia.yaml` if other reps had been searching from
> non-Main_Page entry points. Evidence: `output/results/cmp_<id>/cost_diff.md`,
> `output/results/cmp_<id>/traces/.../steps.json` step 4.

Don't recommend a change unless the trace supports it. If the experiment is
inconclusive at n=3, recommend re-running with higher `-n` rather than guessing.
