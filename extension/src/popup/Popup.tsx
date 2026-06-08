// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";
import { debugTraceStorage } from "../lib/debug-trace";
import { enforcementStorage } from "../lib/enforcement";
import { HelpLinks } from "../lib/HelpLinks";
import { optionsButtonStorage } from "../lib/options-button-toggle";
import { useChromeStorageValue } from "../lib/use-chrome-storage-value";
import { DebugTraceSection } from "./DebugTraceSection";
import { DetectionsSection } from "./DetectionsSection";
import { PerRuleCountsSection } from "./PerRuleCountsSection";
import { useTabDebugTrace } from "./use-tab-debug-trace";
import { useTabActivity } from "./use-tab-detections";

export function Popup() {
  const enforcementEnabled = useChromeStorageValue(enforcementStorage);
  const optionsButtonEnabled = useChromeStorageValue(optionsButtonStorage);
  const debugTraceEnabled = useChromeStorageValue(debugTraceStorage);
  const activity = useTabActivity();
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  useEffect(() => {
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        setActiveTabId(typeof tab?.id === "number" ? tab.id : null);
      });
  }, []);

  const trace = useTabDebugTrace(debugTraceEnabled ? activeTabId : null);

  if (
    enforcementEnabled === null ||
    optionsButtonEnabled === null ||
    debugTraceEnabled === null
  ) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="popup">
      <h1>Agent Browser Shield</h1>
      <div
        className={
          enforcementEnabled
            ? "enforcement enforcement--on"
            : "enforcement enforcement--off"
        }
      >
        <label className="enforcement__label">
          <span className="enforcement__text">
            <strong>Enforcement</strong>
            <span className="enforcement__state">
              {enforcementEnabled ? "On" : "Off"}
            </span>
          </span>
          <span className="switch" role="presentation">
            <input
              type="checkbox"
              checked={enforcementEnabled}
              onChange={(event) => {
                void enforcementStorage.set(event.target.checked);
              }}
              aria-label="Enable enforcement"
            />
            <span className="switch__track" />
          </span>
        </label>
        {!enforcementEnabled && (
          <p className="enforcement__hint">
            All rules are paused for every tab. Your per-rule selection is
            preserved and restored when you turn enforcement back on.
          </p>
        )}
      </div>
      <button
        type="button"
        className="open-options"
        onClick={() => {
          chrome.runtime.openOptionsPage(() => {
            window.close();
          });
        }}
      >
        Configure rules
      </button>
      <DetectionsSection detections={activity?.detections ?? []} />
      <PerRuleCountsSection entries={activity?.entries ?? []} />
      <label className="options-button-toggle">
        <span className="options-button-toggle__text">
          <strong>On-page options button</strong>
          <span className="options-button-toggle__hint">
            Floating shield button that lets browser-use agents open this
            options page from the page itself.
          </span>
        </span>
        <span className="switch" role="presentation">
          <input
            type="checkbox"
            checked={optionsButtonEnabled}
            onChange={(event) => {
              void optionsButtonStorage.set(event.target.checked);
            }}
            aria-label="Show on-page options button"
          />
          <span className="switch__track" />
        </span>
      </label>
      <label className="options-button-toggle">
        <span className="options-button-toggle__text">
          <strong>Debug trace</strong>
          <span className="options-button-toggle__hint">
            Captures DOM snippets of removed content for debugging. Stored only
            in this browser.
          </span>
        </span>
        <span className="switch" role="presentation">
          <input
            type="checkbox"
            checked={debugTraceEnabled}
            onChange={(event) => {
              void debugTraceStorage.set(event.target.checked);
            }}
            aria-label="Enable debug trace"
          />
          <span className="switch__track" />
        </span>
      </label>
      {debugTraceEnabled && <DebugTraceSection trace={trace} />}
      <HelpLinks className="popup__footer" />
    </div>
  );
}
