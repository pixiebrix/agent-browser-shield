// Invariant checks on the rule catalog in `extension/src/rules/index.ts`.
// Each invariant captures a guarantee that other parts of the codebase rely on
// but TypeScript can't enforce on its own (uniqueness, paired fields, agreement
// between the rule's `id` and the variable name exported from its module).

// `nanoid` and `abort-utils` are pure-ESM. ts-jest with `useESM: false`
// (jest.config.cjs) can't transform them. Mock both before the catalog
// import transitively pulls them in (via automation-element-reference,
// llm-client, irrelevant-sections-redact). The catalog invariants don't
// exercise the runtime behavior these provide; they only inspect the
// catalog's static shape.
jest.mock("nanoid", () => ({ nanoid: () => "test-ref" }));
jest.mock("abort-utils", () => ({
  ReusableAbortController: class {
    abort(): void {
      // noop
    }
    get signal(): AbortSignal {
      return new AbortController().signal;
    }
  },
  onAbort: (): (() => void) => () => {
    // noop
  },
}));

import { RULE_GROUPS } from "../../lib/rule-groups";
import { RULE_LABELS } from "../../popup/rule-labels";
import { RULE_IDS, RULES } from "..";
import { RULE_DEFAULTS, RULE_OPTION_DEFAULTS } from "../rule-metadata";

