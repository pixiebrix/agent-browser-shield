// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Post-build guard for the background bundle.
//
// The background service worker must NOT import any rule implementation
// file. Rule files touch DOM constructors (HTMLInputElement.prototype,
// MutationObserver, document, …) at module load time, which throws
// ReferenceError in a worker context. Even when the offending top-level
// access is moved into a function, importing rule modules into the worker
// is wasteful — it bloats the bundle with code that can never run there.
//
// This script reads each `src/rules/*.ts` rule file, extracts the top-level
// rule object's `label` string (the one inside `} satisfies Rule;`), and
// asserts that none of those strings appear in `dist/background.js`. Labels
// are user-facing English strings unique to rule files, so they're a sound
// canary that survives Bun's minification.
//
// Wired into `build.ts` so a fresh build fails loudly the moment something
// pulls a rule into the worker bundle.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const RULES_DIR = join(ROOT, "src", "rules");
const BUNDLE = join(ROOT, "dist", "background.js");

// Skip aggregator/type modules and generated catalogs. Generated rule files
// (easylist-generic, justdeleteme) don't export a Rule; they're consumed by
// other rule files.
const SKIP_FILES = new Set(["index.ts", "types.ts"]);

interface Canary {
  ruleFile: string;
  label: string;
}

function extractTopLevelRuleLabel(source: string): string | null {
  // Top-level rule labels sit at exactly two-space indentation, either inside
  // an inline `} satisfies Rule;` literal or as an option passed to a builder
  // helper (e.g. `createSelectorHideRule({ label: "…" })`). Inner `label`
  // fields inside arrays or nested objects are at 4+ spaces, and `label:
  // string;` type annotations have no quoted value — both naturally excluded.
  const labelRe = /^ {2}label:\s*"([^"]+)",?$/m;
  const match = labelRe.exec(source);
  return match?.[1] ?? null;
}

function collectCanaries(): Canary[] {
  const canaries: Canary[] = [];
  for (const name of readdirSync(RULES_DIR).toSorted()) {
    if (!name.endsWith(".ts")) {
      continue;
    }
    if (SKIP_FILES.has(name)) {
      continue;
    }
    if (name.endsWith(".generated.ts")) {
      continue;
    }
    const source = readFileSync(join(RULES_DIR, name), "utf8");
    const label = extractTopLevelRuleLabel(source);
    if (label) {
      canaries.push({ ruleFile: name, label });
    }
  }
  return canaries;
}

export function checkBackgroundPurity(): void {
  let bundle: string;
  try {
    bundle = readFileSync(BUNDLE, "utf8");
  } catch (error) {
    throw new Error(
      `${relative(ROOT, BUNDLE)} not found — run the extension build first.`,
      { cause: error },
    );
  }

  const canaries = collectCanaries();
  if (canaries.length === 0) {
    throw new Error(
      `No rule canaries collected from ${relative(ROOT, RULES_DIR)}. ` +
        "The label-extraction regex may need updating.",
    );
  }

  const leaks = canaries.filter(({ label }) => bundle.includes(label));
  if (leaks.length > 0) {
    const sample = leaks
      .slice(0, 5)
      .map(({ ruleFile, label }) => `  - ${ruleFile} ("${label}")`)
      .join("\n");
    const tail = leaks.length > 5 ? `\n  …and ${leaks.length - 5} more` : "";
    throw new Error(
      `${relative(ROOT, BUNDLE)} leaks ${leaks.length} rule implementation file(s):\n${sample}${tail}\n\n` +
        "The background service worker must not import rule files. Check that " +
        "any new lib/* code in the background's import graph uses " +
        "`rules/rule-metadata` for RuleId/RULE_IDS rather than " +
        "`rules/index.ts`.",
    );
  }

  console.log(
    `background.js purity: ok (${canaries.length} canaries, no leaks)`,
  );
}

if (import.meta.main) {
  checkBackgroundPurity();
}
