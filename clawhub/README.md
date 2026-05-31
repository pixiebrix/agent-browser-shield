# ClawHub publish workflow

This directory holds the public skill bundle published to
[ClawHub](https://clawhub.ai). It is intentionally **not** codegen — it's a
hand-curated public surface, separate from the maintainer-facing skills in
`../skills/`.

## One-time setup

```sh
npm i -g clawhub
clawhub login        # GitHub OAuth
clawhub whoami       # confirm
```

Skills are published under the `pixiebrix` org publisher. If it doesn't exist
yet, create it once (the authenticated user becomes the owner):

```sh
clawhub publisher create pixiebrix --display-name "PixieBrix"
```

See the [ClawHub CLI docs][clawhub-cli] for details on publisher management.
Newly created org publishers are not marked trusted/official by default.

## Publish

1. Edit `agent-browser-shield/SKILL.md`. Keep it short — every line is loaded
   into the agent's context window per session.

2. Bump the version: minor for additive markers/rules, major for renamed/removed
   markers, patch for typos.

3. Dry-run:

   ```sh
   clawhub skill publish ./agent-browser-shield \
     --slug agent-browser-shield \
     --name "Agent Browser Shield" \
     --owner pixiebrix \
     --version <semver> \
     --changelog "<one-line summary>" \
     --dry-run
   ```

4. Preview the generated skill card (ClawHub generates this from frontmatter —
   we don't author or bundle one):

   ```sh
   clawhub skill publish ./agent-browser-shield --owner pixiebrix --dry-run --card
   ```

5. Eyeball the SKILL.md in a fresh agent session — dry-run validates
   frontmatter, not behavior.

6. Drop `--dry-run` to publish. Verify with:

   ```sh
   clawhub inspect agent-browser-shield
   ```

If the skill was previously published under a personal handle, add
`--migrate-owner` on the next publish to move it under `pixiebrix`.

## Versioning

Independent semver, **not** tied to the extension's `v2026.x.x` release tag.
Bump only when the agent-facing contract changes (new DOM marker, new behavior
rule). Extension bugfixes don't require a republish.

[clawhub-cli]: https://github.com/openclaw/clawhub/blob/main/docs/cli.md
