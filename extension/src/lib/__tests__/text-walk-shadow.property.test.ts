// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for the shadow-piercing extension of walkTextNodes /
// collectTextNodesShadowPiercing / visibleTextContent / the chunked
// walker. Three invariants:
//
//   - Coverage: for any random tree with open/closed shadow attachments
//     and text content in both light and shadow trees, walkTextNodes
//     returns exactly the text nodes reachable through light children
//     and open shadow boundaries. Closed shadows are dead-ends and
//     their text never surfaces.
//   - visibleTextContent concatenation matches the same reachable set
//     in the same pre-order traversal.
//   - The chunked walker's union of processed chunks matches the
//     eager walker — equivalence holds across the shadow extension,
//     not just the light tree.

import fc from "fast-check";

import {
  collectTextNodesShadowPiercing,
  visibleTextContent,
  walkTextNodes,
} from "../dom-utils";
import {
  __resetShadowRootsForTesting,
  installShadowRootHook,
} from "../shadow-roots";
import { walkTextNodesChunked } from "../yielding-text-walk";

beforeEach(() => {
  document.body.innerHTML = "";
  __resetShadowRootsForTesting();
  installShadowRootHook();
});

afterEach(() => {
  __resetShadowRootsForTesting();
});

// -----------------------------------------------------------------------
// Generators
// -----------------------------------------------------------------------

type ShadowMode = "open" | "closed" | null;

interface NodeSpec {
  shadow: ShadowMode;
  // Text content the element will own as a direct text-node child.
  // Empty string means no text node is attached, which keeps the
  // "node has shadow but no own text" branch reachable.
  text: string;
}

const shadowModeArb: fc.Arbitrary<ShadowMode> = fc.oneof(
  { arbitrary: fc.constant<ShadowMode>(null), weight: 4 },
  { arbitrary: fc.constant<ShadowMode>("open"), weight: 3 },
  { arbitrary: fc.constant<ShadowMode>("closed"), weight: 1 },
);

const nodeSpecArb: fc.Arbitrary<NodeSpec> = fc.record({
  shadow: shadowModeArb,
  // Mix of empty and short non-empty strings so the minLength filter
  // exercises both branches and shadow-vs-light text both surface.
  text: fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 12 })),
});

interface FlatTree {
  size: number;
  parents: readonly number[];
  intoShadow: readonly boolean[];
  specs: readonly NodeSpec[];
}

const flatTreeArb: fc.Arbitrary<FlatTree> = fc
  .integer({ min: 1, max: 10 })
  .chain((size) => {
    const specsArb = fc.array(nodeSpecArb, {
      minLength: size,
      maxLength: size,
    });
    if (size === 1) {
      return specsArb.map((specs) => ({
        size,
        parents: [],
        intoShadow: [],
        specs,
      }));
    }
    const parentArbs = Array.from({ length: size - 1 }, (_, index) =>
      fc.integer({ min: 0, max: index }),
    );
    const intoShadowArb = fc.array(fc.boolean(), {
      minLength: size - 1,
      maxLength: size - 1,
    });
    return fc
      .tuple(fc.tuple(...parentArbs), intoShadowArb, specsArb)
      .map(([parents, intoShadow, specs]) => ({
        size,
        parents,
        intoShadow,
        specs,
      }));
  });

interface BuiltTree {
  root: HTMLElement;
  nodes: HTMLElement[];
  // Captured at attach time so we can reach closed shadow roots later
  // — host.shadowRoot is null for closed mode, so a later
  // `parent.shadowRoot.append(child)` won't work for them. Keeping the
  // reference here lets the builder actually place content into closed
  // shadows, which the exclusion property needs to be non-vacuous.
  shadowsByIndex: Array<ShadowRoot | null>;
}

