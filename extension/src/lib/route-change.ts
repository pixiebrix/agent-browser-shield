// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Process-wide SPA route-change emitter.
//
// Rules' subtree watchers subscribe so they can proactively re-sweep when
// the URL changes — without it, a React/Vue route swap that dumps 5k nodes
// in one render either waits out a throttle window before the new content
// is hidden, or misses URL-gated selectors that newly apply (selector-hide
// rules whose siteRules now match this route).
//
// Coverage:
//   - Navigation API (`navigatesuccess`) — modern Chrome; fires for every
//     navigation regardless of how it was triggered, including page-side
//     pushState/replaceState that a content script cannot otherwise hook.
//   - `popstate` — back/forward.
//   - `hashchange` — hash routing.
//
// Older browsers without Navigation API miss pushState-only routes, but the
// MutationObserver still catches the new content on the next throttle window
// — the route-change signal is a latency optimization, not a correctness
// requirement.

import { log } from "./log";

type RouteChangeListener = () => void;

const listeners = new Set<RouteChangeListener>();
let installed = false;
let lastUrl = "";

interface NavigationGlobal {
  navigation?: EventTarget;
}

function emit(): void {
  const url = location.href;
  if (url === lastUrl) {
    return;
  }
  log.info("route change", { from: lastUrl, to: url });
  lastUrl = url;
  for (const listener of listeners) {
    listener();
  }
}

function install(): void {
  if (installed) {
    return;
  }
  installed = true;
  lastUrl = location.href;

  const navigation = (globalThis as NavigationGlobal).navigation;
  if (navigation) {
    navigation.addEventListener("navigatesuccess", emit);
  }
  addEventListener("popstate", emit);
  addEventListener("hashchange", emit);
}

// Listener is called once per detected URL change. The same listener
// subscribed twice fires twice — the watcher relies on this being a
// simple Set add.
export function subscribeRouteChange(
  listener: RouteChangeListener,
): () => void {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Test-only: reset module state between tests. The install() guard would
// otherwise carry listener registrations across test cases.
export function __resetRouteChangeForTesting(): void {
  if (installed) {
    const navigation = (globalThis as NavigationGlobal).navigation;
    if (navigation) {
      navigation.removeEventListener("navigatesuccess", emit);
    }
    removeEventListener("popstate", emit);
    removeEventListener("hashchange", emit);
  }
  listeners.clear();
  installed = false;
  lastUrl = "";
}
