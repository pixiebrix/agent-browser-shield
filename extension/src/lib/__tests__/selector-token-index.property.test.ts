// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for findTriggeredRules. The example tests pin down a
// handful of canonical shapes (root match, descendant match, no-match,
// complex fallback). The dispatcher's correctness rests on two
// structural invariants that fuzz better than they assert:
//
//   - Subtree monotonicity: triggered(parent) ⊇ triggered(child) for
//     every parent/child pair in the tree. A bug like "only descend N
//     levels" or "miss the root itself" violates this.
//   - Token soundness: rules registered with `#X` (or `.X`) appear in
//     triggered(root) iff some element in the subtree has that id
//     (or class). Catches "we look at the wrong DOM property" and
//     "we only enumerate the first classList token" style mistakes.
//
// Tree generator mirrors selector-hide-rule.property.test.ts: flat
// `(size, parents[])` encoding so fast-check's shrinker can reduce
// random trees without losing structural validity.

import fc from "fast-check";

import {
  __resetSelectorTokenIndexForTesting,
  findTriggeredRules,
  registerRule,
} from "../selector-token-index";
import type { RuleId } from "../storage";
import { __resetSubtreeWatcherForTesting } from "../subtree-watcher";

// Small alphabets force collisions — a 3-symbol id alphabet means
// roughly one in four nodes shares an id with the registered rule's
// token. Otherwise the random space is too sparse for the
// "rule triggers iff a node has the id" property to fire its iff
// branch in both directions within fast-check's budget.
const ID_ALPHABET = ["a", "b", "c"] as const;
const CLASS_ALPHABET = ["x", "y", "z"] as const;

// `""` in the id alphabet stands for "no id attribute" — about a quarter
// of nodes end up unannotated, which keeps the iff-direction of the
// soundness property exercised in both branches.
const idArb = fc.constantFrom(...ID_ALPHABET, "");
const classesArb = fc.subarray([...CLASS_ALPHABET], {
  minLength: 0,
  maxLength: 3,
});

interface NodeSpec {
  id: string;
  classes: readonly string[];
}

const nodeSpecArb: fc.Arbitrary<NodeSpec> = fc.record({
  id: idArb,
  classes: classesArb,
});

interface FlatTree {
  size: number;
  parents: readonly number[];
  specs: readonly NodeSpec[];
}

const flatTreeArb: fc.Arbitrary<FlatTree> = fc
  .integer({ min: 1, max: 12 })
  .chain((size) => {
    const specsArb = fc.array(nodeSpecArb, {
      minLength: size,
      maxLength: size,
    });
    if (size === 1) {
      return specsArb.map((specs) => ({ size, parents: [], specs }));
    }
    const parentArbs = Array.from({ length: size - 1 }, (_, index) =>
      fc.integer({ min: 0, max: index }),
    );
    return fc
      .tuple(fc.tuple(...parentArbs), specsArb)
      .map(([parents, specs]) => ({ size, parents, specs }));
  });

interface BuiltTree {
  root: HTMLElement;
  nodes: HTMLElement[];
  parents: readonly number[];
}

function buildTree({ size, parents, specs }: FlatTree): BuiltTree {
  const nodes: HTMLElement[] = Array.from({ length: size }, (_, index) => {
    const element = document.createElement("div");
    const spec = specs[index] as NodeSpec;
    if (spec.id !== "") {
      element.id = spec.id;
    }
    for (const cls of spec.classes) {
      element.classList.add(cls);
    }
    return element;
  });
  for (let i = 1; i < size; i++) {
    const parentIndex = parents[i - 1];
    if (parentIndex === undefined) {
      throw new Error("parents array shorter than expected");
    }
    nodes[parentIndex]?.append(nodes[i] as HTMLElement);
  }
  const root = nodes[0];
  if (!root) {
    throw new Error("empty tree (size should be >= 1)");
  }
  return { root, nodes, parents };
}

// Resolve a node's full ancestor chain back to the root, including
// the node itself. Used to verify that every (descendant, ancestor)
// pair satisfies the monotonicity invariant.
function ancestorChain(index: number, parents: readonly number[]): number[] {
  const chain = [index];
  let current = index;
  while (current !== 0) {
    const parent = parents[current - 1];
    if (parent === undefined) {
      throw new Error("invalid parent chain");
    }
    chain.push(parent);
    current = parent;
  }
  return chain;
}

