// Validates per-site YAML files under extension/data/sites/. Run on every
// CI build to catch typos in hostnames, selectors, or rule ids before the
// codegen output ships.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { URLPattern } from "urlpattern-polyfill";
import {
  SITE_DATA_RULE_IDS,
  SiteFileSchema,
  toEntries,
} from "../../../data/site-rules.schema";

// SITE_DATA_RULE_IDS ⊆ RULE_IDS is enforced at TypeScript type-check time
// (SelectorRule keys are typed) and again at codegen time in
// scripts/build-site-data.ts. We don't import RULE_IDS here because
// extension/src/rules/index.ts transitively pulls in nanoid (ESM) which
// ts-jest can't transform.

const SITES_DIR = join(__dirname, "..", "..", "..", "data", "sites");

function listSiteFiles(): string[] {
  return readdirSync(SITES_DIR)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .toSorted();
}

describe("site data YAML files", () => {
  const files = listSiteFiles();

  it("finds at least one site file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses + validates against the schema", (fileName) => {
    const raw = readFileSync(join(SITES_DIR, fileName), "utf8");
    const parsedYaml = load(raw);
    const result = SiteFileSchema.safeParse(parsedYaml);
    const errorSummary = result.success
      ? null
      : `${fileName}: ${result.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`,
          )
          .join("; ")}`;
    expect(errorSummary).toBeNull();
  });

  it.each(files)("%s hostnames construct as URLPattern", (fileName) => {
    const raw = readFileSync(join(SITES_DIR, fileName), "utf8");
    const parsedYaml = load(raw);
    const parsed = SiteFileSchema.parse(parsedYaml);

    const hostnames = new Set<string>(parsed.hostnames);
    for (const entry of Object.values(parsed.rules)) {
      for (const item of toEntries(entry)) {
        if (item.hostnames) {
          for (const h of item.hostnames) {
            hostnames.add(h);
          }
        }
      }
    }
    for (const hostname of hostnames) {
      expect(() => new URLPattern({ hostname })).not.toThrow();
    }
  });

  it("only references rule ids declared in SITE_DATA_RULE_IDS", () => {
    const allowedIds = new Set<string>(SITE_DATA_RULE_IDS);
    for (const fileName of files) {
      const raw = readFileSync(join(SITES_DIR, fileName), "utf8");
      const parsed = load(raw) as { rules?: Record<string, unknown> };
      for (const key of Object.keys(parsed.rules ?? {})) {
        expect({
          file: fileName,
          ruleId: key,
          allowed: allowedIds.has(key),
        }).toEqual({ file: fileName, ruleId: key, allowed: true });
      }
    }
  });
});
