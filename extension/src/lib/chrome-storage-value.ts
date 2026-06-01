// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Thin adapter over `webext-storage` that produces the `{ get, set, subscribe }`
// shape the rest of the codebase (and the `useChromeStorageValue` hook) reads.
// `webext-storage` owns the typed-key plumbing and the `onChanged` listener
// filtering; this wrapper exists to:
//   1. expose `subscribe` returning an unsubscribe (the hook's contract),
//      built on `StorageItem.onChanged` + an `AbortController`.
//   2. let callers thread an optional `normalize` for legacy/cross-version
//      data shapes (e.g. `RuleStates` where the rule catalog can grow between
//      releases). For values we always write through a typed `.set()` and the
//      default covers the missing-key case, `normalize` is unnecessary.

import { StorageItem } from "webext-storage";

export interface ChromeStorageValue<T> {
  get: () => Promise<T>;
  set: (value: T) => Promise<void>;
  subscribe: (listener: (next: T) => void) => () => void;
}

// `T extends NonNullable<unknown>` rules out `undefined` (and `null`), which
// `StorageItem.set` / `onChanged` also forbid — passing `undefined` to
// `StorageItem.set` is overloaded to remove the key, so it has to be excluded
// from the value type. The constraint lets us forward `T` to those methods
// without per-call casts.
export function createChromeStorageValue<
  T extends NonNullable<unknown>,
>(options: {
  key: string;
  defaultValue: T;
  // `normalize` is only needed for stored shapes that can drift from `T` across
  // versions (e.g. `RuleStates`, where new rule ids appear in the catalog
  // between releases). Typed as `(raw: unknown)` rather than `(raw: T)` so the
  // implementation can defensively type-check stored values.
  normalize?: (raw: unknown) => T;
}): ChromeStorageValue<T> {
  const { key, defaultValue, normalize } = options;
  const item = new StorageItem<T, T>(key, { defaultValue });
  const read = (raw: T): T => (normalize ? normalize(raw) : raw);
  return {
    async get() {
      return read(await item.get());
    },
    async set(value) {
      await item.set(value);
    },
    subscribe(listener) {
      const controller = new AbortController();
      item.onChanged((next) => {
        listener(read(next));
      }, controller.signal);
      return () => {
        controller.abort();
      };
    },
  };
}
