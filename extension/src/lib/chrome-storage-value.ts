// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Factory for a typed value persisted under a single key in
// `chrome.storage.local`. Wraps the get / set / onChanged plumbing so each
// stored setting (rule states, enforcement flag, placeholder display mode,
// user API key) only has to declare its key, default, and normalization.
//
// The subscribe callback always receives both the new and previous normalized
// values — callers that only care about the new value can take a single
// parameter (TypeScript silently allows narrower listeners).

export interface ChromeStorageValue<T> {
  get(): Promise<T>;
  set(value: T): Promise<void>;
  subscribe(listener: (next: T, previous: T) => void): () => void;
}

export function createChromeStorageValue<T>(options: {
  key: string;
  normalize: (raw: unknown) => T;
}): ChromeStorageValue<T> {
  const { key, normalize } = options;
  return {
    async get() {
      const stored = await chrome.storage.local.get(key);
      return normalize(stored[key]);
    },
    async set(value) {
      await chrome.storage.local.set({ [key]: value });
    },
    subscribe(listener) {
      const handler = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName !== "local") {
          return;
        }
        const change = changes[key];
        if (!change) {
          return;
        }
        listener(normalize(change.newValue), normalize(change.oldValue));
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}
