// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Compiles per-site YAML files under extension/data/sites/ into a single
// TypeScript module consumed by the rule files. Mirrors the precedent set
// by scripts/fetch_easylist.py — generated output is committed and bundled
// statically; the runtime never parses YAML.
//
// Run manually with `bun run build-site-data`; build.ts also invokes this
// before each `Bun.build()` so dev never forgets to regenerate.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { load } from "js-yaml";
import {
  type RecipeRuleEntryInput,
  type SelectorRuleEntryInput,
  SITE_DATA_RULE_IDS,
  type SiteFile,
  SiteFileSchema,
  toEntries,
} from "../data/site-rules.schema";

const ROOT = join(import.meta.dir, "..");
const SITES_DIR = join(ROOT, "data", "sites");
const OUTPUT = join(ROOT, "src", "rules", "site-data.generated.ts");

interface ParsedSiteFile {
  fileName: string;
  data: SiteFile;
}

interface SelectorBlock {
  fileName: string;
  hostnames: string[];
  pathnames: string[] | null;
  selectors: string[];
}

interface RecipeBlock {
  fileName: string;
  hostnames: string[];
  pathnames: string[] | null;
  recipe: string;
}

function loadSites(): ParsedSiteFile[] {
  const entries = readdirSync(SITES_DIR)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .toSorted();
  const errors: string[] = [];
  const parsed: ParsedSiteFile[] = [];

  for (const fileName of entries) {
    const path = join(SITES_DIR, fileName);
    const raw = readFileSync(path, "utf8");
    let parsedYaml: unknown;
    try {
      parsedYaml = load(raw);
    } catch (error) {
      errors.push(
        `${relative(ROOT, path)}: YAML parse error — ${(error as Error).message}`,
      );
      continue;
    }
    const result = SiteFileSchema.safeParse(parsedYaml);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(
          `${relative(ROOT, path)}: ${issue.path.join(".") || "(root)"} — ${issue.message}`,
        );
      }
      continue;
    }
    parsed.push({ fileName, data: result.data });
  }

  if (errors.length > 0) {
    throw new Error(
      `Site YAML validation failed:\n  - ${errors.join("\n  - ")}`,
    );
  }
  return parsed;
}

function collectSelectorBlocks(
  parsed: ParsedSiteFile[],
  ruleId: "reviews-hide" | "comments-hide" | "footer-hide",
): SelectorBlock[] {
  const blocks: SelectorBlock[] = [];
  for (const { fileName, data } of parsed) {
    const rule = data.rules[ruleId];
    if (!rule) {
      continue;
    }
    for (const entry of toEntries<SelectorRuleEntryInput>(rule)) {
      blocks.push({
        fileName,
        hostnames: entry.hostnames ?? data.hostnames,
        pathnames: entry.pathnames ?? null,
        selectors: entry.selectors,
      });
    }
  }
  return blocks;
}

function collectRecipeBlocks(parsed: ParsedSiteFile[]): RecipeBlock[] {
  const blocks: RecipeBlock[] = [];
  for (const { fileName, data } of parsed) {
    const rule = data.rules["search-url-helper"];
    if (!rule) {
      continue;
    }
    for (const entry of toEntries<RecipeRuleEntryInput>(rule)) {
      blocks.push({
        fileName,
        hostnames: entry.hostnames ?? data.hostnames,
        pathnames: entry.pathnames ?? null,
        recipe: entry.recipe,
      });
    }
  }
  return blocks;
}

function emitPatternsLiteral(
  hostnames: string[],
  pathnames: string[] | null,
): string {
  // Cross-join hostnames × pathnames when both are present (matches the
  // current code's pattern of `new URLPattern({ hostname, pathname })`).
  // Without pathnames, hostnames each emit a single URLPattern.
  const lines: string[] = [];
  if (pathnames && pathnames.length > 0) {
    for (const hostname of hostnames) {
      for (const pathname of pathnames) {
        lines.push(
          `      new URLPattern({ hostname: ${JSON.stringify(hostname)}, pathname: ${JSON.stringify(pathname)} }),`,
        );
      }
    }
  } else {
    for (const hostname of hostnames) {
      lines.push(
        `      new URLPattern({ hostname: ${JSON.stringify(hostname)} }),`,
      );
    }
  }
  return ["[", ...lines, "    ]"].join("\n");
}

