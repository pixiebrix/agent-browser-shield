---
name: agent-browser-shield-tasks
description: How to write or edit benchmark task rows in `benchmark/tasks.csv` so the extraction format is unambiguous and consensus comparison across repetitions doesn't trip on cosmetic differences. Use when the user is adding a new task, tightening an existing task's instructions, or diagnosing mismatched/judge-disagreement results in a run.
---

# Authoring benchmark tasks

Tasks live in `benchmark/tasks.csv`. Each row has `task` (agent prompt) and
`success_criteria` (judge rubric). The same agent run is repeated several times
per scenario, and answers are compared across reps to detect drift. When the
format isn't pinned down, semantically-equivalent answers (`50 points` vs `50`,
`$29.99` vs `USD 29.99`, `15 3/4"` vs `15 3/4 inches`) register as mismatches
and pollute the consensus signal.

## Tasks must be completable without logging in

Every task runs against a fresh Browserbase session with no credentials. The
target page and any pages the agent must traverse to reach the answer must be
reachable without signing in, without dismissing a hard auth wall, and without
accepting account-gated terms. Before adding a task, sanity-check that:

- The starting URL renders content for a logged-out visitor.
- Search, filtering, sorting, and product/detail pages on that site work
  anonymously (Etsy seller pages, Amazon search results, IKEA listings all
  qualify; Costco product pages do not).
- The answer isn't behind a "sign in to see price" or member-only gate.

If a task genuinely needs auth, leave `enabled=false` and put the reason in
`disabled_reason` — don't ship login-gated tasks.

## Pin the output format, not just the content

For any extracted value that has more than one reasonable surface form, name the
exact format in the `task` field and mirror it in `success_criteria`.

Common axes to lock down:

- **Numeric vs unit-suffixed** — "bare number, no units/words" or "include the
  unit X".
- **Currency** — `$X.XX` (leading dollar sign, two decimals, no currency code,
  no trailing text). Don't accept `USD 29.99`, `$29`, or `29.99 dollars` by
  silence — pick one.
- **Dimensions** — choose a separator (`×` vs `x`), decide whether each
  dimension carries its own unit or a single trailing unit, decide between
  decimals and mixed fractions.
- **Composite answers** — give an exact template with separators, e.g.
  `"W × D × H inches / $X.XX"` and add "and nothing else" so the agent doesn't
  prefix the product name.
- **Identifiers** — `owner/repo`, semver string, model code form — say which.

Always end format clauses with "Do not include any other text" when you want a
clean value, otherwise agents append commentary.

## Don't put actual values in the prompt

Never include the expected value as an example. `(e.g. $29.99)` leaks the answer
and biases the agent; `(e.g. 15 3/4)` is okay only because it's a generic format
illustration, not the real measurement. Rule of thumb: examples should
illustrate *shape*, never *content*.

The same rule applies to `success_criteria` if the judge model is the same
family as the agent — keep ground-truth values out of the criteria text;
describe what a valid answer looks like instead.

## Mirror format requirements in `success_criteria`

The judge reads only `success_criteria`. If the task says "report as `$X.XX`"
but the criteria just says "contains a US-dollar price," the judge will pass
`USD 29.99` and consensus comparison will still mismatch. Restate the format
constraint in the criteria, in judge-friendly language ("formatted as `$X.XX`
with leading dollar sign and two decimal places, no currency code or extra
text").

## Diagnosing format drift from a run

When the user points at a `run_id` with mismatch issues:

1. Read `output/results/<run_id>/results.jsonl` and pull the
   `extracted_answer.value` field for the task across all reps.
2. Diff the surface forms. Differences in spacing, quotes (`"` vs `inches`),
   prefixes (product name vs none), or unit placement are format-spec gaps.
3. Pick the cleanest canonical form and write it into the task; restate it in
   the criteria.

The `extracted_answer.value` is what consensus compares — that's the string the
format spec must produce verbatim across reps.

## CSV mechanics

- The file is quoted CSV. Inside a quoted field, embed double quotes as `""`.
- Keep the `task` and `success_criteria` on a single CSV row even if long; don't
  introduce literal newlines.
- Leave `enabled`, `max_steps`, `disabled_reason` untouched unless the user
  asks; flipping `enabled` to `false` requires a reason in `disabled_reason`.

## Things to leave vague

Don't over-specify when the content itself is the test:

- Headlines, paper titles, free-text descriptions — accept whatever the page
  shows verbatim; don't constrain casing or punctuation.
- One-line docstrings or descriptions — paraphrase is fine.

Lock format only on values that *should* be canonical (numbers, prices, units,
identifiers, composite tuples).
