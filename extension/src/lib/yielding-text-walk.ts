// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Chunked text-node walk for rules that scan large `innerText`
// (pii-redact, secrets-redact, encoded-payload-redact,
// prompt-injection-redact). Yields between chunks so the regex loops
// don't block the event loop for hundreds of milliseconds on dense
// pages, and surfaces an `AbortSignal` so an SPA route change can
// cancel a scan started against the old tree before it finishes
// mutating the new one.
//
// API note: the walk is synchronous when the tree fits in one chunk
// (the common case for small subtrees + the default chunkSize=100).
// Trees that span multiple chunks continue across scheduler yields,
// with `onComplete` firing in a microtask after the last chunk. The
// sync-first-fast-path lets existing rule tests `apply` and then
// assert without an explicit `await` — only the multi-chunk path
// (large pages, abort tests) needs to flush.
//
// The filter (NON_CONTENT_TAGS skip, isInsidePlaceholder skip,
// minLength, optional shouldSkipParent) mirrors `walkTextNodes` in
// dom-utils — same predicates, different consumer shape.
//
// Collection phase descends into open shadow roots so the
// injection-defense rules (the primary consumers of this walker)
// catch payloads rendered inside web-component shadow trees. Closed
// shadow roots are opaque by design and not visited.

import type { TextNodeWithInlineGroup } from "./dom-utils";
import {
  collectTextNodesShadowPiercing,
  collectTextNodesWithInlineGroups,
} from "./dom-utils";

export interface WalkTextNodesChunkedOptions {
  // Aborts the walk at the next chunk boundary. Already-processed
  // chunks stay; partially-processed chunks are not possible because
  // `process` runs atomically on the full chunk.
  signal?: AbortSignal;
  // Minimum nodeValue length before the node is offered to `process`.
  // Same semantics as `walkTextNodes`.
  minLength?: number;
  // Extra parent-element predicate beyond the universal NON_CONTENT_TAGS
  // and placeholder skips.
  shouldSkipParent?: (parent: Element) => boolean;
  // Cap on the per-process batch size. Larger = fewer scheduler yields,
  // longer blocking windows. The default trades off well for the
  // text-walk rules — most batches fit in one chunk and never yield.
  chunkSize?: number;
  // Invoked once per filled chunk plus once for the trailing partial
  // chunk. Synchronous: any DOM mutations should land before the next
  // yield so a route-change abort doesn't leave a half-mutated batch.
  process: (chunk: Text[]) => void;
  // Called after the last chunk is processed (or skipped due to abort).
  // Runs synchronously when the walk fit in one chunk; otherwise in a
  // microtask after the final yield. Use for cross-chunk post-passes
  // (e.g., prompt-injection-redact's outermost-match dedupe of
  // collected container elements).
  onComplete?: () => void;
  // Override the yield mechanism. Production uses requestIdleCallback
  // (yields to layout/paint) with a setTimeout(0) fallback; tests can
  // pass a microtask-based yield to avoid driving fake timers.
  yieldStrategy?: () => Promise<void>;
}

function defaultYieldStrategy(): Promise<void> {
  if (typeof requestIdleCallback === "function") {
    return new Promise<void>((resolve) => {
      globalThis.requestIdleCallback(() => {
        resolve();
      });
    });
  }
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function walkTextNodesChunked(
  root: ParentNode,
  options: WalkTextNodesChunkedOptions,
): void {
  const {
    signal,
    minLength = 0,
    shouldSkipParent,
    chunkSize = 100,
    process,
    onComplete,
    yieldStrategy = defaultYieldStrategy,
  } = options;

  if (signal?.aborted) {
    return;
  }

  // Pre-collect every matching text node in one pass. The original
  // implementation interleaved a TreeWalker with chunked processing
  // and had to dance around walker.currentNode resume across the
  // boundary where the consumer detached nodes. Pre-collection makes
  // the resume problem disappear (the array holds direct refs) and
  // unlocks shadow-piercing — TreeWalker doesn't cross shadow
  // boundaries, but the recursive collector does. Memory cost is one
  // Text reference per qualifying node; CPU cost is one O(n) walk
  // up-front instead of an O(n) walk interleaved with processing.
  const texts = collectTextNodesShadowPiercing(
    root,
    shouldSkipParent ? { minLength, shouldSkipParent } : { minLength },
  );

  let index = 0;

  function runFinalize(): void {
    if (signal?.aborted) {
      return;
    }
    onComplete?.();
  }

  // Process up to `chunkSize` text nodes; returns "yield" when there's
  // more to do (consumer must await a scheduler yield before calling
  // again) or "done" when the array is exhausted.
  function runChunkSync(): "yield" | "done" {
    const end = Math.min(index + chunkSize, texts.length);
    if (end > index) {
      process(texts.slice(index, end));
      index = end;
    }
    return index < texts.length ? "yield" : "done";
  }

  function continueAsync(): void {
    void yieldStrategy().then(() => {
      if (signal?.aborted) {
        return;
      }
      if (runChunkSync() === "done") {
        runFinalize();
      } else {
        continueAsync();
      }
    });
  }

  if (runChunkSync() === "done") {
    runFinalize();
  } else {
    continueAsync();
  }
}

export interface WalkTextNodeGroupsChunkedOptions {
  signal?: AbortSignal;
  minLength?: number;
  shouldSkipParent?: (parent: Element) => boolean;
  chunkSize?: number;
  // Same chunking contract as `walkTextNodesChunked`, but each entry
  // carries its inline-formatting-context id so the consumer can detect
  // matches that span sibling text nodes within one inline context.
  // Chunk boundaries can fall mid-group — group id is stable across
  // chunks, so a consumer that batches by group can detect that on its
  // own.
  process: (chunk: TextNodeWithInlineGroup[]) => void;
  onComplete?: () => void;
  yieldStrategy?: () => Promise<void>;
}

// Group-aware variant of `walkTextNodesChunked`. Same chunked-yield
// semantics; the only difference is the item type. Existing callers
// (prompt-injection-redact) keep using the non-group walker; the
// `inline-text-redact` factory uses this one to enable cross-node
// detection.
export function walkTextNodeGroupsChunked(
  root: ParentNode,
  options: WalkTextNodeGroupsChunkedOptions,
): void {
  const {
    signal,
    minLength = 0,
    shouldSkipParent,
    chunkSize = 100,
    process,
    onComplete,
    yieldStrategy = defaultYieldStrategy,
  } = options;

  if (signal?.aborted) {
    return;
  }

  const entries = collectTextNodesWithInlineGroups(
    root,
    shouldSkipParent ? { minLength, shouldSkipParent } : { minLength },
  );

  let index = 0;

  function runFinalize(): void {
    if (signal?.aborted) {
      return;
    }
    onComplete?.();
  }

  function runChunkSync(): "yield" | "done" {
    const end = Math.min(index + chunkSize, entries.length);
    if (end > index) {
      process(entries.slice(index, end));
      index = end;
    }
    return index < entries.length ? "yield" : "done";
  }

  function continueAsync(): void {
    void yieldStrategy().then(() => {
      if (signal?.aborted) {
        return;
      }
      if (runChunkSync() === "done") {
        runFinalize();
      } else {
        continueAsync();
      }
    });
  }

  if (runChunkSync() === "done") {
    runFinalize();
  } else {
    continueAsync();
  }
}
