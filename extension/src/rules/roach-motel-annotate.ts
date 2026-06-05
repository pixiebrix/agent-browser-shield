// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Flag pages on hosts documented to make cancellation difficult ("roach
// motel" / "hard to cancel" dark pattern) so the agent has a chance to
// surface the friction to the user BEFORE completing a signup or
// subscription. Two data sources:
//
//   1. Hand-curated YAMLs under extension/data/sites/*.yaml. Each entry
//      carries precise per-host pathnames (signup/subscription/checkout)
//      and rich notes referencing FTC enforcement or consumer-press
//      coverage. Takes precedence on match.
//
//   2. Vendored JustDeleteMe snapshot (justdeleteme.generated.ts), filtered
//      to entries graded `hard` or `impossible`. Used as a fallback when
//      no curated entry matches, gated on a heuristic set of signup-y
//      pathname patterns so the warning only fires where it's actionable.
//      JustDeleteMe is MIT-licensed (Robb Lewis et al.); refresh with
//      `uv run scripts/fetch_justdeleteme.py`.
//
// Heuristic detection beyond these lists (cancel-vs-signup step asymmetry,
// "call to cancel" string scans) is out of scope.
//
// The warning is delivered as a screen-reader-only landmark — same pattern
// as `search-url-helper`. Invisible to sighted users, readable to assistive
// tech and DOM-walking agents. Preserved by `hidden-text-strip` via the
// sr-only class allowlist plus the 1×1 + overflow:hidden inline envelope.

import { URLPattern } from "urlpattern-polyfill";
import type { RuleDetectionMessage } from "../lib/detection-messages";
import { RULE_ATTR } from "../lib/dom-markers";
import { log } from "../lib/log";
import { SR_ONLY_INLINE_STYLE } from "../lib/sr-only";
import type { JustDeleteMeEntry } from "./justdeleteme.generated";
import { JUSTDELETEME_ENTRIES } from "./justdeleteme.generated";
import type { RoachMotelDifficulty } from "./site-data.generated";
import { ROACH_MOTEL_WARNINGS } from "./site-data.generated";
import type { Rule } from "./types";

const RULE_ID = "roach-motel-annotate" as const;

const LANDMARK_SELECTOR = `section[${RULE_ATTR}="${RULE_ID}"]`;

const DIFFICULTY_PHRASE: Record<RoachMotelDifficulty, string> = {
  hard: "hard",
  "very-hard": "very hard",
  impossible: "effectively impossible",
};

// Heuristic: which path shapes look like signup / subscription / checkout
// flows where a roach-motel warning is actionable. Used to gate the JDM
// fallback so it doesn't fire on the homepage, account dashboard, or
// content pages of a listed host. Curated YAMLs author their own
// pathnames and don't go through this filter.
const SIGNUP_PATHNAME_PATTERNS: readonly URLPattern[] = [
  "/signup*",
  "/sign-up*",
  "/sign_up*",
  "/subscribe*",
  "/subscription*",
  "/subscriptions*",
  "/join*",
  "/register*",
  "/registration*",
  "/membership*",
  "/checkout*",
  "/plans*",
  "/pricing*",
  "/billing*",
  "/cart*",
  "/upgrade*",
].map((pathname) => new URLPattern({ pathname }));

// Index JDM entries by canonical hostname for O(1) lookup. Hostnames in
// the generated module are already lowercased and `www.`-stripped, and
// the runtime normalizes location.hostname the same way before lookup.
const JDM_HOSTNAME_INDEX: ReadonlyMap<string, JustDeleteMeEntry> = (() => {
  const map = new Map<string, JustDeleteMeEntry>();
  for (const entry of JUSTDELETEME_ENTRIES) {
    for (const host of entry.hostnames) {
      map.set(host, entry);
    }
  }
  return map;
})();

const JDM_ATTRIBUTION =
  "Source: JustDeleteMe (justdelete.me) — MIT-licensed crowdsourced directory of account-deletion difficulty.";

export interface WarningPayload {
  difficulty: RoachMotelDifficulty;
  cancellationUrl: string | null;
  notes: string | null;
  // Which data source the entry came from. Surfaced to the user in the
  // popup so curated FTC-defendant entries read distinctly from the
  // crowdsourced JustDeleteMe fallback.
  source: "curated" | "justdeleteme";
}

