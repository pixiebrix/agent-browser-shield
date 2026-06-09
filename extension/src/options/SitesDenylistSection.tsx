// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useState } from "react";
import { isValidPattern, siteDenylistStorage } from "../lib/site-denylist";

// Audit + power-user editor for the per-site enforcement denylist
// (ADR-0018). The popup is the one-click authoring surface; this list is
// where users see what they've scoped off and remove individual entries.
// The *Add pattern* input accepts any URL Pattern string and validates
// against `new URLPattern(input)` before saving — loud failure here so
// users typing patterns by hand get an immediate signal.
export function SitesDenylistSection({ denylist }: { denylist: string[] }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (): Promise<void> => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Pattern cannot be empty.");
      return;
    }
    if (!isValidPattern(trimmed)) {
      setError(
        "Not a valid URL Pattern. Example: https://example.com/* or https://*.example.com/*",
      );
      return;
    }
    if (denylist.includes(trimmed)) {
      setError("Pattern is already in the denylist.");
      return;
    }
    setError(null);
    await siteDenylistStorage.set([...denylist, trimmed]);
    setDraft("");
  };

  const handleRemove = async (pattern: string): Promise<void> => {
    await siteDenylistStorage.set(denylist.filter((p) => p !== pattern));
  };

  const sorted = denylist.toSorted((a, b) => a.localeCompare(b));

  return (
    <>
      <p className="hint">
        Sites where you've paused every rule. Authored from the toolbar popup
        ("Disable on this site") or added by URL Pattern below. Matches the
        active tab's top-frame URL; subframes inherit.
      </p>
      {sorted.length === 0 ? (
        <p className="hint site-denylist__empty">
          No sites disabled. Open a site in a tab and click the toolbar icon to
          scope the shield off on that host.
        </p>
      ) : (
        <ul className="site-denylist__list">
          {sorted.map((pattern) => (
            <li key={pattern} className="site-denylist__row">
              <code className="site-denylist__pattern">{pattern}</code>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void handleRemove(pattern);
                }}
                aria-label={`Remove ${pattern}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="site-denylist__add">
        <label htmlFor="site-denylist-input" className="visually-hidden">
          Add a URL Pattern to the denylist
        </label>
        <input
          id="site-denylist-input"
          type="text"
          spellCheck={false}
          placeholder="https://example.com/*"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        <button
          type="button"
          onClick={() => {
            void handleAdd();
          }}
        >
          Add pattern
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
