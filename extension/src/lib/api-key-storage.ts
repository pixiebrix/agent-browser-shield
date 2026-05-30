// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Persistent storage for the user-supplied OpenAI API key. Split from
// rule-state storage so the background service worker doesn't transitively
// import every rule module just to read a key.

const API_KEY_STORAGE_KEY = "agent-browser-shield.openai-api-key";

// True when the build was produced with an OPENAI_API_KEY bundled in.
// Substituted at build time via Bun `define` (see globals.d.ts / build.ts).
export const HAS_BUILT_IN_OPENAI_KEY =
  process.env.HAS_BUILT_IN_OPENAI_KEY === "true";

export async function getUserApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  const value = stored[API_KEY_STORAGE_KEY];
  return typeof value === "string" ? value : "";
}

export async function setUserApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
}

export function subscribeUserApiKey(
  listener: (key: string) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    const change = changes[API_KEY_STORAGE_KEY];
    if (!change) return;
    const value = change.newValue;
    listener(typeof value === "string" ? value : "");
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
