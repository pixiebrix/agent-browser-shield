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

// In-memory stub mirroring `StorageItemMap`'s secondary-key model: each entry
// is stored under `${key}:::${secondaryKey}` in a shared map so `get` round-
// trips through `set`/`remove` and `onChanged` fires the (secondaryKey, value)
// shape the real package emits (value undefined on removal).
const mapValues = new Map<string, unknown>();
const mapListeners = new Map<
  string,
  Set<(secondaryKey: string, value: unknown) => void>
>();

export class StorageItemMap<T> {
  readonly prefix: string;
  readonly defaultValue?: T;

  constructor(key: string, options: StorageItemOptions<T> = {}) {
    this.prefix = `${key}:::`;
    if (options.defaultValue !== undefined) {
      this.defaultValue = options.defaultValue;
    }
  }

  has(secondaryKey: string): Promise<boolean> {
    return Promise.resolve(mapValues.has(this.prefix + secondaryKey));
  }

  get(secondaryKey: string): Promise<T | undefined> {
    const rawKey = this.prefix + secondaryKey;
    const value = mapValues.has(rawKey)
      ? mapValues.get(rawKey)
      : this.defaultValue;
    return Promise.resolve(value as T | undefined);
  }

  set(secondaryKey: string, value: T): Promise<void> {
    mapValues.set(this.prefix + secondaryKey, value);
    for (const listener of mapListeners.get(this.prefix) ?? []) {
      listener(secondaryKey, value);
    }
    return Promise.resolve();
  }

  remove(secondaryKey: string): Promise<void> {
    mapValues.delete(this.prefix + secondaryKey);
    for (const listener of mapListeners.get(this.prefix) ?? []) {
      listener(secondaryKey, undefined);
    }
    return Promise.resolve();
  }

  delete(secondaryKey: string): Promise<void> {
    return this.remove(secondaryKey);
  }

  keys(): Promise<string[]> {
    const result: string[] = [];
    for (const rawKey of mapValues.keys()) {
      if (rawKey.startsWith(this.prefix)) {
        result.push(rawKey.slice(this.prefix.length));
      }
    }
    return Promise.resolve(result);
  }

  clear(): Promise<void> {
    for (const rawKey of mapValues.keys()) {
      if (rawKey.startsWith(this.prefix)) {
        mapValues.delete(rawKey);
      }
    }
    return Promise.resolve();
  }

  async *entries(): AsyncIterableIterator<[string, T]> {
    for (const secondaryKey of await this.keys()) {
      yield [secondaryKey, (await this.get(secondaryKey)) as T];
    }
  }

  onChanged(
    callback: (secondaryKey: string, value: T) => void,
    signal?: AbortSignal,
  ): void {
    const set = mapListeners.get(this.prefix) ?? new Set();
    const wrapped = (secondaryKey: string, value: unknown) => {
      callback(secondaryKey, value as T);
    };
    set.add(wrapped);
    mapListeners.set(this.prefix, set);
    signal?.addEventListener(
      "abort",
      () => {
        set.delete(wrapped);
      },
      { once: true },
    );
  }
}
