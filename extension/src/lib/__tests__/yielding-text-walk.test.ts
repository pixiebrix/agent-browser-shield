// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Tests for the chunked text-walk helper used by the four text-heavy
// rules (pii-redact, secrets-redact, encoded-payload-redact,
// prompt-injection-redact). Pins down:
//   - sync fast path: a tree that fits in one chunk produces its
//     process + onComplete calls before the helper returns
//   - chunked path: multi-chunk trees yield via the injected
//     yieldStrategy, process fires per chunk, onComplete fires after
//     the last one
//   - signal handling: an abort before any chunk skips everything;
//     an abort between chunks stops further processing and onComplete
//   - filter parity with walkTextNodes (NON_CONTENT_TAGS, placeholder
//     skip, minLength, shouldSkipParent)

import { PLACEHOLDER_CLASS } from "../placeholder";
import { walkTextNodesChunked } from "../yielding-text-walk";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("walkTextNodesChunked — sync fast path", () => {
  it("processes the whole tree in one chunk when it fits", () => {
    document.body.innerHTML = `<p>one</p><p>two</p><p>three</p>`;
    const chunks: number[] = [];
    let completed = false;

    walkTextNodesChunked(document.body, {
      process: (chunk) => {
        chunks.push(chunk.length);
      },
      onComplete: () => {
        completed = true;
      },
    });

    // Sync path: process and onComplete fired before walkTextNodesChunked
    // returned. No microtask flush needed.
    expect(chunks).toEqual([3]);
    expect(completed).toBe(true);
  });

  it("returns void with no calls when the tree is empty", () => {
    const process = jest.fn();
    const onComplete = jest.fn();
    walkTextNodesChunked(document.body, { process, onComplete });
    expect(process).not.toHaveBeenCalled();
    // onComplete still fires — caller's post-pass should run on every
    // walk, even if no nodes were collected.
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("matches root element itself when walking from it", () => {
    const p = document.createElement("p");
    p.textContent = "hello";
    document.body.append(p);
    const seen: string[] = [];
    walkTextNodesChunked(p, {
      process: (chunk) => {
        for (const node of chunk) {
          seen.push(node.nodeValue ?? "");
        }
      },
    });
    expect(seen).toEqual(["hello"]);
  });
});

describe("walkTextNodesChunked — chunked path", () => {
  it("fires process once per filled chunk and onComplete after the last", async () => {
    // 5 text nodes, chunkSize 2 → chunks of 2, 2, 1.
    document.body.innerHTML = Array.from(
      { length: 5 },
      (_, i) => `<p>text-${i}</p>`,
    ).join("");

    const chunkSizes: number[] = [];
    let completed = false;
    // Microtask yield keeps the test ergonomic — no fake timers needed
    // to drive yieldStrategy. Each `await Promise.resolve()` drains
    // one microtask, which advances the helper one chunk.
    const microtaskYield = (): Promise<void> => Promise.resolve();

    walkTextNodesChunked(document.body, {
      chunkSize: 2,
      yieldStrategy: microtaskYield,
      process: (chunk) => {
        chunkSizes.push(chunk.length);
      },
      onComplete: () => {
        completed = true;
      },
    });

    // First chunk processed synchronously before the helper returned.
    expect(chunkSizes).toEqual([2]);
    expect(completed).toBe(false);

    // Drain microtasks for each remaining yield. With 3 chunks total
    // (2, 2, 1) we need 2 microtask drains: one for the second chunk
    // and onComplete is still pending; one more after the third chunk.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(chunkSizes).toEqual([2, 2, 1]);
    expect(completed).toBe(true);
  });
});

describe("walkTextNodesChunked — signal handling", () => {
  it("skips the walk entirely when the signal is already aborted", () => {
    document.body.innerHTML = `<p>one</p><p>two</p>`;
    const controller = new AbortController();
    controller.abort();
    const process = jest.fn();
    const onComplete = jest.fn();
    walkTextNodesChunked(document.body, {
      signal: controller.signal,
      process,
      onComplete,
    });
    expect(process).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("stops between chunks when the signal aborts mid-walk", async () => {
    document.body.innerHTML = Array.from(
      { length: 6 },
      (_, i) => `<p>t-${i}</p>`,
    ).join("");
    const controller = new AbortController();
    const chunkSizes: number[] = [];
    let completed = false;
    const microtaskYield = (): Promise<void> => Promise.resolve();

    walkTextNodesChunked(document.body, {
      chunkSize: 2,
      yieldStrategy: microtaskYield,
      signal: controller.signal,
      process: (chunk) => {
        chunkSizes.push(chunk.length);
      },
      onComplete: () => {
        completed = true;
      },
    });

    // First chunk processed synchronously.
    expect(chunkSizes).toEqual([2]);

    // Abort before the yield resolves. The continuation checks the
    // signal and bails — no further chunks, no onComplete.
    controller.abort();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(chunkSizes).toEqual([2]);
    expect(completed).toBe(false);
  });

  it("skips onComplete when an abort fires after the last chunk processed but before finalize", () => {
    // Synchronous path: chunk runs, then signal flips, then onComplete
    // is checked. Most consumers (the 4 rules) check the signal
    // themselves inside onComplete, but the helper also gates so
    // misuse stays safe.
    document.body.innerHTML = `<p>one</p>`;
    const controller = new AbortController();
    const onComplete = jest.fn();

    walkTextNodesChunked(document.body, {
      signal: controller.signal,
      process: () => {
        // Mid-chunk: signal flips before we get to onComplete.
        controller.abort();
      },
      onComplete,
    });

    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("walkTextNodesChunked — filter parity with walkTextNodes", () => {
  it("skips SCRIPT / STYLE / NOSCRIPT / TEMPLATE text", () => {
    document.body.innerHTML = `
      <p>real</p>
      <script>script</script>
      <style>style</style>
      <noscript>noscript</noscript>
      <template>template</template>
    `;
    const values: string[] = [];
    walkTextNodesChunked(document.body, {
      process: (chunk) => {
        for (const node of chunk) {
          const text = node.nodeValue?.trim();
          if (text) {
            values.push(text);
          }
        }
      },
    });
    expect(values).toContain("real");
    expect(values).not.toContain("script");
    expect(values).not.toContain("style");
    expect(values).not.toContain("noscript");
    expect(values).not.toContain("template");
  });

  it("skips text inside an existing placeholder", () => {
    document.body.innerHTML = `
      <p>real</p>
      <span class="${PLACEHOLDER_CLASS}">hidden</span>
    `;
    const values: string[] = [];
    walkTextNodesChunked(document.body, {
      process: (chunk) => {
        for (const node of chunk) {
          const text = node.nodeValue?.trim();
          if (text) {
            values.push(text);
          }
        }
      },
    });
    expect(values).toContain("real");
    expect(values).not.toContain("hidden");
  });

  it("respects minLength", () => {
    document.body.innerHTML = `<p>short</p><p>a long string of text</p>`;
    const seen: string[] = [];
    walkTextNodesChunked(document.body, {
      minLength: 10,
      process: (chunk) => {
        for (const node of chunk) {
          seen.push(node.nodeValue ?? "");
        }
      },
    });
    expect(seen).toEqual(["a long string of text"]);
  });

  it("respects shouldSkipParent", () => {
    document.body.innerHTML = `
      <article><p>article-text</p></article>
      <aside><p>aside-text</p></aside>
    `;
    const seen: string[] = [];
    walkTextNodesChunked(document.body, {
      shouldSkipParent: (parent) => parent.closest("aside") !== null,
      process: (chunk) => {
        for (const node of chunk) {
          const text = node.nodeValue?.trim();
          if (text) {
            seen.push(text);
          }
        }
      },
    });
    expect(seen).toEqual(["article-text"]);
  });
});