describe("rule catalog invariants", () => {
  it("ships at least one rule", () => {
    expect(RULES.length).toBeGreaterThan(0);
  });

  it("has a unique id for every rule", () => {
    const ids = RULES.map((rule) => rule.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it("exposes the same id set via RULE_IDS as RULES", () => {
    // eslint-disable-next-line unicorn/require-array-sort-compare -- string sort; default lexicographic order is intended
    expect([...RULE_IDS].toSorted()).toEqual(
      // eslint-disable-next-line unicorn/require-array-sort-compare -- string sort; default lexicographic order is intended
      RULES.map((rule) => rule.id).toSorted(),
    );
  });

  it.each(
    RULES.map((rule) => [rule.id, rule] as const),
  )("%s declares the required Rule fields", (_id, rule) => {
    expect(typeof rule.label).toBe("string");
    expect(rule.label.length).toBeGreaterThan(0);
    expect(typeof rule.description).toBe("string");
    expect(rule.description.length).toBeGreaterThan(0);
    expect(typeof rule.apply).toBe("function");
  });

  // Defaults live in `rules/rule-metadata.ts` and are hand-edited. This
  // test catches the case where a rule is registered in `rules/index.ts`
  // without a corresponding metadata entry (or vice versa).
  it("declares a default for every rule and no extras", () => {
    // eslint-disable-next-line unicorn/require-array-sort-compare -- string sort; default lexicographic order is intended
    const defaultsKeys = Object.keys(RULE_DEFAULTS).toSorted();
    // eslint-disable-next-line unicorn/require-array-sort-compare -- string sort; default lexicographic order is intended
    expect(defaultsKeys).toEqual([...RULE_IDS].toSorted());
  });

  it("every default is a boolean", () => {
    const offenders = Object.entries(RULE_DEFAULTS).filter(
      ([, value]) => typeof value !== "boolean",
    );
    expect(offenders).toEqual([]);
  });

  // `available: false` rules turn into a disabled toggle in the UI and need a
  // user-facing explanation. `Rule.unavailableReason` is documented as paired
  // (rules/types.ts), but the type system can't require it.
  it("pairs `available: false` with `unavailableReason`", () => {
    const offenders = RULES.filter(
      (rule) =>
        rule.available === false &&
        (typeof rule.unavailableReason !== "string" ||
          rule.unavailableReason.length === 0),
    ).map((rule) => rule.id);
    expect(offenders).toEqual([]);
  });

  // Group membership drives the popup and options-page rule-list layout.
  // Every rule must appear in exactly one group so the UI doesn't drop or
  // double-count any. RULE_GROUPS is the source for the H2 sections in
  // docs/src/content/docs/rules.md; the same buckets are used in-product.
  it("places every rule in exactly one group, with no unknown ids", () => {
    const grouped = RULE_GROUPS.flatMap((group) => group.ruleIds);
    const duplicates = grouped.filter(
      (id, index) => grouped.indexOf(id) !== index,
    );
    expect(duplicates).toEqual([]);
    // eslint-disable-next-line unicorn/require-array-sort-compare -- string sort; default lexicographic order is intended
    expect([...grouped].toSorted()).toEqual([...RULE_IDS].toSorted());
  });

  it("group ids are unique", () => {
    const ids = RULE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Popup's per-rule activity section looks up labels via RULE_LABELS. Keep
  // it in lockstep with the rule catalog so a newly-added rule can't render
  // as `undefined`. The labels file is hand-maintained (lives under popup/
  // so background.js purity isn't violated by the strings) — this check is
  // the canary for that drift.
  it("every rule has a popup label", () => {
    // eslint-disable-next-line unicorn/require-array-sort-compare -- string sort; default lexicographic order is intended
    const labelIds = Object.keys(RULE_LABELS).toSorted();
    // eslint-disable-next-line unicorn/require-array-sort-compare -- string sort; default lexicographic order is intended
    expect(labelIds).toEqual([...RULE_IDS].toSorted());
    const blank = Object.entries(RULE_LABELS).filter(
      ([, value]) => typeof value !== "string" || value.length === 0,
    );
    expect(blank).toEqual([]);
  });

  // Popup label should match the rule's own user-facing `label` so the
  // popup and the options-page rule list don't drift apart. Catches the
  // case where a rule's wording is updated in its own file but the
  // popup-side mirror is forgotten.
  it("popup labels match each rule's own label", () => {
    // `RULES: readonly Rule[]` widens `id` to `string`. The previous
    // "exposes the same id set" invariant guarantees each id is a valid
    // `RuleId`, so widening RULE_LABELS to a string-keyed view is safe.
    const labels = RULE_LABELS as Record<string, string>;
    const mismatches = RULES.filter(
      (rule) => labels[rule.id] !== rule.label,
    ).map((rule) => ({
      ruleId: rule.id,
      rule: rule.label,
      popup: labels[rule.id],
    }));
    expect(mismatches).toEqual([]);
  });

  // RULE_OPTION_DEFAULTS declares the ESLint-style sub-rule shape consumed by
  // the build-time defaults loader. Every rule with options must also be in
  // RULE_DEFAULTS (so the loader doesn't dangle); every leaf of the option
  // tree must be a boolean (the loader and runtime accessor both assume that
  // shape).
  it("RULE_OPTION_DEFAULTS keys all appear in RULE_DEFAULTS", () => {
    const missing = Object.keys(RULE_OPTION_DEFAULTS).filter(
      (id) => !(id in RULE_DEFAULTS),
    );
    expect(missing).toEqual([]);
  });

  it("RULE_OPTION_DEFAULTS leaves are booleans or finite numbers", () => {
    function findMistypedLeaves(node: unknown, prefix: string): string[] {
      if (typeof node === "boolean") {
        return [];
      }
      if (typeof node === "number") {
        return Number.isFinite(node) ? [] : [prefix];
      }
      if (node === null || typeof node !== "object" || Array.isArray(node)) {
        return [prefix];
      }
      const issues: string[] = [];
      for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
      )) {
        issues.push(...findMistypedLeaves(value, `${prefix}.${key}`));
      }
      return issues;
    }
    const offenders: string[] = [];
    for (const [id, options] of Object.entries(RULE_OPTION_DEFAULTS)) {
      offenders.push(...findMistypedLeaves(options, id));
    }
    expect(offenders).toEqual([]);
  });

  // Reactive availability accessors must expose both `get` and `subscribe`
  // — the rule engine and the UI both depend on the pair.
  it("reactive `available` accessors expose get + subscribe", () => {
    const offenders = RULES.filter((rule) => {
      const accessor = rule.available;
      if (accessor === undefined || typeof accessor === "boolean") {
        return false;
      }
      return (
        typeof accessor.get !== "function" ||
        typeof accessor.subscribe !== "function"
      );
    }).map((rule) => rule.id);
    expect(offenders).toEqual([]);
  });
});
