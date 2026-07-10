// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for selector-hide-rule's outermost-match dedupe. The
// existing example test pins down one nested-footer case; this file fuzzes
// across random tree shapes and random candidate subsets so off-by-one
// errors in the inline parent-walk (Set lookup vs. ancestor traversal)
// can't slip through.
//
// Tree generator mirrors dom-utils.property.test.ts — flat encoding
// (size + parent index per node) so generation always terminates within
// fast-check's depth bias and any tree shape is reachable. Each generated
// scenario lives under document.body; tests reset between runs.

import fc from "fast-check";

import { HIDDEN_ATTR, REVEALED_ATTR } from "../dom-markers";
import { filterToOutermost } from "../dom-utils";
import { PLACEHOLDER_CLASS } from "../placeholder";
import { createSelectorHideRule } from "../selector-hide-rule";
import type { RuleId } from "../storage";

const RULE_ID = "footer-redact" as RuleId;
const OTHER_RULE_ID = "comments-redact" as RuleId;
const HIDE_LABEL = "[hidden]";
const TARGET_ATTR = "data-target";
const TARGET_SELECTOR = "[data-target]";

interface FlatTree {
  size: number;
  parents: readonly number[];
}

const flatTreeArb: fc.Arbitrary<FlatTree> = fc
  .integer({ min: 1, max: 20 })
  .chain((size) => {
    if (size === 1) {
      return fc.constant<FlatTree>({ size, parents: [] });
    }
    const parentArbs = Array.from({ length: size - 1 }, (_, index) =>
      fc.integer({ min: 0, max: index }),
    );
    return fc.tuple(...parentArbs).map<FlatTree>((parents) => ({
      size,
      parents,
    }));
  });

function buildFlatTree(
  { size, parents }: FlatTree,
  into: HTMLElement[],
): HTMLElement {
  const nodes: HTMLElement[] = Array.from({ length: size }, (_, index) => {
    const element = document.createElement("div");
    element.dataset.id = String(index);
    return element;
  });
  for (let i = 1; i < size; i++) {
    const parentIndex = parents[i - 1];
    if (parentIndex === undefined) {
      throw new Error("parents array shorter than expected");
    }
    nodes[parentIndex]?.append(nodes[i] as HTMLElement);
  }
  function pushPreOrder(node: HTMLElement): void {
    into.push(node);
    for (const child of node.children) {
      pushPreOrder(child as HTMLElement);
    }
  }
  const root = nodes[0];
  if (!root) {
    throw new Error("empty tree (size should be >= 1)");
  }
  pushPreOrder(root);
  return root;
}

const treeWithMask = flatTreeArb.chain((tree) =>
  fc
    .array(fc.boolean(), { minLength: tree.size, maxLength: tree.size })
    .map((mask) => ({ tree, mask })),
);

interface Scenario {
  root: HTMLElement;
  candidates: HTMLElement[];
}

function realize({
  tree,
  mask,
}: {
  tree: FlatTree;
  mask: boolean[];
}): Scenario {
  const all: HTMLElement[] = [];
  const root = buildFlatTree(tree, all);
  const candidates = all.filter((_, i) => mask[i]);
  for (const candidate of candidates) {
    candidate.setAttribute(TARGET_ATTR, "");
  }
  return { root, candidates };
}

function freshRule() {
  return createSelectorHideRule({
    id: RULE_ID,
    label: "test",
    description: "test",
    alwaysOnSelectors: [TARGET_SELECTOR],
    hideLabel: HIDE_LABEL,
  });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("scan() outermost-match (property)", () => {
  it("places exactly one placeholder per outermost match", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        document.body.replaceChildren();
        const { root, candidates } = realize(input);
        document.body.append(root);

        const expectedOutermost = filterToOutermost(candidates);

        const { rule } = freshRule();
        rule.apply(document.body);

        const placeholders = document.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
        expect(placeholders).toHaveLength(expectedOutermost.length);
      }),
    );
  });

  it("removes every original target from the DOM after scan", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        document.body.replaceChildren();
        const { root } = realize(input);
        document.body.append(root);

        const { rule } = freshRule();
        rule.apply(document.body);

        // Outermost matches are replaced directly; descendant candidates
        // disappear with their replaced ancestor. Either way: no targets
        // survive the scan.
        expect(document.querySelectorAll(TARGET_SELECTOR)).toHaveLength(0);
      }),
    );
  });

  it("does not place a placeholder that is itself a descendant of another placeholder", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        document.body.replaceChildren();
        const { root } = realize(input);
        document.body.append(root);

        const { rule } = freshRule();
        rule.apply(document.body);

        const placeholders = [
          ...document.querySelectorAll<HTMLElement>(`.${PLACEHOLDER_CLASS}`),
        ];
        for (const a of placeholders) {
          for (const b of placeholders) {
            if (a === b) {
              continue;
            }
            expect(a.contains(b)).toBe(false);
          }
        }
      }),
    );
  });

  it("is idempotent: applying twice yields the same placeholder count", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        document.body.replaceChildren();
        const { root } = realize(input);
        document.body.append(root);

        const { rule } = freshRule();
        rule.apply(document.body);
        const after_first = document.querySelectorAll(
          `.${PLACEHOLDER_CLASS}`,
        ).length;

        rule.apply(document.body);
        const after_second = document.querySelectorAll(
          `.${PLACEHOLDER_CLASS}`,
        ).length;

        expect(after_second).toBe(after_first);
      }),
    );
  });
});

