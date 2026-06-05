// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property tests for the shadow-root tracker + the subtree watcher's
// shadow integration. Three structural invariants that fuzz better than
// they assert:
//
//   - Closed roots never enter the open-tracker. A future refactor that
//     accidentally registers a closed root would leak it to every
//     subscriber.
//   - discoverShadowRootsIn is set-idempotent — its result depends only
//     on the document's open-shadow shape, not on the order or number
//     of attach / discover operations leading up to it. Catches
//     order-of-operations bugs in the bootstrap path.
//   - The subtree watcher's dispatch covers every element living inside
//     any open shadow root reachable from the target, transitively.
//     Closed shadows cut off the branch but siblings stay covered. This
//     is the integration property the hand-written tests don't enumerate
//     across nesting depths.

import fc from "fast-check";

import { __resetRouteChangeForTesting } from "../route-change";
import {
  __resetShadowRootsForTesting,
  discoverShadowRootsIn,
  getOpenShadowRoots,
  installShadowRootHook,
} from "../shadow-roots";
import {
  __resetSubtreeWatcherForTesting,
  createSubtreeWatcher,
} from "../subtree-watcher";

const THROTTLE_MS = 250;

beforeEach(() => {
  document.body.innerHTML = "";
  __resetShadowRootsForTesting();
  __resetRouteChangeForTesting();
  __resetSubtreeWatcherForTesting();
  installShadowRootHook();
});

afterEach(() => {
  __resetShadowRootsForTesting();
  __resetRouteChangeForTesting();
  __resetSubtreeWatcherForTesting();
});

// -----------------------------------------------------------------------
// Generators
// -----------------------------------------------------------------------

// Each node spec carries an optional shadow attachment. `null` means no
// shadow; `"open"` / `"closed"` attach a root in that mode. Closed roots
// silently swallow any child specs assigned to them (they're opaque to
// our tracker, which is exactly the property we want to fuzz).
type ShadowMode = "open" | "closed" | null;

interface NodeSpec {
  shadow: ShadowMode;
}

const shadowModeArb: fc.Arbitrary<ShadowMode> = fc.oneof(
  { arbitrary: fc.constant(null as ShadowMode), weight: 4 },
  { arbitrary: fc.constant<ShadowMode>("open"), weight: 3 },
  { arbitrary: fc.constant<ShadowMode>("closed"), weight: 1 },
);

const nodeSpecArb: fc.Arbitrary<NodeSpec> = fc.record({
  shadow: shadowModeArb,
});

interface FlatTree {
  size: number;
  parents: readonly number[];
  // Whether node i should be parented into its parent's *shadow root*
  // (if its parent has one) vs. the parent's light children. Honored
  // only when the parent has an open or closed shadow root. Lets the
  // generator produce content inside shadow trees, not just hosts of
  // empty shadows.
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
  // Which shadow root (if any) the node was parented into. null means
  // light-tree placement. Used by the dispatch-coverage assertion to
  // decide which subset of nodes should be reachable through the
  // watcher's payload.
  parentShadows: Array<ShadowRoot | null>;
}

function buildTree(tree: FlatTree): BuiltTree {
  const { size, parents, intoShadow, specs } = tree;
  const nodes: HTMLElement[] = [];
  const parentShadows: Array<ShadowRoot | null> = [];

  for (let i = 0; i < size; i++) {
    const element = document.createElement("div");
    element.dataset.index = String(i);
    nodes.push(element);
    parentShadows.push(null);
  }

  // Attach shadows in pre-order so children can be placed into them.
  for (let i = 0; i < size; i++) {
    const mode = (specs[i] as NodeSpec).shadow;
    if (mode !== null) {
      nodes[i]?.attachShadow({ mode });
    }
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
    const placeInShadow = intoShadow[i - 1] === true && parent.shadowRoot;
    if (placeInShadow) {
      placeInShadow.append(nodes[i] as HTMLElement);
      parentShadows[i] = placeInShadow;
    } else {
      parent.append(nodes[i] as HTMLElement);
    }
  }

  const root = nodes[0];
  if (!root) {
    throw new Error("empty tree (size should be >= 1)");
  }
  return { root, nodes, parentShadows };
}

// -----------------------------------------------------------------------
// Invariant 1: closed roots never enter the open-tracker
// -----------------------------------------------------------------------

