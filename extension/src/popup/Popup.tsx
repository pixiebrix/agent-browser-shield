// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { availabilitySource } from "../lib/availability";
import { enforcementStorage } from "../lib/enforcement";
import { HelpLinks } from "../lib/HelpLinks";
import { optionsButtonStorage } from "../lib/options-button-toggle";
import { RuleList } from "../lib/RuleList";
import { ruleStatesStorage } from "../lib/storage";
import { useChromeStorageValue } from "../lib/use-chrome-storage-value";

export function Popup() {
  const states = useChromeStorageValue(ruleStatesStorage);
  const enforcementEnabled = useChromeStorageValue(enforcementStorage);
  const availability = useChromeStorageValue(availabilitySource);
  const optionsButtonEnabled = useChromeStorageValue(optionsButtonStorage);

  if (
    !states ||
    enforcementEnabled === null ||
    !availability ||
    optionsButtonEnabled === null
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
            All rules are paused for every tab. Your per-rule selection below is
            preserved and restored when you turn enforcement back on.
          </p>
        )}
      </div>
      <RuleList
        states={states}
        availability={availability}
        disabledByEnforcement={!enforcementEnabled}
      />
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
      <HelpLinks className="popup__footer" />
    </div>
  );
}
