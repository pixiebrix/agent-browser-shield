// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// The "this page looks broken" recovery controls (ADR-0019, spec 0010
// §"Recovery controls"). Two tab-scoped, non-persistent escapes that are
// deliberately distinct from "Disable on this site" (which writes a permanent
// denylist entry):
//   - "Reveal everything on this page" — the panic button. One click reveals
//     all hidden content for the current page load; a reload restores it.
//   - A snooze — pause protection for this tab, or for 15 min / 1 hour, so a
//     daily driver can get through a checkout without leaving a denylist entry
//     behind to clean up.
//
// Writes the active tab's entry in `tabPauseMap` directly, exactly as
// `SiteDisableSection` writes `siteDenylistStorage`. Renders nothing while the
// tab is still loading, on non-content schemes, or when the site is already
// denylisted (rules don't run there, so there's nothing to recover).

import { findMatchingPatterns, isContentSchemeUrl } from "../lib/site-denylist";
import {
  SNOOZE_1_HOUR_MS,
  SNOOZE_15_MIN_MS,
  tabPauseMap,
} from "../lib/tab-pause";
import { useTabPause } from "./use-tab-pause";

// mm:ss, or h:mm:ss past an hour. `ceil` so a fresh "15 min" snooze reads
// "15:00" rather than "14:59".
function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

export function RecoverySection({
  activeTabId,
  activeTabUrl,
  denylist,
}: {
  activeTabId: number | null;
  activeTabUrl: string | null;
  denylist: string[] | null;
}) {
  const { pause, active, remainingMs } = useTabPause(activeTabId);

  if (activeTabId === null || activeTabUrl === null || denylist === null) {
    return null;
  }
  // The shield doesn't run on browser-internal URLs, and a denylisted site is
  // already fully off — in both cases there's nothing to reveal or snooze, and
  // SiteDisableSection already explains the state. Stay out of the way.
  if (
    !isContentSchemeUrl(activeTabUrl) ||
    findMatchingPatterns(activeTabUrl, denylist).length > 0
  ) {
    return null;
  }

  const key = String(activeTabId);
  const revealEverything = (): void => {
    void tabPauseMap.set(key, { scope: "page", expiresAt: null });
  };
  const snooze = (durationMs: number | null): void => {
    void tabPauseMap.set(key, {
      scope: "tab",
      expiresAt: durationMs === null ? null : Date.now() + durationMs,
    });
  };
  const resume = (): void => {
    void tabPauseMap.remove(key);
  };

  if (active && pause) {
    let status: string;
    if (pause.scope === "page") {
      status =
        "Everything on this page is revealed. Reload the page to restore protection.";
    } else if (remainingMs === null) {
      status = "Protection is paused on this tab.";
    } else {
      status = `Protection is paused — ${formatRemaining(remainingMs)} left.`;
    }
    return (
      <div className="recovery recovery--active">
        <p className="recovery__status">{status}</p>
        <button type="button" className="recovery__resume" onClick={resume}>
          Resume now
        </button>
      </div>
    );
  }

  return (
    <div className="recovery">
      <button
        type="button"
        className="recovery__panic"
        onClick={revealEverything}
      >
        Reveal everything on this page
      </button>
      <div className="recovery__snooze">
        <span className="recovery__snooze-label">Pause protection</span>
        <div className="recovery__snooze-buttons">
          <button
            type="button"
            className="recovery__snooze-button"
            onClick={() => {
              snooze(null);
            }}
          >
            This tab
          </button>
          <button
            type="button"
            className="recovery__snooze-button"
            onClick={() => {
              snooze(SNOOZE_15_MIN_MS);
            }}
          >
            15 min
          </button>
          <button
            type="button"
            className="recovery__snooze-button"
            onClick={() => {
              snooze(SNOOZE_1_HOUR_MS);
            }}
          >
            1 hour
          </button>
        </div>
      </div>
      <p className="recovery__hint">
        Temporary and only for this tab — nothing is saved. To pause a site for
        good, use “Disable on this site” above.
      </p>
    </div>
  );
}