describe("shadow-root tracker — closed-root isolation", () => {
  it("getOpenShadowRoots only ever contains open roots, for any random tree", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        const built = buildTree(tree);
        document.body.append(built.root);

        const tracked = getOpenShadowRoots();

        // Every tracked root must be the .shadowRoot of *some* element
        // in the tree (i.e. it was attached as "open" — the only kind
        // exposed through that property).
        const hostShadows = new Set<ShadowRoot>();
        for (const node of built.nodes) {
          if (node.shadowRoot) {
            hostShadows.add(node.shadowRoot);
          }
        }
        for (const root of tracked) {
          expect(hostShadows.has(root)).toBe(true);
        }

        // Symmetric: every host that has a non-null .shadowRoot is open
        // and should be tracked.
        for (const node of built.nodes) {
          if (node.shadowRoot) {
            expect(tracked.has(node.shadowRoot)).toBe(true);
          }
        }
      }),
    );
  });

  it("the tracker size equals the number of nodes with open shadows", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        const built = buildTree(tree);
        document.body.append(built.root);

        const openCount = tree.specs.filter(
          (spec) => spec.shadow === "open",
        ).length;
        expect(getOpenShadowRoots().size).toBe(openCount);
      }),
    );
  });
});

// -----------------------------------------------------------------------
// Invariant 2: discoverShadowRootsIn set-idempotence under interleavings
// -----------------------------------------------------------------------

// Op shape (inferred from the generator):
//   { kind: "attach", mode: "open" | "closed", hostIndex: number }
//   { kind: "discover" }
//
// Hand-rolled chain: build a small pool of hosts first, then generate
// a random ordered sequence of attach / discover operations against
// them. fc's sized arbitraries don't naturally compose this shape,
// and the explicit version reads more clearly than nested chains.
const opSequenceArb = fc.integer({ min: 1, max: 8 }).chain((hostCount) =>
  fc
    .array(
      fc.oneof(
        fc.record({
          kind: fc.constant<"attach">("attach"),
          mode: fc.constantFrom<"open" | "closed">("open", "closed"),
          hostIndex: fc.integer({ min: 0, max: hostCount - 1 }),
        }),
        fc.record({ kind: fc.constant<"discover">("discover") }),
      ),
      { minLength: 1, maxLength: 16 },
    )
    .map((ops) => ({ hostCount, ops })),
);

describe("discoverShadowRootsIn — set-idempotence", () => {
  it("final registry equals the set of open roots, regardless of attach/discover order", () => {
    fc.assert(
      fc.property(opSequenceArb, ({ hostCount, ops }) => {
        // Hard reset between iterations — fast-check runs the body
        // many times in one `it`, and any host left behind in body
        // would still be findable by a discoverShadowRootsIn call in
        // a later iteration.
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        const hosts = Array.from({ length: hostCount }, () => {
          const host = document.createElement("div");
          document.body.append(host);
          return host;
        });
        const attached = new Set<number>();
        const expectedOpen = new Set<ShadowRoot>();

        for (const op of ops) {
          if (op.kind === "attach") {
            const host = hosts[op.hostIndex];
            // attachShadow throws if the host already has a shadow of
            // either mode. Track attachment ourselves because
            // host.shadowRoot is null for closed roots and would
            // otherwise miss the second-call-on-closed case.
            if (!host || attached.has(op.hostIndex)) {
              continue;
            }
            attached.add(op.hostIndex);
            const root = host.attachShadow({ mode: op.mode });
            if (op.mode === "open") {
              expectedOpen.add(root);
            }
          } else {
            discoverShadowRootsIn(document.body);
          }
        }

        // After any sequence, the registry should equal exactly the
        // set of "attach open" results — discover calls don't add or
        // remove anything that attachShadow didn't already register,
        // and never accidentally add closed roots.
        const tracked = new Set(getOpenShadowRoots());
        expect(tracked).toEqual(expectedOpen);
      }),
    );
  });

  it("discovery rebuilds every open root reachable from body without crossing closed shadows", () => {
    fc.assert(
      fc.property(flatTreeArb, (tree) => {
        document.body.innerHTML = "";
        __resetShadowRootsForTesting();
        const built = buildTree(tree);
        document.body.append(built.root);

        // Compute the expected reachable set by walking the document
        // ourselves through light children and through open shadows
        // only. Open shadows nested inside a closed shadow are
        // deliberately unreachable — closed roots are dead-ends.
        const reachable = new Set<ShadowRoot>();
        const stack: Node[] = [document.body];
        while (stack.length > 0) {
          const node = stack.pop();
          if (!node) {
            continue;
          }
          if (node instanceof Element && node.shadowRoot) {
            reachable.add(node.shadowRoot);
            stack.push(node.shadowRoot);
          }
          for (const child of node.childNodes) {
            stack.push(child);
          }
        }

        // Simulate "attached before our content script loaded" — the
        // hook never saw these. Re-discovery from body must recover
        // exactly the reachable set.
        __resetShadowRootsForTesting();
        discoverShadowRootsIn(document.body);

        expect(new Set(getOpenShadowRoots())).toEqual(reachable);
      }),
    );
  });
});

