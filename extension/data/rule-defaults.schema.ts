// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Schema for extension/data/rule-defaults.json — the single source of truth
// for which rules ship on by default in the prebuilt extension. The codegen
// script `scripts/build-rule-defaults.ts` validates the JSON against
// `RuleDefaultsSchema` and emits `src/rules/rule-defaults.generated.ts`.
//
// Completeness (every registered rule id appears, no extras) is enforced by
// the codegen, not by zod, because it has to read `RULE_IDS` from the rule
// registry at generate time. This schema just enforces the file shape:
// `{ "defaults": Record<string, boolean> }` with no other top-level keys, so
// the file can grow sibling metadata later (e.g. preset names) without
// breaking older builds.

import { z } from "zod";

export const RuleDefaultsSchema = z
  .object({
    defaults: z.record(z.string().min(1), z.boolean()),
  })
  .strict();

export type RuleDefaultsFile = z.infer<typeof RuleDefaultsSchema>;