describe("processed-WeakSet idempotence under apply N times (property)", () => {
  // The strongest property the WeakSet must satisfy: with the DOM held
  // fixed between calls, apply 1 must produce the same DOM as apply N.
  // Fuzzes over random tree shape + random pre-existing markers
  // (PLACEHOLDER_CLASS, HIDDEN_ATTR for this rule, HIDDEN_ATTR for
  // another rule, REVEALED_ATTR for this rule, REVEALED_ATTR for
  // another rule) so the test covers every shape the rule's marker-
  // skip ladder can encounter. A regression in WeakSet membership
  // (added when it shouldn't be, OR not added when it should be)
  // surfaces as innerHTML divergence between the first and N-th apply.

  // Marker kind labels:
  //   0 = no marker
  //   1 = PLACEHOLDER_CLASS
  //   2 = HIDDEN_ATTR for this rule (already hidden)
  //   3 = HIDDEN_ATTR for some other rule (we should overwrite per spec)
  //   4 = REVEALED_ATTR for this rule (skip)
  //   5 = REVEALED_ATTR for some other rule (don't skip)
  const markerArb = fc.integer({ min: 0, max: 5 });

  interface MarkedScenario {
    tree: FlatTree;
    targetMask: boolean[];
    markers: number[];
    extraApplies: number;
    removeEntirely: boolean;
  }

  const scenarioArb: fc.Arbitrary<MarkedScenario> = flatTreeArb.chain((tree) =>
    fc
      .tuple(
        fc.array(fc.boolean(), { minLength: tree.size, maxLength: tree.size }),
        fc.array(markerArb, { minLength: tree.size, maxLength: tree.size }),
        fc.integer({ min: 1, max: 5 }),
        fc.boolean(),
      )
      .map(([targetMask, markers, extraApplies, removeEntirely]) => ({
        tree,
        targetMask,
        markers,
        extraApplies,
        removeEntirely,
      })),
  );

  function applyMarker(element: HTMLElement, kind: number): void {
    switch (kind) {
      case 1: {
        element.classList.add(PLACEHOLDER_CLASS);
        break;
      }
      case 2: {
        element.setAttribute(HIDDEN_ATTR, RULE_ID);
        break;
      }
      case 3: {
        element.setAttribute(HIDDEN_ATTR, OTHER_RULE_ID);
        break;
      }
      case 4: {
        element.setAttribute(REVEALED_ATTR, RULE_ID);
        break;
      }
      case 5: {
        element.setAttribute(REVEALED_ATTR, OTHER_RULE_ID);
        break;
      }
      default: {
        // 0 — no marker.
      }
    }
  }

  function buildMarkedTree(scenario: MarkedScenario): {
    root: HTMLElement;
    all: HTMLElement[];
  } {
    const all: HTMLElement[] = [];
    const root = buildFlatTree(scenario.tree, all);
    for (const [i, node] of all.entries()) {
      if (scenario.targetMask[i]) {
        node.setAttribute(TARGET_ATTR, "");
      }
      applyMarker(node, scenario.markers[i] as number);
    }
    return { root, all };
  }

  it("DOM after apply once == DOM after apply N (placeholder mode)", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        document.body.replaceChildren();
        const { root } = buildMarkedTree(scenario);
        document.body.append(root);

        const { rule } = createSelectorHideRule({
          id: RULE_ID,
          label: "test",
          description: "test",
          alwaysOnSelectors: [TARGET_SELECTOR],
          hideLabel: HIDE_LABEL,
        });

        rule.apply(document.body);
        const afterFirst = document.body.innerHTML;

        for (let i = 0; i < scenario.extraApplies; i++) {
          rule.apply(document.body);
        }
        const afterNth = document.body.innerHTML;

        expect(afterNth).toBe(afterFirst);
      }),
    );
  });

  it("DOM after apply once == DOM after apply N (removeEntirely mode)", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        document.body.replaceChildren();
        const { root } = buildMarkedTree(scenario);
        document.body.append(root);

        const { rule } = createSelectorHideRule({
          id: RULE_ID,
          label: "test",
          description: "test",
          alwaysOnSelectors: [TARGET_SELECTOR],
          removeEntirely: true,
        });

        rule.apply(document.body);
        const afterFirst = document.body.innerHTML;

        for (let i = 0; i < scenario.extraApplies; i++) {
          rule.apply(document.body);
        }
        const afterNth = document.body.innerHTML;

        expect(afterNth).toBe(afterFirst);
      }),
    );
  });
});
