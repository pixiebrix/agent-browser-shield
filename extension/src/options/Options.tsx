// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";
import { apiKeyStorage, HAS_BUILT_IN_OPENAI_KEY } from "../lib/api-key-storage";
import { availabilitySource } from "../lib/availability";
import { HelpLinks } from "../lib/HelpLinks";
import { optionsButtonStorage } from "../lib/options-button-toggle";
import { placeholderAdaptivePaletteStorage } from "../lib/placeholder-adaptive-palette";
import type { PlaceholderDisplayMode } from "../lib/placeholder-display";
import { placeholderDisplayStorage } from "../lib/placeholder-display";
import { RuleList } from "../lib/RuleList";
import { runOnInactiveTabsStorage } from "../lib/run-on-inactive-tabs";
import { ruleStatesStorage, setAllRuleStates } from "../lib/storage";
import { useChromeStorageValue } from "../lib/use-chrome-storage-value";
import { useTransientStatus } from "../lib/use-transient-status";
import { parseConfig } from "./parse-config";
import { Section } from "./Section";

export function Options() {
  const states = useChromeStorageValue(ruleStatesStorage);
  const availability = useChromeStorageValue(availabilitySource);
  const displayMode = useChromeStorageValue(placeholderDisplayStorage);
  const storedApiKey = useChromeStorageValue(apiKeyStorage);
  const optionsButtonEnabled = useChromeStorageValue(optionsButtonStorage);
  const runOnInactiveTabs = useChromeStorageValue(runOnInactiveTabsStorage);
  const adaptivePalette = useChromeStorageValue(
    placeholderAdaptivePaletteStorage,
  );

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, showStatus] = useTransientStatus();
  const [apiKeyDraft, setApiKeyDraft] = useState<string | null>(null);
  const [apiKeyStatus, showApiKeyStatus] = useTransientStatus();

  // Initialize the editable API-key field from storage on first load only.
  // Further storage changes (e.g. another tab) keep `storedApiKey` in sync via
  // the hook; we don't blow away the user's in-progress edits.
  useEffect(() => {
    if (storedApiKey !== null && apiKeyDraft === null) {
      setApiKeyDraft(storedApiKey);
    }
  }, [storedApiKey, apiKeyDraft]);

  if (
    !states ||
    !availability ||
    displayMode === null ||
    apiKeyDraft === null ||
    optionsButtonEnabled === null ||
    runOnInactiveTabs === null ||
    adaptivePalette === null
  ) {
    return <div className="loading">Loading…</div>;
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(states, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agent-browser-shield-config.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleApply = async () => {
    const result = parseConfig(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    await setAllRuleStates(result.value);
    showStatus("Applied");
  };

  const handleSaveApiKey = async () => {
    await apiKeyStorage.set(apiKeyDraft.trim());
    showApiKeyStatus("Saved");
  };

  return (
    <div className="options">
      <h1>Agent Browser Shield — Options</h1>

      <nav className="toc" aria-label="Sections">
        <a href="#apply">Apply configuration</a>
        <a href="#export">Export configuration</a>
        <a href="#display">Placeholder display</a>
        <a href="#options-button">On-page options button</a>
        <a href="#inactive-tabs">Inactive tabs</a>
        <a href="#api-key">OpenAI API key</a>
        <a href="#rules">Rules</a>
        <a href="#disclaimer">Disclaimer</a>
      </nav>

      <Section id="apply" title="Apply configuration">
        <p className="hint">
          Paste a JSON object mapping rule IDs to booleans, then click Apply.
          Replaces the full configuration: any rule not listed resets to its
          default (enabled). Unknown keys and non-boolean values are rejected.
        </p>
        <textarea
          className="json-input"
          rows={12}
          spellCheck={false}
          placeholder='{"ads-hide": false, "pii-redact": true}'
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="button-row">
          <button
            type="button"
            onClick={() => {
              void handleApply();
            }}
          >
            Apply
          </button>
          {status && (
            <span className="status" role="status">
              {status}
            </span>
          )}
        </div>
      </Section>

      <Section id="export" title="Export configuration">
        <p className="hint">Download the current rule state as a JSON file.</p>
        <div className="button-row">
          <button type="button" className="secondary" onClick={handleExport}>
            Export JSON
          </button>
        </div>
      </Section>

      <Section id="display" title="Placeholder display">
        <p className="hint">
          How the reveal control on each placeholder is rendered. The
          descriptive label (e.g., what kind of content was hidden) is always
          exposed to screen readers and agents via <code>aria-label</code>.
        </p>
        <fieldset className="radio-group">
          <legend className="visually-hidden">Reveal control style</legend>
          <DisplayModeOption
            mode="icon"
            current={displayMode}
            title="Icon only"
            description="Compact shield icon. Best when placeholders would otherwise grow larger than the content they replace."
          />
          <DisplayModeOption
            mode="button"
            current={displayMode}
            title="Button with label"
            description="Shield icon plus a visible label describing what was hidden. Larger, but visually self-explanatory."
          />
        </fieldset>
        <label className="switch-row">
          <span className="switch-row__text">
            <strong>Adaptive placeholder palette (experimental)</strong>
            <span className="switch-row__state">
              {adaptivePalette ? "On" : "Off"}
            </span>
            <span className="hint">
              Sample each placeholder's surrounding background at insert time
              and pick a light or dark stripe palette accordingly, so redactions
              on dark-themed pages don't flare against the page chrome. Defaults
              and storage key may change between releases while the visual
              heuristic is tuned.
            </span>
          </span>
          <span className="switch" role="presentation">
            <input
              type="checkbox"
              checked={adaptivePalette}
              onChange={(event) => {
                void placeholderAdaptivePaletteStorage.set(
                  event.target.checked,
                );
              }}
              aria-label="Adaptive placeholder palette (experimental)"
            />
            <span className="switch__track" />
          </span>
        </label>
      </Section>

      <Section id="options-button" title="On-page options button">
        <p className="hint">
          Floating shield button in the bottom-right of every page. It only
          exists so browser-use agents driving the page via the accessibility
          tree — which can't click browser chrome — can open this options page.
          Turn it off to hide the button on all pages.
        </p>
        <label className="switch-row">
          <span className="switch-row__text">
            <strong>Show on-page button</strong>
            <span className="switch-row__state">
              {optionsButtonEnabled ? "On" : "Off"}
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
      </Section>

      <Section id="inactive-tabs" title="Inactive tabs">
        <p className="hint">
          When a tab isn't visible, the extension stops watching it for new
          content — background tabs still fire DOM mutations, and ignoring them
          saves work the user can't see. Turn this on if something else reads
          the page while you're not looking at it: a chat copilot, an
          accessibility-tree agent, or a sidebar extension can keep consuming a
          page's content after you switch tabs, and a page that loads or
          rewrites content while hidden would otherwise reach those consumers
          unredacted.
        </p>
        <label className="switch-row">
          <span className="switch-row__text">
            <strong>Keep watching inactive tabs</strong>
            <span className="switch-row__state">
              {runOnInactiveTabs ? "On" : "Off"}
            </span>
          </span>
          <span className="switch" role="presentation">
            <input
              type="checkbox"
              checked={runOnInactiveTabs}
              onChange={(event) => {
                void runOnInactiveTabsStorage.set(event.target.checked);
              }}
              aria-label="Keep watching inactive tabs"
            />
            <span className="switch__track" />
          </span>
        </label>
      </Section>

      <Section id="api-key" title="OpenAI API key">
        <p className="hint">
          Used by the <code>irrelevant-sections-redact</code> rule.{" "}
          {HAS_BUILT_IN_OPENAI_KEY
            ? "A built-in key is bundled with this build; saving a key here overrides it."
            : "No built-in key is bundled with this build — provide one here to enable the rule."}
        </p>
        <input
          type="password"
          className="api-key-input"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            HAS_BUILT_IN_OPENAI_KEY ? "(blank — using built-in key)" : "sk-..."
          }
          value={apiKeyDraft}
          onChange={(event) => {
            setApiKeyDraft(event.target.value);
          }}
        />
        <div className="button-row">
          <button
            type="button"
            onClick={() => {
              void handleSaveApiKey();
            }}
          >
            Save key
          </button>
          {apiKeyStatus && (
            <span className="status" role="status">
              {apiKeyStatus}
            </span>
          )}
        </div>
      </Section>

      <Section id="rules" title="Rules">
        <p className="hint">
          Grouped by the threat or pattern each rule defends against. The full
          per-rule reference — what each rule does, defaults, and prior art —
          lives on the{" "}
          <a
            href="https://pixiebrix.github.io/agent-browser-shield/rules/"
            target="_blank"
            rel="noreferrer"
          >
            Rules reference page
          </a>
          .
        </p>
        <RuleList states={states} availability={availability} />
      </Section>

      <Section id="disclaimer" title="Disclaimer">
        <p className="hint">
          Agent Browser Shield reduces the threats a browser-use agent faces on
          a page, but it can't catch everything. Take precautions when using AI
          agents for browser use. The extension is provided as-is, without
          warranty of any kind.
        </p>
      </Section>

      <footer className="footer">
        <HelpLinks className="footer__links" />
        <div className="footer__copyright">© PixieBrix 2026</div>
      </footer>
    </div>
  );
}

function DisplayModeOption({
  mode,
  current,
  title,
  description,
}: {
  mode: PlaceholderDisplayMode;
  current: PlaceholderDisplayMode;
  title: string;
  description: string;
}) {
  return (
    <label className="radio">
      <input
        type="radio"
        name="placeholder-display-mode"
        value={mode}
        checked={current === mode}
        onChange={() => {
          void placeholderDisplayStorage.set(mode);
        }}
      />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </label>
  );
}