function emitSelectorsLiteral(selectors: string[]): string {
  const lines = selectors.map((sel) => `      ${JSON.stringify(sel)},`);
  return ["[", ...lines, "    ]"].join("\n");
}

function emitRecipeLiteral(recipe: string): string {
  // Recipes are multi-line by design. Use a template literal so the
  // generated file stays diff-friendly. Escape backticks and `${`.
  const escaped = recipe
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
  return `\`${escaped}\``;
}

function emitSelectorRuleArray(
  exportName: string,
  blocks: SelectorBlock[],
): string {
  if (blocks.length === 0) {
    return `export const ${exportName}: readonly SiteRule[] = [];`;
  }
  const entries = blocks.map(
    (block) =>
      `  {\n    // from data/sites/${block.fileName}\n    patterns: ${emitPatternsLiteral(block.hostnames, block.pathnames)},\n    selectors: ${emitSelectorsLiteral(block.selectors)},\n  },`,
  );
  return [
    `export const ${exportName}: readonly SiteRule[] = [`,
    ...entries,
    "];",
  ].join("\n");
}

function emitRecipeArray(blocks: RecipeBlock[]): string {
  if (blocks.length === 0) {
    return "export const SEARCH_URL_HELPER_RECIPES: readonly SiteRecipe[] = [];";
  }
  const entries = blocks.map(
    (block) =>
      `  {\n    // from data/sites/${block.fileName}\n    patterns: ${emitPatternsLiteral(block.hostnames, block.pathnames)},\n    recipe: ${emitRecipeLiteral(block.recipe)},\n  },`,
  );
  return [
    "export const SEARCH_URL_HELPER_RECIPES: readonly SiteRecipe[] = [",
    ...entries,
    "];",
  ].join("\n");
}

function buildOutput(parsed: ParsedSiteFile[]): string {
  const reviews = collectSelectorBlocks(parsed, "reviews-hide");
  const comments = collectSelectorBlocks(parsed, "comments-hide");
  const footer = collectSelectorBlocks(parsed, "footer-hide");
  const recipes = collectRecipeBlocks(parsed);

  return [
    "// AUTO-GENERATED — do not edit by hand.",
    "// Source: extension/data/sites/*.yaml",
    "// Regenerate with `bun run build-site-data`.",
    "",
    'import { URLPattern } from "urlpattern-polyfill";',
    'import type { SiteRule } from "../lib/selector-hide-rule";',
    "",
    "export interface SiteRecipe {",
    "  patterns: URLPattern[];",
    "  recipe: string;",
    "}",
    "",
    emitSelectorRuleArray("REVIEWS_HIDE_SITE_RULES", reviews),
    "",
    emitSelectorRuleArray("COMMENTS_HIDE_SITE_RULES", comments),
    "",
    emitSelectorRuleArray("FOOTER_HIDE_SITE_RULES", footer),
    "",
    emitRecipeArray(recipes),
    "",
  ].join("\n");
}

export function generateSiteData(): void {
  // Sanity: every rule id we emit an array for must appear in the
  // schema's SITE_DATA_RULE_IDS so the two stay in lockstep.
  const emitted = new Set([
    "reviews-hide",
    "comments-hide",
    "footer-hide",
    "search-url-helper",
  ]);
  for (const id of SITE_DATA_RULE_IDS) {
    if (!emitted.has(id)) {
      throw new Error(
        `Codegen out of sync with schema: SITE_DATA_RULE_IDS lists "${id}" but no emit branch exists.`,
      );
    }
  }

  const parsed = loadSites();
  const output = buildOutput(parsed);
  writeFileSync(OUTPUT, output);
  console.log(
    `Generated ${relative(ROOT, OUTPUT)} from ${parsed.length} site YAML files.`,
  );
}

if (import.meta.main) {
  generateSiteData();
}
