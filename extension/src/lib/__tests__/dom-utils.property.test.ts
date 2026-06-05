// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for `filterToOutermost` / `filterToInnermost`. These
// helpers dedupe nested candidate sets and are called from every rule that
// picks elements to act on — a bug here leaks into half the codebase. The
// invariants are small enough to state declaratively, so fuzz over random
// trees and random candidate subsets rather than enumerating shapes by hand.

import fc from "fast-check";

import { filterToInnermost, filterToOutermost } from "../dom-utils";

// Build random trees via an explicit flat encoding (n nodes, parent[i] is a
// uniform pick from [0, i-1] for i >= 1) rather than fast-check's recursive
// letrec — the recursive pattern blows the stack at fast-check's default
// depth bias, and weighted-oneof bases still ran deep enough to be flaky.
// The flat encoding produces any tree shape uniformly within the size cap
// and always terminates.
interface FlatTree {
  size: number;
  parents: readonly number[]; // parents[i-1] is the parent index of node i
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
  // Pre-order push so candidates can be selected by index.
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

// Pair a tree with a boolean mask the same length as its node count. The
// `true` entries flag which pre-order nodes are in the candidate set.
const treeWithMask = flatTreeArb.chain((tree) => {
  return fc
    .array(fc.boolean(), { minLength: tree.size, maxLength: tree.size })
    .map((mask) => ({ tree, mask }));
});

interface Scenario {
  root: HTMLElement;
  all: HTMLElement[];
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
  return { root, all, candidates };
}

describe("filterToOutermost (property)", () => {
  it("returns a subset of the input", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const result = filterToOutermost(candidates);
        for (const element of result) {
          expect(candidates).toContain(element);
        }
      }),
    );
  });

  it("never includes two elements where one contains the other", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const result = filterToOutermost(candidates);
        for (const a of result) {
          for (const b of result) {
            if (a === b) {
              continue;
            }
            expect(a.contains(b)).toBe(false);
          }
        }
      }),
    );
  });

  // Maximality: every dropped candidate must have a kept candidate as
  // ancestor. Otherwise filterToOutermost would have over-pruned.
  it("only drops candidates that have another candidate as ancestor", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const result = filterToOutermost(candidates);
        const resultSet = new Set(result);
        for (const candidate of candidates) {
          if (resultSet.has(candidate)) {
            continue;
          }
          const hasAncestor = result.some(
            (other) => other !== candidate && other.contains(candidate),
          );
          expect(hasAncestor).toBe(true);
        }
      }),
    );
  });

  it("preserves the relative order of kept elements", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const result = filterToOutermost(candidates);
        const candidateIndex = new Map<HTMLElement, number>();
        for (const [index, element] of candidates.entries()) {
          candidateIndex.set(element, index);
        }
        let lastIndex = -1;
        for (const element of result) {
          const index = candidateIndex.get(element);
          expect(index).toBeDefined();
          if (index !== undefined) {
            expect(index).toBeGreaterThan(lastIndex);
            lastIndex = index;
          }
        }
      }),
    );
  });

  it("is idempotent: filterToOutermost(filterToOutermost(xs)) === filterToOutermost(xs)", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const once = filterToOutermost(candidates);
        const twice = filterToOutermost(once);
        expect(twice).toEqual(once);
      }),
    );
  });
});

describe("filterToInnermost (property)", () => {
  it("returns a subset of the input", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const result = filterToInnermost(candidates);
        for (const element of result) {
          expect(candidates).toContain(element);
        }
      }),
    );
  });

  it("never includes two elements where one contains the other", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const result = filterToInnermost(candidates);
        for (const a of result) {
          for (const b of result) {
            if (a === b) {
              continue;
            }
            expect(a.contains(b)).toBe(false);
          }
        }
      }),
    );
  });

  // Maximality (dual): every dropped candidate must have a kept candidate as
  // descendant. Otherwise filterToInnermost would have over-pruned.
  it("only drops candidates that have another candidate as descendant", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const result = filterToInnermost(candidates);
        const resultSet = new Set(result);
        for (const candidate of candidates) {
          if (resultSet.has(candidate)) {
            continue;
          }
          const hasDescendant = result.some(
            (other) => other !== candidate && candidate.contains(other),
          );
          expect(hasDescendant).toBe(true);
        }
      }),
    );
  });

  it("is idempotent: filterToInnermost(filterToInnermost(xs)) === filterToInnermost(xs)", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const once = filterToInnermost(candidates);
        const twice = filterToInnermost(once);
        expect(twice).toEqual(once);
      }),
    );
  });
});

describe("filterToOutermost vs filterToInnermost (cross-property)", () => {
  // For any candidate set drawn from a tree, outermost ∩ innermost is
  // exactly the "isolated" candidates — the ones with no candidate
  // ancestor *and* no candidate descendant. Equivalently: a candidate that
  // both filters keep is one no other candidate is related to.
  it("intersection of outermost and innermost is the set of isolated candidates", () => {
    fc.assert(
      fc.property(treeWithMask, (input) => {
        const { candidates } = realize(input);
        const outer = new Set(filterToOutermost(candidates));
        const inner = new Set(filterToInnermost(candidates));
        const both = candidates.filter((c) => outer.has(c) && inner.has(c));

        for (const candidate of both) {
          for (const other of candidates) {
            if (other === candidate) {
              continue;
            }
            expect(candidate.contains(other)).toBe(false);
            expect(other.contains(candidate)).toBe(false);
          }
        }
      }),
    );
  });
});

describe("filterToOutermost / filterToInnermost edge cases", () => {
  it("returns [] for an empty candidate list", () => {
    expect(filterToOutermost([])).toEqual([]);
    expect(filterToInnermost([])).toEqual([]);
  });

  it("returns the singleton for a one-element candidate list", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        const all: HTMLElement[] = [];
        buildFlatTree(tree, all);
        const pick = all[0];
        if (!pick) {
          return;
        }
        expect(filterToOutermost([pick])).toEqual([pick]);
        expect(filterToInnermost([pick])).toEqual([pick]);
      }),
    );
  });
});
