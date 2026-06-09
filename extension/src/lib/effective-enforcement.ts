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

import { enforcementStorage, subscribeEnforcementEnabled } from "./enforcement";
import { isTopFrame } from "./frame";
import { matchesDenylist, siteDenylistStorage } from "./site-denylist";

let cachedTopFrameUrl: string | null = null;
let cachedGlobal = true;
let cachedDenylist: string[] = [];
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

// Resolves to the current effective enforcement boolean and installs the
// underlying storage subscriptions. Idempotent: callers (rule-engine) only
// call this once, but a second call would re-fetch + re-subscribe without
// duplicating listeners (storage subscriptions are scoped to AbortControllers
// held by the chrome-storage-value wrapper).
export async function initEffectiveEnforcement(): Promise<boolean> {
  const [global, denylist, topUrl] = await Promise.all([
    enforcementStorage.get(),
    siteDenylistStorage.get(),
    fetchTopFrameUrl(),
  ]);
  cachedGlobal = global;
  cachedDenylist = denylist;
  cachedTopFrameUrl = topUrl;
  lastEffective = computeEffective();

  subscribeEnforcementEnabled((next) => {
    cachedGlobal = next;
    notify();
  });
  siteDenylistStorage.subscribe((next) => {
    cachedDenylist = next;
    notify();
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