function buildTree(tree: FlatTree): BuiltTree {
  const { size, parents, intoShadow, specs } = tree;
  const nodes: HTMLElement[] = [];
  const shadowsByIndex: Array<ShadowRoot | null> = [];

  for (let i = 0; i < size; i++) {
    const element = document.createElement("div");
    element.dataset.index = String(i);
    const text = (specs[i] as NodeSpec).text;
    if (text.length > 0) {
      element.append(document.createTextNode(text));
    }
    nodes.push(element);
  }

  // Pre-order attach so shadow targets exist before children try to land.
  for (let i = 0; i < size; i++) {
    const mode = (specs[i] as NodeSpec).shadow;
    shadowsByIndex.push(
      mode === null ? null : (nodes[i] as HTMLElement).attachShadow({ mode }),
    );
  }

  for (let i = 1; i < size; i++) {
    const parentIndex = parents[i - 1];
    if (parentIndex === undefined) {
      continue;
    }
    const parent = nodes[parentIndex];
    if (!parent) {
      continue;
    }
    const parentShadow = shadowsByIndex[parentIndex];
    const placeInShadow = intoShadow[i - 1] === true && parentShadow;
    if (placeInShadow) {
      parentShadow.append(nodes[i] as HTMLElement);
    } else {
      parent.append(nodes[i] as HTMLElement);
    }
  }

  const root = nodes[0];
  if (!root) {
    throw new Error("empty tree (size should be >= 1)");
  }
  return { root, nodes, shadowsByIndex };
}

// -----------------------------------------------------------------------
// Reference implementation
// -----------------------------------------------------------------------

// Manual recursive walker that pre-orders light children, then descends
// into open shadow roots. The text helpers are correct iff their output
// matches this reference for every random tree.
function referenceTextNodes(
  root: Node,
  options: { minLength?: number } = {},
): Text[] {
  const { minLength = 0 } = options;
  const out: Text[] = [];
  function visit(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const value = text.nodeValue;
      if (value && value.length >= minLength) {
        out.push(text);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node as Element;
    // Match the helpers' NON_CONTENT_TAGS pruning. The generator
    // doesn't emit script/style/noscript/template, so this is just
    // a defensive mirror.
    if (
      element.tagName === "SCRIPT" ||
      element.tagName === "STYLE" ||
      element.tagName === "NOSCRIPT" ||
      element.tagName === "TEMPLATE"
    ) {
      return;
    }
    for (const child of element.childNodes) {
      visit(child);
    }
    if (element.shadowRoot) {
      for (const child of element.shadowRoot.childNodes) {
        visit(child);
      }
    }
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    visit(root);
  } else {
    for (const child of (root as ParentNode).childNodes) {
      visit(child);
    }
  }
  return out;
}

// -----------------------------------------------------------------------
// Invariant 1: walkTextNodes / collectTextNodesShadowPiercing coverage
// -----------------------------------------------------------------------

describe("walkTextNodes — shadow coverage", () => {
  it("returns exactly the open-shadow-reachable text nodes for any tree", () => {
    fc.assert(
      fc.property(
        flatTreeArb,
        fc.integer({ min: 0, max: 6 }),
        (tree, minLength) => {
          document.body.innerHTML = "";
          __resetShadowRootsForTesting();
          installShadowRootHook();
          const built = buildTree(tree);
          document.body.append(built.root);

          const expected = referenceTextNodes(document.body, { minLength });
          const actual = walkTextNodes(document.body, { minLength });
          expect(actual).toEqual(expected);
        },
      ),
    );
  });

  it("collectTextNodesShadowPiercing matches walkTextNodes (same core)", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        installShadowRootHook();
        const built = buildTree(tree);
        document.body.append(built.root);

        // walkTextNodes delegates to collectTextNodesShadowPiercing
        // today, but the public surface is what consumers depend on
        // — pin the equivalence so a future refactor that diverges
        // them surfaces here.
        const a = walkTextNodes(document.body, { minLength: 1 });
        const b = collectTextNodesShadowPiercing(document.body, {
          minLength: 1,
        });
        expect(a).toEqual(b);
      }),
    );
  });

  it("never returns text living inside a closed shadow root", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        installShadowRootHook();
        const built = buildTree(tree);
        document.body.append(built.root);

        // Walk every descendant of every closed shadow root the
        // builder created. Descent has to use the builder's captured
        // shadow references because host.shadowRoot is null for
        // closed-mode hosts and a recursive light-only walk from the
        // host won't find anything in there. Once a text node is
        // inside a closed shadow tree, NO further descent can take
        // it back into reachable territory.
        const closedSubtreeText = new Set<Text>();
        function collectAllText(node: Node, into: Set<Text>): void {
          if (node.nodeType === Node.TEXT_NODE) {
            into.add(node as Text);
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }
          const element = node as Element;
          for (const child of element.childNodes) {
            collectAllText(child, into);
          }
          // Also follow the shadow reference (open OR closed) — once
          // inside a closed wrapper, every nested open shadow is
          // still unreachable to the production walker, so its text
          // is in the exclusion set too.
          const index = Number.parseInt(
            (element as HTMLElement).dataset.index ?? "-1",
            10,
          );
          if (index >= 0) {
            const shadow = built.shadowsByIndex[index];
            if (shadow) {
              for (const child of shadow.childNodes) {
                collectAllText(child, into);
              }
            }
          }
        }
        for (let i = 0; i < built.nodes.length; i++) {
          const shadow = built.shadowsByIndex[i];
          if (!shadow || (built.nodes[i] as HTMLElement).shadowRoot) {
            // No shadow, or it's open and reachable through normal
            // walk — exclusion set doesn't apply.
            continue;
          }
          for (const child of shadow.childNodes) {
            collectAllText(child, closedSubtreeText);
          }
        }

        const reachable = new Set(walkTextNodes(document.body));
        for (const text of closedSubtreeText) {
          expect(reachable.has(text)).toBe(false);
        }
      }),
    );
  });
});

