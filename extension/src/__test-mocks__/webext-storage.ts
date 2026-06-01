// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// In-memory stub of the subset of `webext-storage` we use. Wired up via
// `moduleNameMapper` in `jest.config.cjs` so tests can import storage modules
// without pulling in the real ESM-only package (which trips ts-jest's CJS
// transform). The stub keeps a per-key value so `get()` round-trips through
// `set()` and `onChanged` fires on writes — enough for any future test that
// wants to exercise the storage adapter end to end. Today every storage-aware
// test mocks the wrapping module wholesale and never reaches this code.

interface StorageItemOptions<T> {
  area?: string;
  defaultValue?: T;
}

const values = new Map<string, unknown>();
const listeners = new Map<string, Set<(next: unknown) => void>>();

export class StorageItem<Base, Return = Base | undefined> {
  readonly key: string;
  readonly defaultValue?: Return;

  constructor(key: string, options: StorageItemOptions<Return> = {}) {
    this.key = key;
    if (options.defaultValue !== undefined) {
      this.defaultValue = options.defaultValue;
    }
  }

  get(): Promise<Return> {
    const value = values.has(this.key)
      ? values.get(this.key)
      : this.defaultValue;
    return Promise.resolve(value as Return);
  }

  set(value: Exclude<Return, undefined>): Promise<void> {
    values.set(this.key, value);
    for (const listener of listeners.get(this.key) ?? []) {
      listener(value);
    }
    return Promise.resolve();
  }

  has(): Promise<boolean> {
    return Promise.resolve(values.has(this.key));
  }

  remove(): Promise<void> {
    values.delete(this.key);
    return Promise.resolve();
  }

  onChanged(
    callback: (value: Exclude<Return, undefined>) => void,
    signal?: AbortSignal,
  ): void {
    const set = listeners.get(this.key) ?? new Set();
    const wrapped = (next: unknown) => {
      callback(next as Exclude<Return, undefined>);
    };
    set.add(wrapped);
    listeners.set(this.key, set);
    signal?.addEventListener(
      "abort",
      () => {
        set.delete(wrapped);
      },
      { once: true },
    );
  }
}

export class StorageItemMap<T> {
  constructor(
    public readonly key: string,
    public readonly options: StorageItemOptions<T> = {},
  ) {}
}
