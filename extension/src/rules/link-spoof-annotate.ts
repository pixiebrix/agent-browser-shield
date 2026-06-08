// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Flag <a> elements whose visible text is visually spoofed relative to
// their navigation target. Three cheap checks; all signal classic
// phishing:
//
//   1. Mixed-script word in visible text. A run of letters that blends
//      Latin with Cyrillic / Greek / Armenian / Cherokee is the
//      signature of letter-substitution homoglyph attacks (one of the
//      letters in a Latin brand name swapped for a confusable from a
//      different script). Real-world domain or brand text is
//      single-script per word; mixed scripts inside one word are
//      essentially never legitimate.
//
//   2. Single-script Latin-mimicking homograph in a visible domain. A
//      domain whose label is drawn entirely from one non-Latin script
//      but whose visual skeleton (via a curated TR39 confusables map)
//      collapses to a pure-Latin string — e.g. fully-Cyrillic
//      "аррӏе.com" skeletons to "apple.com". The intra-word mixed-script
//      check (#1) misses this because there's no Latin letter to be
//      adjacent to. Anchored on domain shape so legitimate prose in
//      non-Latin scripts (Russian, Greek body text) stays untouched.
//
//   3. Visible text contains a fully-formed domain whose registrable
//      identity differs from the link's actual host. Visible candidate
//      and href are both normalized to their punycode form before the
//      PSL comparison, so legitimate IDN links (visible IDN ↔ punycode
//      href) don't surface, while attacker-redirect cases do.
//
// Only useful to visual / accessibility-tree agents. A DOM-walking agent
// already sees the raw text code points and the unrendered href, so the
// asymmetry the attacks exploit doesn't apply — those agents can run
// these checks themselves with no rule involvement. We render the
// warning as a visible inline chip next to the link so a vision model
// picks it up in the screenshot or accessibility tree.
//
// We annotate rather than strip the link: the warning has to sit next
// to the suspicious anchor for context, and removing the anchor removes
// the very thing the user/agent is being asked to evaluate.

import { skeleton } from "../lib/confusables";
import {
  LINK_SPOOF_ANNOTATED_ATTR as FLAGGED_ATTR,
  RULE_ATTR,
} from "../lib/dom-markers";
import { registrableDomain } from "../lib/domain-trust";
import { log } from "../lib/log";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { traceMutation } from "../lib/trace-mutation";
import type { Rule } from "./types";

const RULE_ID = "link-spoof-annotate" as const;
const FLAG_CLASS = "abs-link-spoof-annotate";

// Adjacent letters from different scripts inside a single word. Covers
// the Latin-confusable blocks used in the bulk of homoglyph phishing:
// Greek (U+0370–03FF), Cyrillic (U+0400–04FF), Armenian (U+0530–058F),
// Cherokee (U+13A0–13FF). Word boundaries are implicit — the regex
// requires the two letters to be next to each other, which only happens
// within a single word. A pure-Cyrillic word next to a pure-Latin word
// separated by punctuation or whitespace will not match.
const MIXED_SCRIPT_RE = /[A-Za-z][Ͱ-ϿЀ-ӿ԰-֏Ꭰ-᏿]|[Ͱ-ϿЀ-ӿ԰-֏Ꭰ-᏿][A-Za-z]/u;

// "Looks like a domain" — at least one label followed by a 2+ char TLD.
// Loose on purpose; the apex comparison below decides whether the match
// is actionable. Unicode-aware so visible IDN homographs ("аррӏе.com",
// "президент.рф") are captured for comparison; the punycode-normalized
// PSL check keeps legitimate IDN links from being flagged.
//
// `\b` is ASCII-only in JS regex even under `/u`, so the boundaries use
// explicit lookbehind/lookahead on letter-or-digit classes instead.
const DOMAIN_RE =
  /(?<![\p{L}\p{N}])((?:[\p{L}\p{N}-]{1,63}\.)+[\p{L}]{2,24})(?![\p{L}\p{N}])/u;

export interface SpoofTriggers {
  homoglyphWord: string | null;
  // Latin form a single-script homograph mimics (e.g. "apple.com" for
  // visible "аррӏе.com"). Null when the homoglyph trigger is the
  // intra-word mixed-script regex rather than the skeleton check.
  homoglyphSkeleton: string | null;
  textDomain: string | null;
  hrefHost: string | null;
}

// Normalize a visible-text domain candidate to its ASCII / punycode form
// so the PSL comparison runs on a single representation regardless of
// whether the visible text was Unicode or already ASCII. Falls back to
// the input on URL-parse failure (e.g. invalid characters).
function toPunycodeHost(domain: string): string {
  try {
    return new URL(`https://${domain}/`).hostname;
  } catch {
    return domain;
  }
}

