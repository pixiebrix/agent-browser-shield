# Contributing to agent-browser-shield

Thanks for your interest in `agent-browser-shield`. This document covers how to
set up a local dev environment, what we expect from a pull request, and the
legal boilerplate (CLA + license) you'll be agreeing to.

## TL;DR

1. Fork, clone, and run the setup below.
2. Create a feature branch off `main`.
3. Make your change. Add or update tests. Run `bun run check && bun run test`.
4. Open a PR. Sign the CLA via the [signing form](FORM_URL) on your first PR
   (one-time).
5. A maintainer will review.

## Project status

`agent-browser-shield` is a prototype. Public APIs, rule contracts, and the
skill specifications may change between minor versions. Pin a commit if you need
stability.

## Setting up

### Prerequisites

- **Node** ≥ 24 and **Bun** ≥ 1.3 (the extension and demo site use Bun)
- **uv** (for Python benchmark scripts) — `brew install uv` or `pip install uv`.
  The repo pins Python 3.14 via `.python-version`; scripts work on 3.11+.
- **Chrome / Chromium 148+** to load the unpacked extension
- **Pre-commit** — `pip install pre-commit && pre-commit install`

### Extension

```sh
cd extension
bun install
bun run build       # writes extension/dist/
bun run watch       # rebuilds on change
bun run test        # Jest unit tests
bun run check       # Biome (lint + format) + ESLint (unicorn + custom rules)
```

Load `extension/dist/` as unpacked at `chrome://extensions`.

### Demo site

Live deployment: <https://shield-dark-pattern-demo.vercel.app/>. To run it
locally:

```sh
cd demo-site
bun install
bun run dev         # http://localhost:5173
```

### Benchmark harness

```sh
cp env.sample .env  # fill in BROWSERBASE_API_KEY etc.
uv run scripts/benchmark_run.py --help
```

See [`benchmark/README.md`](./benchmark/README.md) for the full workflow.

## What we look for in a PR

- **One topic per PR.** Smaller PRs land faster.
- **Tests.** New rules need unit tests under `extension/src/rules/__tests__/`.
  Bug fixes need a regression test where practical.
- **No unrelated cleanup.** Drive-by refactors in unrelated files are hard to
  review — split them into their own PR.
- **Skill docs in sync.** If you add, remove, or rename a rule, update
  `skills/agent-browser-shield-config/SKILL.md`. If you change DOM markers or
  the required agent behavior, update `skills/agent-browser-shield/SKILL.md`.
  The trace bundle layout has a separate skill at
  `skills/agent-browser-shield-diagnose/SKILL.md`.
- **Commit messages.** Imperative mood, brief subject, body explains motivation
  when it's not obvious.
- **Don't bypass hooks.** Pre-commit hooks run gitleaks, Biome, ESLint, Ruff,
  and markdownlint. Fix the issue rather than passing `--no-verify`.

## Adding a new rule

A "rule" is a small TypeScript module under `extension/src/rules/` that inspects
the page and mutates the DOM in a targeted way. Each rule is registered in
`extension/src/rules/index.ts` and `extension/src/lib/storage.ts`.

Walkthrough:

1. Copy a small existing rule (`scarcity-hide.ts` is a good starter).
2. Implement the `Rule` interface — `id`, `enabledByDefault`, `apply()`.
3. Add tests in `extension/src/rules/__tests__/<your-rule>.test.ts` using jsdom
   fixtures.
4. Register the rule in both `index.ts` and `storage.ts`.
5. Update `skills/agent-browser-shield-config/SKILL.md` so the rule appears in
   the list there.

URL gating uses
[`urlpattern-polyfill`](https://github.com/kenchris/urlpattern-polyfill). Use
`URLPattern` for path/host matching; regex over URLs has historically led to
bugs like `/order` matching `/orders`.

## Reporting bugs / requesting features

Use the GitHub issue templates. For security vulnerabilities, please use the
private "Report a vulnerability" form at
<https://github.com/pixiebrix/agent-browser-shield/security/advisories/new>.
Don't open a public issue for security problems — see
[SECURITY.md](./SECURITY.md).

## Legal: license and CLA

`agent-browser-shield` is licensed under the [PolyForm Shield 1.0.0](./LICENSE)
license. Read [`LICENSING.md`](./LICENSING.md) for what that allows and how to
obtain a commercial license if you intend to build a competing product.

By submitting a pull request, you agree to the
[PixieBrix Contributor License Agreement](./.github/CLA.md). Sign once via the
[signing form](FORM_URL) — it takes a minute, and the signature carries over to
all future PRs. The CLA grants PixieBrix the right to relicense your
contribution under commercial terms; you retain copyright in your work.

If your employer owns the IP you create on the clock, please get them to
authorize your contribution (or sign a corporate CLA) before submitting.

## Code of conduct

Be kind. Assume good faith. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
