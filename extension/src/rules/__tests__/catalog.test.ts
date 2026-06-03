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
import { RULE_IDS, RULES } from "..";
import { RULE_DEFAULTS } from "../rule-defaults.generated";

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
    expect([...RULE_IDS].toSorted()).toEqual(
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

  // Defaults live in extension/data/rule-defaults.json and flow through
  // codegen into RULE_DEFAULTS. Codegen rejects mismatches at build time;
  // this test is a belt-and-suspenders so adding a rule without picking a
  // default fails fast in `bun run test` too.
  it("declares a default for every rule and no extras", () => {
    const defaultsKeys = Object.keys(RULE_DEFAULTS).toSorted();
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
    expect([...grouped].toSorted()).toEqual([...RULE_IDS].toSorted());
  });

  it("group ids are unique", () => {
    const ids = RULE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
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