export function detectSpoof(link: HTMLAnchorElement): SpoofTriggers | null {
  const text = link.textContent.trim();
  if (text.length === 0) {
    return null;
  }

  let homoglyphWord = MIXED_SCRIPT_RE.exec(text)?.[0] ?? null;
  let homoglyphSkeleton: string | null = null;

  let textDomain: string | null = null;
  let hrefHost: string | null = null;

  const domainMatch = DOMAIN_RE.exec(text);
  const candidateDomain = domainMatch?.[1];
  if (candidateDomain !== undefined) {
    // Single-script homograph: a Unicode-only domain whose confusables
    // skeleton is pure ASCII Latin. Catches the audit case where every
    // letter is from one non-Latin script (intra-word mixed check #1
    // misses it because there's no Latin letter adjacency). Anchored on
    // (a) confusables-introduced a delta from the input and (b) skeleton
    // being a plausible domain shape, so genuine Russian/Greek prose
    // captured by the relaxed DOMAIN_RE doesn't surface here.
    if (homoglyphWord === null) {
      const skel = skeleton(candidateDomain);
      if (
        skel !== candidateDomain.toLowerCase() &&
        /^[a-z0-9.-]+$/.test(skel)
      ) {
        homoglyphWord = candidateDomain;
        homoglyphSkeleton = skel;
      }
    }

    // Read the raw attribute first so we skip mailto:/tel:/javascript:/
    // fragment-only anchors before parsing — `link.href` would resolve a
    // missing-or-empty attribute against the page URL and give a
    // misleading comparison target.
    const raw = link.getAttribute("href");
    if (raw !== null && /^https?:/i.test(raw)) {
      try {
        const url = new URL(link.href);
        // Punycode both sides before PSL lookup. `url.hostname` is
        // already ASCII (the URL parser handles IDN→Punycode); the
        // visible candidate may be Unicode IDN.
        const textRD = registrableDomain(
          toPunycodeHost(candidateDomain).toLowerCase(),
        );
        const hrefRD = registrableDomain(url.hostname.toLowerCase());
        if (textRD !== null && hrefRD !== null && textRD !== hrefRD) {
          textDomain = candidateDomain.toLowerCase();
          hrefHost = url.hostname.toLowerCase();
        }
      } catch {
        // Unparseable href — nothing to compare against.
      }
    }
  }

  if (homoglyphWord === null && textDomain === null) {
    return null;
  }
  return { homoglyphWord, homoglyphSkeleton, textDomain, hrefHost };
}

function chipText(triggers: SpoofTriggers): string {
  const parts: string[] = [];
  if (triggers.homoglyphWord !== null) {
    if (triggers.homoglyphSkeleton === null) {
      parts.push(`mixed-script word "${triggers.homoglyphWord}"`);
    } else {
      parts.push(
        `homoglyph "${triggers.homoglyphWord}" mimics "${triggers.homoglyphSkeleton}"`,
      );
    }
  }
  if (triggers.textDomain !== null && triggers.hrefHost !== null) {
    parts.push(
      `text shows ${triggers.textDomain} but href points to ${triggers.hrefHost}`,
    );
  }
  return `[abs: link looks spoofed (${parts.join("; ")}) — verify the destination before clicking]`;
}

function flag(link: HTMLAnchorElement, triggers: SpoofTriggers): void {
  if (!link.isConnected || link.hasAttribute(FLAGGED_ATTR)) {
    return;
  }
  // Capture from the parent so the appended chip shows up in the trace's
  // after-snapshot. Falls back to the link itself when detached (rare,
  // skipped above) — the wrapper still records the FLAGGED_ATTR stamp.
  traceMutation(
    {
      ruleId: RULE_ID,
      kind: "flag",
      target: link,
      captureFrom: link.parentElement ?? link,
    },
    () => {
      link.setAttribute(FLAGGED_ATTR, "");

      const chip = document.createElement("span");
      chip.className = FLAG_CLASS;
      chip.setAttribute(RULE_ATTR, RULE_ID);
      // Inline-block so the chip stays on the same baseline as the link
      // in running text, and self-contained inline styling so the
      // warning is visible even on pages that strip extension
      // stylesheets.
      chip.style.display = "inline-block";
      chip.style.margin = "0 0 0 4px";
      chip.style.padding = "0 4px";
      chip.style.border = "1px solid #b00";
      chip.style.background = "#fff5f5";
      chip.style.color = "#900";
      chip.style.font = "11px/1.4 system-ui, sans-serif";
      chip.style.fontStyle = "italic";
      chip.textContent = chipText(triggers);
      link.after(chip);
    },
  );
}

function scanAndFlag(root: ParentNode): void {
  let count = 0;
  for (const node of root.querySelectorAll("a[href]")) {
    const anchor = node as HTMLAnchorElement;
    if (anchor.hasAttribute(FLAGGED_ATTR)) {
      continue;
    }
    const triggers = detectSpoof(anchor);
    if (triggers !== null) {
      flag(anchor, triggers);
      count++;
    }
  }
  if (count > 0) {
    log("link spoofs flagged", { count });
  }
}

const watcher = createSubtreeWatcher({
  skipPlaceholderSubtrees: true,
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndFlag(root);
    }
  },
});

function apply(root: ParentNode): void {
  scanAndFlag(root);
  watcher.start(root);
}

export const linkSpoofAnnotateRule = {
  id: RULE_ID,
  label: "Flag Spoofed Links",
  description:
    "Annotate <a> elements whose visible text either (a) mixes scripts inside a word, (b) uses Cyrillic / Greek / Armenian letters to visually mimic a Latin domain (homograph / IDN spoof), or (c) shows a domain that differs from the link's actual host. Useful for vision-based agents; DOM-walking agents can spot the same discrepancies themselves.",
  apply,
  teardown: () => {
    watcher.stop();
  },
} satisfies Rule;