const RULE_FOOTER = "footer-redact" as RuleId;
const RULE_COMMENTS = "comments-redact" as RuleId;
const RULE_REVIEWS = "reviews-redact" as RuleId;
const RULE_COOKIE = "cookie-banner-hide" as RuleId;
const RULE_CHAT = "chat-widget-hide" as RuleId;
const RULE_NEWSLETTER = "newsletter-modal-hide" as RuleId;
const RULE_FALLBACK = "ads-hide" as RuleId;

beforeEach(() => {
  document.body.innerHTML = "";
  __resetSelectorTokenIndexForTesting();
  __resetSubtreeWatcherForTesting();
});

afterEach(() => {
  __resetSelectorTokenIndexForTesting();
  __resetSubtreeWatcherForTesting();
});

describe("findTriggeredRules — structural invariants", () => {
  it("triggered(parent) ⊇ triggered(child) for every parent/child pair", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        __resetSelectorTokenIndexForTesting();
        // One rule per id token and per class token — covers both
        // index axes in a single property run.
        registerRule({
          ruleId: RULE_FOOTER,
          selectors: ["#a"],
          dispatchScan: () => undefined,
        });
        registerRule({
          ruleId: RULE_COMMENTS,
          selectors: ["#b"],
          dispatchScan: () => undefined,
        });
        registerRule({
          ruleId: RULE_REVIEWS,
          selectors: [".x"],
          dispatchScan: () => undefined,
        });
        registerRule({
          ruleId: RULE_COOKIE,
          selectors: [".y"],
          dispatchScan: () => undefined,
        });

        const built = buildTree(tree);
        document.body.append(built.root);

        const triggeredByIndex = built.nodes.map((node) =>
          findTriggeredRules(node),
        );

        for (let i = 1; i < tree.size; i++) {
          const parentIndex = tree.parents[i - 1] as number;
          const childTriggered = triggeredByIndex[i] as Set<RuleId>;
          const parentTriggered = triggeredByIndex[parentIndex] as Set<RuleId>;
          for (const ruleId of childTriggered) {
            // Parent's subtree contains child's subtree by construction,
            // so anything child triggers, parent must trigger.
            expect(parentTriggered.has(ruleId)).toBe(true);
          }
        }
      }),
    );
  });

  it("triggered(root) is the union of all per-node triggers (no rule lost to ancestry)", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        __resetSelectorTokenIndexForTesting();
        registerRule({
          ruleId: RULE_FOOTER,
          selectors: ["#a"],
          dispatchScan: () => undefined,
        });
        registerRule({
          ruleId: RULE_REVIEWS,
          selectors: [".x"],
          dispatchScan: () => undefined,
        });

        const built = buildTree(tree);
        document.body.append(built.root);

        const rootTriggered = findTriggeredRules(built.root);
        const perNodeUnion = new Set<RuleId>();
        for (const node of built.nodes) {
          for (const ruleId of findTriggeredRules(node)) {
            perNodeUnion.add(ruleId);
          }
        }

        expect(rootTriggered).toEqual(perNodeUnion);
      }),
    );
  });

  it("is idempotent — repeated calls produce equal sets", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        __resetSelectorTokenIndexForTesting();
        registerRule({
          ruleId: RULE_FOOTER,
          selectors: ["#a", ".x"],
          dispatchScan: () => undefined,
        });

        const built = buildTree(tree);
        document.body.append(built.root);

        const first = findTriggeredRules(built.root);
        const second = findTriggeredRules(built.root);
        expect(second).toEqual(first);
      }),
    );
  });
});

