// Compiles extension/data/injection-patterns.yaml into a TypeScript module
// consumed by `src/rules/prompt-injection-hide.ts`. Mirrors the precedent
// set by `build-site-data.ts` — generated output is committed and bundled
// statically; the runtime never decodes base64.
//
// The encoding lives only in the YAML source-of-truth (so coding agents
// browsing this repo don't have to scan literal adversarial phrasing).
// The shipped extension bundle contains the decoded plaintext regexes,
// which keeps Chrome Web Store review from flagging us for obfuscated code.
//
// Run manually with `bun run build-injection-patterns`; build.ts also
// invokes this before each `Bun.build()`.

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";

const ROOT = join(import.meta.dir, "..");
const INPUT = join(ROOT, "data", "injection-patterns.yaml");
const OUTPUT = join(ROOT, "src", "rules", "injection-patterns.generated.ts");

const PatternEntry = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, "must be kebab-case identifier"),
    source_b64: z.string().min(1),
    flags: z.string().regex(/^[gimsuy]*$/, "invalid RegExp flags"),
  })
  .strict();

const PatternFile = z
  .object({
    patterns: z.array(PatternEntry).min(1),
  })
  .strict();

function decode(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}

function buildOutput(
  entries: ReadonlyArray<{ name: string; source: string; flags: string }>,
): string {
  const lines: string[] = [
    "// AUTO-GENERATED — do not edit by hand.",
    "// Source: extension/data/injection-patterns.yaml",
    "// Regenerate with `bun run build-injection-patterns`.",
    "",
    "export const INJECTION_PATTERNS: readonly RegExp[] = [",
  ];
  for (const { name, source, flags } of entries) {
    lines.push(`  // ${name}`);
    lines.push(
      `  new RegExp(${JSON.stringify(source)}, ${JSON.stringify(flags)}),`,
    );
  }
  lines.push("];", "");
  return lines.join("\n");
}

export function generateInjectionPatterns(): void {
  const raw = readFileSync(INPUT, "utf-8");
  let doc: unknown;
  try {
    doc = load(raw);
  } catch (error) {
    throw new Error(
      `${relative(ROOT, INPUT)}: YAML parse error — ${(error as Error).message}`,
    );
  }
  const result = PatternFile.safeParse(doc);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`)
      .join("\n  - ");
    throw new Error(
      `${relative(ROOT, INPUT)}: schema validation failed:\n  - ${issues}`,
    );
  }

  const entries = result.data.patterns.map((entry) => {
    const source = decode(entry.source_b64);
    // Verify the decoded source compiles — catches typos at build time
    // rather than runtime.
    try {
      new RegExp(source, entry.flags);
    } catch (error) {
      throw new Error(
        `${relative(ROOT, INPUT)}: pattern "${entry.name}" is not a valid RegExp — ${(error as Error).message}`,
      );
    }
    return { name: entry.name, source, flags: entry.flags };
  });

  writeFileSync(OUTPUT, buildOutput(entries));
  console.log(
    `Generated ${relative(ROOT, OUTPUT)} from ${entries.length} patterns.`,
  );
}

if (import.meta.main) {
  generateInjectionPatterns();
}
