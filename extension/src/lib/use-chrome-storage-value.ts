// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";

// Async-readable source with a change subscription. `ChromeStorageValue<T>`
// structurally satisfies this, as does the composite `availability` source.
export interface AsyncReadableSource<T> {
  get(): Promise<T>;
  subscribe(listener: (next: T) => void): () => void;
}

// Reads an `AsyncReadableSource` into component state and keeps it in sync.
// Returns `null` until the first `get()` resolves so callers can render a
// loading state, then updates from the `subscribe` callback on every change.
export function useChromeStorageValue<T>(
  source: AsyncReadableSource<T>,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    source.get().then((initial) => {
      if (!cancelled) setValue(initial);
    });
    const unsubscribe = source.subscribe((next) => {
      setValue(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [source]);
  return value;
}
