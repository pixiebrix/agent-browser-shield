// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Resolve once the page has been mutation-quiet for `quietMs` consecutive
// milliseconds, or after `timeout` ms whichever comes first. Useful for rules
// that need a stable DOM snapshot (e.g. before sending it to an LLM) — running
// at document_idle alone misses post-hydration mounts that React/Vue apps
// trigger in their first few hundred ms.

export interface WaitForSettleOptions {
  timeout?: number;
  quietMs?: number;
  root?: ParentNode;
  signal?: AbortSignal;
}

export function waitForSettle(
  options: WaitForSettleOptions = {},
): Promise<void> {
  const {
    timeout = 3000,
    quietMs = 500,
    root = document.body,
    signal,
  } = options;

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let lastMutationAt = performance.now();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      observer.disconnect();
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      if (maxTimer) {
        clearTimeout(maxTimer);
      }
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    const observer = new MutationObserver(() => {
      lastMutationAt = performance.now();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });

    const poll = () => {
      const sinceLast = performance.now() - lastMutationAt;
      if (sinceLast >= quietMs) {
        finish();
        return;
      }
      pollTimer = setTimeout(poll, quietMs - sinceLast);
    };
    pollTimer = setTimeout(poll, quietMs);
    maxTimer = setTimeout(finish, timeout);
    signal?.addEventListener("abort", finish);
  });
}
