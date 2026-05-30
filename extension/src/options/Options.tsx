// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";
import { getUserApiKey, setUserApiKey } from "../lib/api-key-storage";
import {
  getPlaceholderDisplayMode,
  type PlaceholderDisplayMode,
  setPlaceholderDisplayMode,
  subscribePlaceholderDisplayMode,
} from "../lib/placeholder-display";
import {
  getRuleStates,
  RULE_IDS,
  type RuleId,
  type RuleStates,
  setAllRuleStates,
  setRuleEnabled,
  subscribe,
} from "../lib/storage";
import { RULES } from "../rules";

const HAS_BUILT_IN_OPENAI_KEY = process.env.HAS_BUILT_IN_OPENAI_KEY === "true";

const RULE_ID_SET = new Set<string>(RULE_IDS);

type ParseResult =
  | { ok: true; value: Partial<RuleStates> }
  | { ok: false; error: string };

function parseConfig(input: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Invalid JSON: ${message}` };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "Expected a JSON object mapping rule IDs to booleans.",
    };
  }

  const errors: string[] = [];
  const result: Partial<RuleStates> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!RULE_ID_SET.has(key)) {
      errors.push(`Unknown rule: ${key}`);
      continue;
    }
    if (typeof value !== "boolean") {
      errors.push(`Non-boolean value for ${key}: ${typeof value}`);
      continue;
    }
    result[key as RuleId] = value;
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join("\n") };
  }
  return { ok: true, value: result };
}

export function Options() {
  const [states, setStates] = useState<RuleStates | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<PlaceholderDisplayMode | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    getRuleStates().then((initial) => {
      if (!cancelled) setStates(initial);
    });
    getUserApiKey().then((key) => {
      if (!cancelled) setApiKeyDraft(key);
    });
    getPlaceholderDisplayMode().then((mode) => {
      if (!cancelled) setDisplayMode(mode);
    });
    const unsubscribe = subscribe((next) => {
      setStates(next);
    });
    const unsubscribeMode = subscribePlaceholderDisplayMode((mode) => {
      setDisplayMode(mode);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeMode();
    };
  }, []);

  if (!states) {
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
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleApply = async () => {
    const result = parseConfig(draft);
    if (!result.ok) {
      setError(result.error);
      setStatus(null);
      return;
    }
    setError(null);
    await setAllRuleStates(result.value);
    setStatus("Applied");
    setTimeout(() => setStatus(null), 1500);
  };

  const handleSaveApiKey = async () => {
    await setUserApiKey(apiKeyDraft.trim());
    setApiKeyStatus("Saved");
    setTimeout(() => setApiKeyStatus(null), 1500);
  };

  const handleDisplayModeChange = (mode: PlaceholderDisplayMode) => {
    setDisplayMode(mode);
    void setPlaceholderDisplayMode(mode);
  };

  return (
    <div className="options">
      <h1>Agent Browser Shield — Options</h1>

      <nav className="toc" aria-label="Sections">
        <a href="#apply">Apply configuration</a>
        <a href="#export">Export configuration</a>
        <a href="#display">Placeholder display</a>
        <a href="#api-key">OpenAI API key</a>
        <a href="#rules">Rules</a>
      </nav>

      <section id="apply" className="section">
        <h2>
          <a
            href="#apply"
            className="anchor"
            aria-label="Link to Apply configuration"
          >
            #
          </a>
          Apply configuration
        </h2>
        <p className="hint">
          Paste a JSON object mapping rule IDs to booleans, then click Apply.
          Replaces the full configuration: any rule not listed resets to its
          default (enabled). Unknown keys and non-boolean values are rejected.
        </p>
        <textarea
          className="json-input"
          rows={12}
          spellCheck={false}
          placeholder='{"ads-hide": false, "pii-mask": true}'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="button-row">
          <button type="button" onClick={handleApply}>
            Apply
          </button>
        </div>
      </section>

      <section id="export" className="section">
        <h2>
          <a
            href="#export"
            className="anchor"
            aria-label="Link to Export configuration"
          >
            #
          </a>
          Export configuration
        </h2>
        <p className="hint">Download the current rule state as a JSON file.</p>
        <div className="button-row">
          <button type="button" className="secondary" onClick={handleExport}>
            Export JSON
          </button>
        </div>
      </section>

      <section id="display" className="section">
        <h2>
          <a
            href="#display"
            className="anchor"
            aria-label="Link to Placeholder display"
          >
            #
          </a>
          Placeholder display
        </h2>
        <p className="hint">
          How the reveal control on each placeholder is rendered. The
          descriptive label (e.g., what kind of content was hidden) is always
          exposed to screen readers and agents via <code>aria-label</code>.
        </p>
        <fieldset className="radio-group">
          <legend className="visually-hidden">Reveal control style</legend>
          <label className="radio">
            <input
              type="radio"
              name="placeholder-display-mode"
              value="icon"
              checked={displayMode === "icon"}
              disabled={displayMode === null}
              onChange={() => handleDisplayModeChange("icon")}
            />
            <div>
              <strong>Icon only</strong>
              <p>
                Compact shield icon. Best when placeholders would otherwise grow
                larger than the content they replace.
              </p>
            </div>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="placeholder-display-mode"
              value="button"
              checked={displayMode === "button"}
              disabled={displayMode === null}
              onChange={() => handleDisplayModeChange("button")}
            />
            <div>
              <strong>Button with label</strong>
              <p>
                Shield icon plus a visible label describing what was hidden.
                Larger, but visually self-explanatory.
              </p>
            </div>
          </label>
        </fieldset>
      </section>

      <section id="api-key" className="section section--unavailable">
        <h2>
          <a
            href="#api-key"
            className="anchor"
            aria-label="Link to OpenAI API key"
          >
            #
          </a>
          OpenAI API key <span className="badge">Unavailable</span>
        </h2>
        <p className="hint">
          Used by the <code>irrelevant-sections-hide</code> rule, which is
          currently turned off in this build. Saving a key has no effect until
          that rule is re-enabled.{" "}
          {HAS_BUILT_IN_OPENAI_KEY
            ? "A built-in key is bundled with this build."
            : "No built-in key is bundled with this build."}
        </p>
        <input
          type="password"
          className="api-key-input"
          autoComplete="off"
          spellCheck={false}
          disabled
          placeholder={
            HAS_BUILT_IN_OPENAI_KEY ? "(blank — using built-in key)" : "sk-..."
          }
          value={apiKeyDraft}
          onChange={(event) => setApiKeyDraft(event.target.value)}
        />
        <div className="button-row">
          <button type="button" onClick={handleSaveApiKey} disabled>
            Save key
          </button>
          {apiKeyStatus && (
            <span className="status" role="status">
              {apiKeyStatus}
            </span>
          )}
        </div>
      </section>

      <section id="rules" className="section">
        <h2>
          <a href="#rules" className="anchor" aria-label="Link to Rules">
            #
          </a>
          Rules
        </h2>
        <ul className="rules">
          {RULES.map((rule) => {
            const unavailable = rule.available === false;
            return (
              <li
                key={rule.id}
                className={unavailable ? "rule rule--unavailable" : "rule"}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={unavailable ? false : states[rule.id]}
                    disabled={unavailable}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setStates((prev) =>
                        prev ? { ...prev, [rule.id]: enabled } : prev,
                      );
                      void setRuleEnabled(rule.id, enabled);
                    }}
                  />
                  <div>
                    <strong>
                      {rule.label}
                      {unavailable && (
                        <span className="badge">Unavailable</span>
                      )}
                    </strong>
                    {unavailable && rule.unavailableReason && (
                      <p className="unavailable-reason">
                        {rule.unavailableReason}
                      </p>
                    )}
                    <p>{rule.description}</p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="footer">© PixieBrix 2026</footer>
    </div>
  );
}
