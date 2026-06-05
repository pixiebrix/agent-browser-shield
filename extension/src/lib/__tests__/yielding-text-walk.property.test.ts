// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property test for the chunked walker's equivalence with
// `walkTextNodes`. For any tree shape, any text content, any chunkSize,
// the concatenation of all chunks plus the order they were delivered
// must equal what `walkTextNodes` would return. Catches:
//   - missing the trailing partial chunk
//   - dropping nodes at the chunk boundary (the "next prefetched but
//     never pushed" class of bug)
//   - double-processing nodes across the sync→async transition
//   - drift in the filter predicates (NON_CONTENT_TAGS, minLength)
//     between the two walkers

import fc from "fast-check";

import { walkTextNodes } from "../dom-utils";
import { walkTextNodesChunked } from "../yielding-text-walk";

interface FlatTree {
  size: number;
  parents: readonly number[];
  texts: readonly string[];
  tags: readonly string[];
}

// Tag alphabet excludes `<script>` and `<style>` deliberately —
// jsdom tries to evaluate inline script bodies and chokes on the
// random text content fast-check generates. The filter-parity branch
// for NON_CONTENT_TAGS is covered explicitly in the example tests.
const TAG_ALPHABET = ["div", "p", "span", "section", "article"] as const;

const flatTreeArb: fc.Arbitrary<FlatTree> = fc
  .integer({ min: 1, max: 15 })
  .chain((size) => {
    const tagsArb = fc.array(fc.constantFrom(...TAG_ALPHABET), {
      minLength: size,
      maxLength: size,
    });
    // Text content can vary in length so the minLength filter has both
    // accepted and rejected nodes to choose between.
    const textsArb = fc.array(
      fc.oneof(fc.constant(""), fc.string({ minLength: 1, maxLength: 30 })),
      { minLength: size, maxLength: size },
    );
    if (size === 1) {
      return fc.tuple(tagsArb, textsArb).map(([tags, texts]) => ({
        size,
        parents: [],
        tags,
        texts,
      }));
    }
    const parentArbs = Array.from({ length: size - 1 }, (_, i) =>
      fc.integer({ min: 0, max: i }),
    );
    return fc
      .tuple(fc.tuple(...parentArbs), tagsArb, textsArb)
      .map(([parents, tags, texts]) => ({ size, parents, tags, texts }));
  });

function buildTree(spec: FlatTree): HTMLElement {
  const nodes: HTMLElement[] = Array.from({ length: spec.size }, (_, i) => {
    const element = document.createElement(spec.tags[i] as string);
    const text = spec.texts[i] as string;
    if (text.length > 0) {
      element.append(document.createTextNode(text));
    }
    return element;
  });
  for (let i = 1; i < spec.size; i++) {
    const parentIndex = spec.parents[i - 1] as number;
    nodes[parentIndex]?.append(nodes[i] as HTMLElement);
  }
  return nodes[0] as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("walkTextNodesChunked (property)", () => {
  it("flat-mapped chunks equal walkTextNodes output (sync, large chunkSize)", () => {
    fc.assert(
      fc.property(
        flatTreeArb,
        fc.integer({ min: 1, max: 8 }),
        (tree, minLength) => {
          document.body.innerHTML = "";
          const root = buildTree(tree);
          document.body.append(root);

          const expected = walkTextNodes(document.body, { minLength });

          const actual: Text[] = [];
          walkTextNodesChunked(document.body, {
            minLength,
            // Big enough to guarantee the sync path even for the largest
            // tree we generate.
            chunkSize: 1000,
            process: (chunk) => {
              actual.push(...chunk);
            },
          });

          expect(actual).toEqual(expected);
        },
      ),
    );
  });

  it("flat-mapped chunks equal walkTextNodes output (async, small chunkSize)", async () => {
    await fc.assert(
      fc.asyncProperty(
        flatTreeArb,
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 8 }),
        async (tree, chunkSize, minLength) => {
          document.body.innerHTML = "";
          const root = buildTree(tree);
          document.body.append(root);

          const expected = walkTextNodes(document.body, { minLength });

          const actual: Text[] = [];
          let done = false;
          walkTextNodesChunked(document.body, {
            minLength,
            chunkSize,
            // Microtask yield — `await Promise.resolve()` below drains
            // each chunk's scheduled continuation in turn.
            yieldStrategy: () => Promise.resolve(),
            process: (chunk) => {
              actual.push(...chunk);
            },
            onComplete: () => {
              done = true;
            },
          });

          // Drain microtasks until the walk completes. Bounded so a
          // helper bug that prevented completion would fail fast
          // rather than hang the test runner. eslint can't see that
          // `done` flips inside the helper's microtask callback.
          for (let i = 0; i <= expected.length + 5; i++) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (done) {
              break;
            }
            await Promise.resolve();
          }

          expect(actual).toEqual(expected);
          expect(done).toBe(true);
        },
      ),
    );
  });

  it("chunks are sized at most chunkSize; only the trailing chunk can be short", async () => {
    await fc.assert(
      fc.asyncProperty(
        flatTreeArb,
        fc.integer({ min: 1, max: 5 }),
        async (tree, chunkSize) => {
          document.body.innerHTML = "";
          const root = buildTree(tree);
          document.body.append(root);

          const expected = walkTextNodes(document.body, { minLength: 0 });
          if (expected.length === 0) {
            // No accepted nodes — chunk-size invariant is vacuous; the
            // helper just fires onComplete with no process calls.
            return;
          }

          const sizes: number[] = [];
          let done = false;
          walkTextNodesChunked(document.body, {
            chunkSize,
            yieldStrategy: () => Promise.resolve(),
            process: (chunk) => {
              sizes.push(chunk.length);
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

          for (let i = 0; i < sizes.length - 1; i++) {
            expect(sizes[i]).toBe(chunkSize);
          }
          const last = sizes.at(-1) as number;
          expect(last).toBeGreaterThan(0);
          expect(last).toBeLessThanOrEqual(chunkSize);
        },
      ),
    );
  });
});
