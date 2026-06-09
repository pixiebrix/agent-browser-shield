// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import {
  addHostPattern,
  findMatchingPatterns,
  isContentSchemeUrl,
  removeMatchingPatterns,
  siteDenylistStorage,
} from "../lib/site-denylist";

// One control: a toggle that disables / re-enables the whole rule set on
// the active tab's host. ADR-0018 §"Decision Outcome" — the affordance is
// scoped per-site, not per-rule; "Re-enable on this site" removes every
// pattern in the denylist that matches the active tab URL.
//
// Renders nothing while the tab URL or denylist is still loading. Renders
// a disabled button with a hint on non-content schemes (chrome://,
// about:, view-source:) where the content script doesn't run anyway.
export function SiteDisableSection({
  activeTabUrl,
  denylist,
}: {
  activeTabUrl: string | null;
  denylist: string[] | null;
}) {
  if (activeTabUrl === null || denylist === null) {
    return null;
  }
  if (!isContentSchemeUrl(activeTabUrl)) {
    return (
      <div className="site-disable site-disable--unavailable">
        <button
          type="button"
          className="site-disable__button"
          disabled
          aria-label="Disable on this site (unavailable on this page)"
        >
          Disable on this site
        </button>
        <p className="site-disable__hint">
          The shield doesn't run on this page (browser-internal URL).
        </p>
      </div>
    );
  }

  const matching = findMatchingPatterns(activeTabUrl, denylist);
  const denylisted = matching.length > 0;

  let host = "this site";
  try {
    host = new URL(activeTabUrl).host;
  } catch {
    // Should not happen — isContentSchemeUrl already parsed it. Fall through
    // to the generic copy.
  }

  const handleClick = async (): Promise<void> => {
    const current = await siteDenylistStorage.get();
    if (denylisted) {
      const { patterns } = removeMatchingPatterns(activeTabUrl, current);
      await siteDenylistStorage.set(patterns);
    } else {
      const { patterns } = addHostPattern(activeTabUrl, current);
      await siteDenylistStorage.set(patterns);
    }
  };

  return (
    <div
      className={
        denylisted
          ? "site-disable site-disable--off"
          : "site-disable site-disable--on"
      }
    >
      <button
        type="button"
        className="site-disable__button"
        onClick={() => {
          void handleClick();
        }}
      >
        {denylisted
          ? matching.length > 1
            ? `Re-enable on this site (${matching.length} patterns)`
            : "Re-enable on this site"
          : "Disable on this site"}
      </button>
      <p className="site-disable__hint">
        {denylisted
          ? `Rules are paused on ${host}. Clicking will remove every denylist entry matching this URL.`
          : `Pause every rule on ${host}. Manage entries on the Options page.`}
      </p>
    </div>
  );
}