describe("findTriggeredRules — token soundness", () => {
  it("id-keyed rule fires iff some element in the subtree has the matching id", () => {
    fc.assert(
      fc.property(
        flatTreeArb,
        fc.constantFrom(...ID_ALPHABET),
        (tree, targetId) => {
          __resetSelectorTokenIndexForTesting();
          registerRule({
            ruleId: RULE_FOOTER,
            selectors: [`#${targetId}`],
            dispatchScan: () => undefined,
          });

          const built = buildTree(tree);
          document.body.append(built.root);

          // For each node, the rule should fire iff the subtree rooted
          // at that node contains an element with id=targetId.
          for (let i = 0; i < built.nodes.length; i++) {
            const node = built.nodes[i] as HTMLElement;
            const chain = ancestorChain(i, tree.parents);
            const subtreeIndexes = new Set<number>([i]);
            // A subtree contains every node whose ancestor chain passes
            // through `i`. Walk all nodes and check.
            for (let j = 0; j < built.nodes.length; j++) {
              if (ancestorChain(j, tree.parents).includes(i)) {
                subtreeIndexes.add(j);
              }
            }
            const hasMatch = [...subtreeIndexes].some(
              (index) => (tree.specs[index] as NodeSpec).id === targetId,
            );
            const triggered = findTriggeredRules(node);
            expect(triggered.has(RULE_FOOTER)).toBe(hasMatch);
            // `chain` only exists to anchor i within the larger tree;
            // touching it in a property assertion would let fast-check
            // shrink past the case we're checking.
            expect(chain.at(-1)).toBe(0);
          }
        },
      ),
    );
  });

  it("class-keyed rule fires iff some element in the subtree has the matching class", () => {
    fc.assert(
      fc.property(
        flatTreeArb,
        fc.constantFrom(...CLASS_ALPHABET),
        (tree, targetClass) => {
          __resetSelectorTokenIndexForTesting();
          registerRule({
            ruleId: RULE_REVIEWS,
            selectors: [`.${targetClass}`],
            dispatchScan: () => undefined,
          });

          const built = buildTree(tree);
          document.body.append(built.root);

          for (let i = 0; i < built.nodes.length; i++) {
            const node = built.nodes[i] as HTMLElement;
            const subtreeIndexes = new Set<number>([i]);
            for (let j = 0; j < built.nodes.length; j++) {
              if (ancestorChain(j, tree.parents).includes(i)) {
                subtreeIndexes.add(j);
              }
            }
            const hasMatch = [...subtreeIndexes].some((index) =>
              (tree.specs[index] as NodeSpec).classes.includes(targetClass),
            );
            const triggered = findTriggeredRules(node);
            expect(triggered.has(RULE_REVIEWS)).toBe(hasMatch);
          }
        },
      ),
    );
  });

  it("multiple class tokens on one element all surface their rules", () => {
    fc.assert(
      fc.property(
        fc.subarray([...CLASS_ALPHABET], {
          minLength: 1,
          maxLength: 3,
        }),
        (classes) => {
          __resetSelectorTokenIndexForTesting();
          const ruleByClass: Record<string, RuleId> = {
            x: RULE_FOOTER,
            y: RULE_COMMENTS,
            z: RULE_REVIEWS,
          };
          for (const cls of CLASS_ALPHABET) {
            registerRule({
              ruleId: ruleByClass[cls] as RuleId,
              selectors: [`.${cls}`],
              dispatchScan: () => undefined,
            });
          }

          const node = document.createElement("div");
          for (const cls of classes) {
            node.classList.add(cls);
          }
          document.body.append(node);

          const triggered = findTriggeredRules(node);
          // Every class the node carries should surface its rule;
          // classes it doesn't carry should not.
          for (const cls of CLASS_ALPHABET) {
            expect(triggered.has(ruleByClass[cls] as RuleId)).toBe(
              classes.includes(cls),
            );
          }
        },
      ),
    );
  });
});

describe("findTriggeredRules — complex fallback", () => {
  it("complex-fallback rules appear in triggered(root) for every tree", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        __resetSelectorTokenIndexForTesting();
        // No id/class tokens on the rule — it can only run via the
        // complex-fallback bucket, so every dispatched root must
        // trigger it regardless of contents.
        registerRule({
          ruleId: RULE_FALLBACK,
          selectors: ['[role="dialog"]'],
          dispatchScan: () => undefined,
        });
        // A non-fallback rule for contrast: should only fire when a
        // matching token is present.
        registerRule({
          ruleId: RULE_FOOTER,
          selectors: ["#a"],
          dispatchScan: () => undefined,
        });

        const built = buildTree(tree);
        document.body.append(built.root);

        for (const node of built.nodes) {
          const triggered = findTriggeredRules(node);
          expect(triggered.has(RULE_FALLBACK)).toBe(true);
        }
      }),
    );
  });

  it("mixed id+complex rule still fires on the id path when the complex bucket also applies", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        __resetSelectorTokenIndexForTesting();
        // The rule has both an id selector and a complex selector —
        // it lands in *both* idIndex["a"] and complexFallback, so it
        // should always fire (via fallback). The non-complex rule
        // is a control: it should only fire when its id is present.
        registerRule({
          ruleId: RULE_CHAT,
          selectors: ["#a", '[role="dialog"]'],
          dispatchScan: () => undefined,
        });
        registerRule({
          ruleId: RULE_NEWSLETTER,
          selectors: ["#b"],
          dispatchScan: () => undefined,
        });

        const built = buildTree(tree);
        document.body.append(built.root);

        const rootTriggered = findTriggeredRules(built.root);
        expect(rootTriggered.has(RULE_CHAT)).toBe(true);

        const hasB = tree.specs.some((spec) => spec.id === "b");
        expect(rootTriggered.has(RULE_NEWSLETTER)).toBe(hasB);
      }),
    );
  });
});
