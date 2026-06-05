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

import { filterToOutermost } from "../dom-utils";
import { PLACEHOLDER_CLASS } from "../placeholder";
import { createSelectorHideRule } from "../selector-hide-rule";
import type { RuleId } from "../storage";

const RULE_ID = "footer-redact" as RuleId;
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
  document.body.innerHTML = "";
});

describe("scan() outermost-match (property)", () => {
  it("places exactly one placeholder per outermost match", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        document.body.innerHTML = "";
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
        document.body.innerHTML = "";
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
        document.body.innerHTML = "";
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
        document.body.innerHTML = "";
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
