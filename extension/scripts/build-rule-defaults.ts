// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Compiles extension/data/rule-defaults.json into a TypeScript module
// consumed by `src/lib/storage.ts` and `src/rules/index.ts`. Same pattern as
// build-site-data.ts and build-injection-patterns.ts — generated output is
// committed and bundled statically, the runtime never reads JSON at startup.
//
// The JSON is the single source of truth for which rules ship on by default
// in the prebuilt extension AND for the canonical rule id set (`RuleId` is
// derived from the keys here). Drift between the rule registry and these
// keys is caught at runtime by `__tests__/catalog.test.ts`, which compares
// `RULES.map(r => r.id)` to `RULE_IDS`.
//
// This module has no transitive import of `src/rules` — that was the path
// pulling DOM-touching rule files into the service-worker bundle.

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { RuleDefaultsSchema } from "../data/rule-defaults.schema";

const ROOT = join(import.meta.dir, "..");
const INPUT = join(ROOT, "data", "rule-defaults.json");
const OUTPUT = join(ROOT, "src", "rules", "rule-defaults.generated.ts");

function buildOutput(defaults: Record<string, boolean>): string {
  const ids = Object.keys(defaults);
  const lines: string[] = [
    "// AUTO-GENERATED — do not edit by hand.",
    "// Source: extension/data/rule-defaults.json",
    "// Regenerate with `bun run build-rule-defaults`.",
    "",
    "// Source of truth for `RuleId` and `RULE_IDS`. Lives outside `rules/index.ts`",
    "// so service-worker code (`lib/storage.ts`, `background.ts`) can import the",
    "// id set without pulling in any rule file's top-level DOM access.",
    "",
    "export const RULE_DEFAULTS = {",
  ];
  for (const id of ids) {
    lines.push(`  ${JSON.stringify(id)}: ${defaults[id]},`);
  }
  lines.push(
    "} as const satisfies Readonly<Record<string, boolean>>;",
    "",
    "export type RuleId = keyof typeof RULE_DEFAULTS;",
    "",
    "export const RULE_IDS = Object.keys(RULE_DEFAULTS) as readonly RuleId[];",
    "",
  );
  return lines.join("\n");
}

export function generateRuleDefaults(): void {
  const raw = readFileSync(INPUT, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${relative(ROOT, INPUT)}: JSON parse error — ${(error as Error).message}`,
      { cause: error },
    );
  }
  const result = RuleDefaultsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`)
      .join("\n  - ");
    throw new Error(
      `${relative(ROOT, INPUT)}: schema validation failed:\n  - ${issues}`,
    );
  }

  const declared = result.data.defaults;
  writeFileSync(OUTPUT, buildOutput(declared));
  console.log(
    `Generated ${relative(ROOT, OUTPUT)} from ${Object.keys(declared).length} rules.`,
  );
}

if (import.meta.main) {
  generateRuleDefaults();
}
