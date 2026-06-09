// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Composes the global enforcement kill-switch with the per-site denylist
// (ADR-0018) into a single boolean the rule engine acts on. The rule
// engine treats this exactly the way it treated raw `enforcementStorage`
// before — fail-open until init resolves, then the masked rule-state path
// (`mask` in `rule-engine.ts`) reads from here instead.
//
// URL source:
//   - Top frame uses `globalThis.location.href` at evaluation time, so
//     SPA route changes within the top frame are picked up the next time
//     a storage change re-evaluates. (Pure SPA route changes don't
//     re-evaluate by themselves; this matches how the rest of the engine
//     handles availability — storage events drive reconciliation.)
//   - Sub-frames ask the background for the top-frame URL once at init
//     (`get-tab-url` message). When the background can't be reached, the
//     fallback is "URL unknown → fail open" — better than silently
//     pausing rules in iframes whose tab URL we can't read.
//
// Subframes deliberately do NOT compute the denylist match against their
// own URL. The user's mental model when clicking "Disable on this site"
// in the popup is "disable the shield on this tab"; per ADR-0018, the
// match is evaluated against the tab's top-frame URL and subframes
// inherit.

import type {
  GetTabPauseRequest,
  GetTabPauseResponse,
  TabPauseChangedMessage,
} from "./detection-messages";
import { enforcementStorage, subscribeEnforcementEnabled } from "./enforcement";
import { isTopFrame } from "./frame";
import { matchesDenylist, siteDenylistStorage } from "./site-denylist";

let cachedTopFrameUrl: string | null = null;
let cachedGlobal = true;
let cachedDenylist: string[] = [];
// Tab-scoped recovery pause (ADR-0019). Unlike `cachedGlobal`/`cachedDenylist`,
// this isn't storage-backed on the content side — content scripts can't read
// `chrome.storage.session` and don't know their own tabId — so it's seeded by a
// `get-tab-pause` round-trip at init and updated by `tab-pause-changed`
// broadcasts. A *timed* snooze expiring produces no broadcast, so the open page
// stays revealed until its next navigation re-reads fresh state at init
// ("resume on next navigation"); only an explicit popup edit (pause/reveal, or
// "Resume now") flips this mid-page.
let cachedTabPaused = false;
let lastEffective = true;
const listeners = new Set<(enabled: boolean) => void>();

function readTopFrameUrl(): string | null {
  // For the top frame, `globalThis.location.href` is always the truth —
  // and updates in real time across SPA pushState. For a subframe it's
  // the iframe's own URL, which is the WRONG URL for denylist purposes,
  // so we fall back to the value cached from the background at init.
  return isTopFrame() ? globalThis.location.href : cachedTopFrameUrl;
}

function computeEffective(): boolean {
  if (!cachedGlobal) {
    return false;
  }
  if (cachedTabPaused) {
    return false;
  }
  const url = readTopFrameUrl();
  if (url === null) {
    // Unknown subframe top-URL — fail open. Silently pausing rules in a
    // subframe whose tab URL we can't resolve would surprise the user
    // more than letting rules run.
    return true;
  }
  return !matchesDenylist(url, cachedDenylist);
}

function notify(): void {
  const next = computeEffective();
  if (next === lastEffective) {
    return;
  }
  lastEffective = next;
  for (const listener of listeners) {
    listener(next);
  }
}

async function fetchTopFrameUrl(): Promise<string | null> {
  if (isTopFrame()) {
    return null;
  }
  try {
    const response: unknown = await chrome.runtime.sendMessage({
      type: "get-tab-url",
    });
    if (
      response &&
      typeof response === "object" &&
      "url" in response &&
      typeof response.url === "string"
    ) {
      return response.url;
    }
  } catch {
    // Background may be asleep / restarting / unreachable. Fall through
    // to "unknown URL", which `computeEffective` interprets as fail-open.
  }
  return null;
}

// Unlike the URL fetch, every frame asks — the pause applies to the whole tab,
// and the background resolves it from `sender.tab.id` regardless of frame.
async function fetchTabPaused(): Promise<boolean> {
  try {
    const response: unknown = await chrome.runtime.sendMessage({
      type: "get-tab-pause",
    } satisfies GetTabPauseRequest);
    if (
      response &&
      typeof response === "object" &&
      "paused" in response &&
      typeof (response as GetTabPauseResponse).paused === "boolean"
    ) {
      return (response as GetTabPauseResponse).paused;
    }
  } catch {
    // Background unreachable → assume not paused (fail-open to protected),
    // matching the URL fetch's posture.
  }
  return false;
}

// Resolves to the current effective enforcement boolean and installs the
// underlying storage subscriptions. Idempotent: callers (rule-engine) only
// call this once, but a second call would re-fetch + re-subscribe without
// duplicating listeners (storage subscriptions are scoped to AbortControllers
// held by the chrome-storage-value wrapper).
export async function initEffectiveEnforcement(): Promise<boolean> {
  const [global, denylist, topUrl, tabPaused] = await Promise.all([
    enforcementStorage.get(),
    siteDenylistStorage.get(),
    fetchTopFrameUrl(),
    fetchTabPaused(),
  ]);
  cachedGlobal = global;
  cachedDenylist = denylist;
  cachedTopFrameUrl = topUrl;
  cachedTabPaused = tabPaused;
  lastEffective = computeEffective();

  subscribeEnforcementEnabled((next) => {
    cachedGlobal = next;
    notify();
  });
  siteDenylistStorage.subscribe((next) => {
    cachedDenylist = next;
    notify();
  });
  // The background pushes the tab's pause liveness on every popup edit. Each
  // frame listens independently so its own rule engine reveals / re-applies.
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      message &&
      typeof message === "object" &&
      (message as { type?: unknown }).type === "tab-pause-changed" &&
      typeof (message as TabPauseChangedMessage).paused === "boolean"
    ) {
      cachedTabPaused = (message as TabPauseChangedMessage).paused;
      notify();
    }
    return undefined;
  });

  return lastEffective;
}

export function subscribeEffectiveEnforcement(
  listener: (enabled: boolean) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