// -----------------------------------------------------------------------
// Invariant 2: visibleTextContent concatenation
// -----------------------------------------------------------------------

describe("visibleTextContent — shadow coverage", () => {
  it("concatenates the same reachable text in pre-order for any tree", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        installShadowRootHook();
        const built = buildTree(tree);
        document.body.append(built.root);

        const expectedConcat = referenceTextNodes(built.root)
          .map((t) => t.textContent)
          .join("");
        const actualConcat = visibleTextContent(built.root);
        expect(actualConcat).toEqual(expectedConcat);
      }),
    );
  });
});

// -----------------------------------------------------------------------
// Invariant 3: chunked walker equivalence across shadow boundaries
// -----------------------------------------------------------------------

describe("walkTextNodesChunked — shadow equivalence with walkTextNodes", () => {
  it("union of chunks equals walkTextNodes output across nested shadows (sync)", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        installShadowRootHook();
        const built = buildTree(tree);
        document.body.append(built.root);

        const expected = walkTextNodes(document.body, { minLength: 0 });

        const actual: Text[] = [];
        walkTextNodesChunked(document.body, {
          // Big enough to hit the sync fast-path for any random tree
          // up to the generator's cap.
          chunkSize: 1000,
          process: (chunk) => {
            actual.push(...chunk);
          },
        });

        expect(actual).toEqual(expected);
      }),
    );
  });

  it("union of chunks equals walkTextNodes output across nested shadows (async)", async () => {
    await fc.assert(
      fc.asyncProperty(
        flatTreeArb,
        fc.integer({ min: 1, max: 3 }),
        async (tree, chunkSize) => {
          document.body.innerHTML = "";
          __resetShadowRootsForTesting();
          installShadowRootHook();
          const built = buildTree(tree);
          document.body.append(built.root);

          const expected = walkTextNodes(document.body, { minLength: 0 });

          const actual: Text[] = [];
          let done = false;
          walkTextNodesChunked(document.body, {
            chunkSize,
            yieldStrategy: () => Promise.resolve(),
            process: (chunk) => {
              actual.push(...chunk);
            },
            onComplete: () => {
              done = true;
            },
          });

          for (let i = 0; i <= expected.length + 5; i++) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (done) {
              break;
            }
            await Promise.resolve();
          }

          expect(done).toBe(true);
          expect(actual).toEqual(expected);
        },
      ),
      // Async fc properties are slower; cap to keep the suite snappy.
      // Belongs on fc.assert, not on asyncProperty — the latter would
      // interpret the options object as another arbitrary.
      { numRuns: 30 },
    );
  });
});
