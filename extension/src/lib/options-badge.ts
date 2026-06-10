// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { log } from "./log";
import { openOptions } from "./messenger";
import { optionsButtonStorage } from "./options-button-toggle";

const BADGE_SELECTOR = "data-abs";
const BADGE_VALUE = "open-options";

function findBadge(): HTMLElement | null {
  return document.querySelector(`[${BADGE_SELECTOR}="${BADGE_VALUE}"]`);
}

function injectBadge(): void {
  if (findBadge()) {
    return;
  }
  const badge = document.createElement("button");
  badge.type = "button";
  badge.setAttribute(BADGE_SELECTOR, BADGE_VALUE);
  badge.setAttribute("aria-label", "Open Agent Browser Shield options");
  badge.title = "Open Agent Browser Shield options";
  badge.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

  Object.assign(badge.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: "2147483647",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "0",
    background: "#18181b",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
    opacity: "0.65",
    transition: "opacity 120ms ease",
    padding: "0",
    margin: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies Partial<CSSStyleDeclaration>);

  badge.addEventListener("mouseenter", () => {
    badge.style.opacity = "1";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.opacity = "0.65";
  });
  badge.addEventListener("click", () => {
    openOptions().catch((error: unknown) => {
      log.error("failed to open options page", error);
    });
  });

  document.body.append(badge);
}

function removeBadge(): void {
  findBadge()?.remove();
}

// Wire the badge to the user's toggle: inject on enable, remove on disable.
// The initial read is async; the subscription handles every later change.
// Callers receive an unsubscribe so tests can tear down between cases.
export function startOptionsBadge(): () => void {
  void optionsButtonStorage.get().then((enabled) => {
    if (enabled) {
      injectBadge();
    } else {
      removeBadge();
    }
  });
  return optionsButtonStorage.subscribe((enabled) => {
    if (enabled) {
      injectBadge();
    } else {
      removeBadge();
    }
  });
}