function findCuratedWarning(url: string): WarningPayload | null {
  for (const warning of ROACH_MOTEL_WARNINGS) {
    if (warning.patterns.some((pattern) => pattern.test(url))) {
      return {
        difficulty: warning.difficulty,
        cancellationUrl: warning.cancellationUrl,
        notes: warning.notes,
        source: "curated",
      };
    }
  }
  return null;
}

function normalizeHost(host: string): string {
  const lower = host.toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

function isSignupishPath(pathname: string): boolean {
  return SIGNUP_PATHNAME_PATTERNS.some((pattern) => pattern.test({ pathname }));
}

function findJustDeleteMeWarning(url: string): WarningPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const entry = JDM_HOSTNAME_INDEX.get(normalizeHost(parsed.hostname));
  if (entry === undefined) {
    return null;
  }
  if (!isSignupishPath(parsed.pathname)) {
    return null;
  }
  const noteLines: string[] = [];
  if (entry.notes !== null) {
    noteLines.push(entry.notes);
  }
  noteLines.push(JDM_ATTRIBUTION);
  return {
    difficulty: entry.difficulty,
    cancellationUrl: entry.cancellationUrl,
    notes: noteLines.join("\n"),
    source: "justdeleteme",
  };
}

export function findWarning(url: string): WarningPayload | null {
  return findCuratedWarning(url) ?? findJustDeleteMeWarning(url);
}

function buildNoteText(host: string, warning: WarningPayload): string {
  // Composable template — every variable resolves from runtime intent
  // (`host` from location.hostname) or the matched warning entry. Lines
  // for absent optional fields are dropped so the note stays compact.
  const lines = [
    `abs roach-motel notice for ${host} — this site is documented to make cancellation difficult.`,
    `Cancellation difficulty: ${DIFFICULTY_PHRASE[warning.difficulty]}.`,
  ];
  if (warning.cancellationUrl !== null) {
    lines.push(`Cancel/delete account: ${warning.cancellationUrl}`);
  }
  if (warning.notes !== null) {
    lines.push(warning.notes);
  }
  return lines.join("\n");
}

function buildLandmark(host: string, warning: WarningPayload): HTMLElement {
  const note = document.createElement("section");
  note.setAttribute("role", "note");
  note.setAttribute("aria-label", "abs roach-motel notice");
  note.setAttribute(RULE_ATTR, RULE_ID);
  // Class-based preservation signal for hidden-text-strip; the inline
  // envelope below is the structural fallback. Either signal alone is
  // enough; both together survive future tightening of the allowlist.
  note.className = "sr-only";
  Object.assign(note.style, SR_ONLY_INLINE_STYLE);
  note.textContent = buildNoteText(host, warning);
  return note;
}

function apply(_root: ParentNode): void {
  const warning = findWarning(globalThis.location.href);
  if (warning === null) {
    return;
  }
  // Idempotent: a previous apply (initial pass, re-enable from the
  // options page) may already have inserted the landmark.
  if (document.querySelector(LANDMARK_SELECTOR)) {
    return;
  }
  // Inject at body level (regardless of which subtree root was passed)
  // so the landmark is the first element of <body> at the top of the
  // a11y tree.
  document.body.prepend(buildLandmark(globalThis.location.hostname, warning));
  log("roach-motel-annotate applied", {
    host: globalThis.location.hostname,
    difficulty: warning.difficulty,
  });
  // Tell the background so the popup can render a human-visible entry
  // for this tab. The line-181 landmark short-circuit already guarantees
  // we only get here once per document. Service worker may be asleep —
  // swallow the rejection per the rule-count.ts pattern.
  const message: RuleDetectionMessage = {
    type: "rule-detection",
    payload: {
      kind: "roach-motel",
      host: globalThis.location.hostname,
      url: globalThis.location.href,
      difficulty: warning.difficulty,
      cancellationUrl: warning.cancellationUrl,
      source: warning.source,
    },
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // noop
  });
}

function teardown(): void {
  for (const node of document.querySelectorAll(LANDMARK_SELECTOR)) {
    node.remove();
  }
}

export const roachMotelAnnotateRule = {
  id: RULE_ID,
  label: "Flag Roach-Motel Sign-Ups",
  description:
    "On signup/subscription pages of sites documented to make cancellation difficult, embed a screen-reader-only notice so agents can surface the cancellation difficulty before completing signup. Sources: hand-curated FTC-defendant list and the JustDeleteMe (MIT-licensed) directory.",
  // The notice describes the top-level page the agent is committing to —
  // injecting it into every same-origin iframe would pollute their a11y
  // trees with off-topic warnings.
  topFrameOnly: true,
  apply,
  teardown,
} satisfies Rule;
