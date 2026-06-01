// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Schema for per-site YAML files under extension/data/sites/. The codegen
// script `scripts/build-site-data.ts` parses each YAML, validates it against
// `SiteFileSchema`, and emits `src/rules/site-data.generated.ts`.
//
// One YAML file per host (or host family); each file declares the rules
// that supply site-specific data for that host. Generic always-on selectors
// (e.g., #disqus_thread, footer, sectioning ancestors) stay inline in the
// rule TS files — they aren't site-specific data.

import { URLPattern } from "urlpattern-polyfill";
import { z } from "zod";

// Rule ids that support per-site data. Keep this list in sync with the rule
// files that consume the generated arrays; adding a new site-data-aware rule
// requires extending this union and updating `build-site-data.ts` to emit a
// new generated array for it.
export const SITE_DATA_RULE_IDS = [
  "reviews-hide",
  "comments-hide",
  "footer-hide",
  "search-url-helper",
] as const;
export type SiteDataRuleId = (typeof SITE_DATA_RULE_IDS)[number];

const HostnamePattern = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        new URLPattern({ hostname: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "must be a valid URLPattern hostname string" },
  );

const PathnamePattern = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        new URLPattern({ pathname: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "must be a valid URLPattern pathname string" },
  );

const SelectorRuleEntry = z
  .object({
    hostnames: z.array(HostnamePattern).min(1).optional(),
    pathnames: z.array(PathnamePattern).min(1).optional(),
    selectors: z.array(z.string().min(1)).min(1),
  })
  .strict();

const RecipeRuleEntry = z
  .object({
    hostnames: z.array(HostnamePattern).min(1).optional(),
    pathnames: z.array(PathnamePattern).min(1).optional(),
    recipe: z.string().min(1),
  })
  .strict();

// Each rule key accepts either a single entry or an array of entries. The
// array form covers cases like Hacker News' comments-hide, which carries a
// general selector plus a pathname-narrowed one (`#bigbox` on /newcomments).
const SelectorRule = z.union([
  SelectorRuleEntry,
  z.array(SelectorRuleEntry).min(1),
]);
const RecipeRule = z.union([RecipeRuleEntry, z.array(RecipeRuleEntry).min(1)]);

export const SiteFileSchema = z
  .object({
    hostnames: z.array(HostnamePattern).min(1),
    rules: z
      .object({
        "reviews-hide": SelectorRule.optional(),
        "comments-hide": SelectorRule.optional(),
        "footer-hide": SelectorRule.optional(),
        "search-url-helper": RecipeRule.optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, {
        message: "must declare at least one rule",
      }),
  })
  .strict();

export type SiteFile = z.infer<typeof SiteFileSchema>;
export type SelectorRuleEntryInput = z.infer<typeof SelectorRuleEntry>;
export type RecipeRuleEntryInput = z.infer<typeof RecipeRuleEntry>;

export function toEntries<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
