// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Compiles extension/data/rule-defaults.json into a TypeScript module
// consumed by `src/lib/storage.ts`. Same pattern as build-site-data.ts and
// build-injection-patterns.ts — generated output is committed and bundled
// statically, the runtime never reads JSON at startup.
//
// The JSON is the single source of truth for which rules ship on by default
// in the prebuilt extension. To audit defaults, scan one file; to change
// them, edit that file and rerun `bun run build-rule-defaults`.
//
// Codegen enforces completeness: every id in `RULE_IDS` must appear in the
// JSON, and the JSON must not mention any unknown id. Mismatch fails the
// build with a message listing offenders — adding a new rule without
// picking a default is a build error, not a silent fallback.

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { JSDOM } from "jsdom";
import { RuleDefaultsSchema } from "../data/rule-defaults.schema";

const ROOT = join(import.meta.dir, "..");
const INPUT = join(ROOT, "data", "rule-defaults.json");
const OUTPUT = join(ROOT, "src", "rules", "rule-defaults.generated.ts");

// A handful of rule modules touch DOM constructors at top level (e.g.
// `HTMLInputElement.prototype` in checkout-checkbox-clear.ts) to capture
// native setters before any framework can override them. Importing
// `../src/rules` from this Node-context script therefore needs DOM globals
// in scope. Jest already runs tests under jsdom; we reuse the same window
// here so the codegen sees the same surface as `__tests__/catalog.test.ts`.
function ensureDomGlobals(): void {
  if ((globalThis as { HTMLElement?: unknown }).HTMLElement !== undefined) {
    return;
  }
  const { window } = new JSDOM("");
  for (const name of [
    "HTMLElement",
    "HTMLInputElement",
    "HTMLAnchorElement",
    "Element",
    "Node",
    "document",
    "window",
    "navigator",
  ] as const) {
    if ((globalThis as Record<string, unknown>)[name] === undefined) {
      (globalThis as Record<string, unknown>)[name] = (
        window as unknown as Record<string, unknown>
      )[name];
    }
  }
}

function buildOutput(
  defaults: Record<string, boolean>,
  ruleIds: readonly string[],
): string {
  const lines: string[] = [
    "// AUTO-GENERATED — do not edit by hand.",
    "// Source: extension/data/rule-defaults.json",
    "// Regenerate with `bun run build-rule-defaults`.",
    "",
    'import type { RuleId } from "./index";',
    "",
    "export const RULE_DEFAULTS: Readonly<Record<RuleId, boolean>> = {",
  ];
  // Emit in RULE_IDS order so the generated file's diff stays stable as the
  // registry evolves, regardless of how the JSON happens to be ordered.
  for (const id of ruleIds) {
    lines.push(`  ${JSON.stringify(id)}: ${defaults[id]},`);
  }
  lines.push("};", "");
  return lines.join("\n");
}

export async function generateRuleDefaults(): Promise<void> {
  ensureDomGlobals();
  // Dynamic import after stubbing so the rule registry's transitive DOM
  // touches resolve against the jsdom globals above.
  const { RULE_IDS } = (await import("../src/rules")) as {
    RULE_IDS: readonly string[];
  };

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
  const declaredKeys = new Set(Object.keys(declared));
  const known = new Set<string>(RULE_IDS);

  const missing = RULE_IDS.filter((id) => !declaredKeys.has(id));
  const unknown = [...declaredKeys].filter((id) => !known.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`missing defaults for: ${missing.join(", ")}`);
    }
    if (unknown.length > 0) {
      parts.push(`unknown rule ids: ${unknown.join(", ")}`);
    }
    throw new Error(
      `${relative(ROOT, INPUT)}: defaults out of sync with rule registry — ${parts.join("; ")}`,
    );
  }

  writeFileSync(OUTPUT, buildOutput(declared, RULE_IDS));
  console.log(
    `Generated ${relative(ROOT, OUTPUT)} from ${RULE_IDS.length} rules.`,
  );
}

if (import.meta.main) {
  await generateRuleDefaults();
}