// -----------------------------------------------------------------------
// Invariant 3: dispatch coverage on randomized nested shadow forests
// -----------------------------------------------------------------------

// Walk one shadow tree (no crossing into nested shadows) and collect
// every element. Used to compute the "should have been seen" set for
// the coverage assertion.
function elementsInTree(root: ParentNode): Set<Element> {
  const out = new Set<Element>();
  for (const element of root.querySelectorAll("*")) {
    out.add(element);
  }
  return out;
}

describe("subtree watcher — shadow dispatch coverage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Every element that lives directly inside an *open* shadow root
  // tracked by the dispatcher should be reachable through the
  // subscriber payload — either as a dispatched root itself, or as a
  // descendant of one (within the same shadow tree boundary, since
  // querySelectorAll doesn't cross shadows). Elements inside closed
  // shadows must NOT appear, even transitively.
  it("covers every open-shadow element and excludes every closed-shadow element", async () => {
    await fc.assert(
      fc.asyncProperty(flatTreeArb, async (tree) => {
        __resetShadowRootsForTesting();
        __resetSubtreeWatcherForTesting();
        document.body.innerHTML = "";
        installShadowRootHook();

        const built = buildTree(tree);
        document.body.append(built.root);

        // Compute coverage targets BEFORE starting the watcher so the
        // assertion is about the dispatcher's discovery + observation,
        // not about elements added later.
        const openShadowElements = new Set<Element>();
        const closedShadowElements = new Set<Element>();
        for (const node of built.nodes) {
          if (!node.shadowRoot) {
            // Either no shadow, or a closed one — closed shadows are
            // walked via the build-time parentShadows map below.
            continue;
          }
          for (const element of elementsInTree(node.shadowRoot)) {
            openShadowElements.add(element);
          }
        }
        // Closed-shadow descendants aren't reachable through
        // host.shadowRoot — that property is null for closed hosts by
        // design. The builder's parentShadows map remembers where each
        // child was placed: a child whose parent host has null
        // .shadowRoot but whose parentShadows entry is non-null lives
        // in a closed tree.
        for (let i = 1; i < built.nodes.length; i++) {
          const placed = built.parentShadows[i];
          if (!placed) {
            continue;
          }
          const hostIndex = tree.parents[i - 1] as number;
          const host = built.nodes[hostIndex] as HTMLElement;
          if (host.shadowRoot === null) {
            // Host's shadow is closed.
            closedShadowElements.add(built.nodes[i] as Element);
          }
        }

        const onSubtrees = jest.fn();
        const watcher = createSubtreeWatcher({ onSubtrees });
        watcher.start(document.body);

        await Promise.resolve();
        jest.advanceTimersByTime(THROTTLE_MS);
        await Promise.resolve();

        const dispatched = new Set<Element>();
        const calls = onSubtrees.mock.calls as Array<[Element[]]>;
        for (const [roots] of calls) {
          for (const root of roots) {
            dispatched.add(root);
            for (const descendant of root.querySelectorAll("*")) {
              dispatched.add(descendant);
            }
          }
        }

        // Coverage: every open-shadow element is reachable from some
        // dispatched root (the root itself or one of its descendants
        // within the same shadow tree).
        for (const element of openShadowElements) {
          expect(dispatched.has(element)).toBe(true);
        }

        // Isolation: no closed-shadow element appears in the payload.
        for (const element of closedShadowElements) {
          expect(dispatched.has(element)).toBe(false);
        }

        watcher.stop();
      }),
      // Async properties are slower than sync ones; cap the runs to
      // keep the suite snappy. 30 is plenty to find the obvious
      // shapes; deeper fuzz would belong in a slower nightly run.
      { numRuns: 30 },
    );
  });
});
