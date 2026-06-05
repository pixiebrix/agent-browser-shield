// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// In-memory stub of the subset of `abort-utils` consumed by the
// extension. The real package ships pure ESM, which ts-jest with
// `useESM: false` can't transform — so route imports here via
// `moduleNameMapper` in jest.config.cjs. The stub mirrors the runtime
// semantics tests actually depend on: ReusableAbortController issues
// fresh signals after abortAndReset, and onAbort attaches a disposable
// listener.

export class ReusableAbortController {
  private controller = new AbortController();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(reason?: unknown): void {
    this.controller.abort(reason);
  }

  abortAndReset(reason?: unknown): void {
    this.controller.abort(reason);
    this.controller = new AbortController();
  }
}

type Handle =
  | { disconnect(): void }
  | { abort(reason: unknown): void }
  | { abortAndReset(reason: unknown): void }
  | ((reason: unknown) => void);

export function onAbort(
  signal: AbortController | AbortSignal | undefined,
  ...handles: Handle[]
): { [Symbol.dispose](): void } | undefined {
  if (!signal) {
    return undefined;
  }
  const target = signal instanceof AbortController ? signal.signal : signal;
  const listener = (): void => {
    for (const handle of handles) {
      if (typeof handle === "function") {
        handle(target.reason);
      } else if ("abortAndReset" in handle) {
        handle.abortAndReset(target.reason);
      } else if ("abort" in handle) {
        handle.abort(target.reason);
      } else {
        handle.disconnect();
      }
    }
  };
  target.addEventListener("abort", listener, { once: true });
  return {
    [Symbol.dispose](): void {
      target.removeEventListener("abort", listener);
    },
  };
}
