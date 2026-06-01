// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Persistent storage for the user-supplied OpenAI API key. Split from
// rule-state storage so the background service worker doesn't transitively
// import every rule module just to read a key.

import { createChromeStorageValue } from "./chrome-storage-value";

// True when the build was produced with an OPENAI_API_KEY bundled in.
// Substituted at build time via Bun `define` (see globals.d.ts / build.ts).
export const HAS_BUILT_IN_OPENAI_KEY =
  process.env.HAS_BUILT_IN_OPENAI_KEY === "true";

export const apiKeyStorage = createChromeStorageValue<string>({
  key: "agent-browser-shield.openai-api-key",
  defaultValue: "",
});

export const getUserApiKey = apiKeyStorage.get;
export const subscribeUserApiKey = apiKeyStorage.subscribe;
