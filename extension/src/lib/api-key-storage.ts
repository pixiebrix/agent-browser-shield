// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Persistent storage for the user-supplied OpenAI API key. Split from
// rule-state storage so the background service worker doesn't transitively
// import every rule module just to read a key.

const API_KEY_STORAGE_KEY = "agent-browser-shield.openai-api-key";

export async function getUserApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(API_KEY_STORAGE_KEY);
  const value = stored[API_KEY_STORAGE_KEY];
  return typeof value === "string" ? value : "";
}

export async function setUserApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key });
}
