// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Hide live-chat widgets (Intercom, Drift, Zendesk, Crisp, Tawk.to, HubSpot,
// Olark, LiveChat, Freshchat, Zopim). Agents almost never need to interact
// with these and they cost 200–500 tokens per page.
//
// All selectors are vendor-specific (deliberate ids, class prefixes, iframe
// names) so FP risk is near zero — no candidateFilter needed. The bare
// `iframe#launcher` selector is the only one worth note: Zendesk uses
// `<iframe id="launcher">` for the chat bubble, and we narrow to the iframe
// tag so a generic `#launcher` button elsewhere isn't caught.
//
// Implementation: pure CSS injection. Selectors are static and vendor
// id/class only, so an injected stylesheet hides matches as soon as the
// browser parses them — no MutationObserver, no per-batch QSA, and lazily
// injected widgets (HubSpot's conversations-embed.js, Intercom's loader,
// etc.) are hidden at parse time without us doing anything.
//
// Debug-trace coverage: the CSS-first sweep in `rule-count.ts` emits one
// `rule-application` event per matched element when the trace toggle is
// on, flagged with `cssOnly: true`. There's no element-level write to
// wrap with `traceMutation` (the stylesheet hides matches declaratively),
// so `beforeHtml` and `afterHtml` are identical — the value of the event
// is the matched element's outerHTML, which is exactly what a reviewer
// needs to confirm or deny a false-positive report.

import type { HideStylesheet } from "../lib/css-hide-stylesheet";
import { injectHideStylesheet } from "../lib/css-hide-stylesheet";
import { registerCssFirstSelectors } from "../lib/rule-count";
import type { Rule } from "./types";

const RULE_ID = "chat-widget-hide" as const;
const STYLE_ID = "abs-chat-widget-hide";

const SELECTORS: readonly string[] = [
  // Intercom
  "#intercom-frame",
  "#intercom-container",
  ".intercom-launcher",
  'iframe[name^="intercom-"]',
  // Drift
  "#drift-frame-controller",
  "#drift-widget",
  'iframe[id^="drift-frame-"]',
  // Zendesk Web Widget
  "iframe#launcher",
  'iframe[title="Messaging window"]',
  'iframe[name="ze-widget"]',
  // Crisp
  "#crisp-chatbox",
  '[id^="crisp-client"]',
  // Tawk.to
  'iframe[title="chat widget"]',
  'iframe[src*="tawk.to"]',
  // HubSpot
  "#hubspot-messages-iframe-container",
  'iframe[id^="hubspot-conversations"]',
  // Olark
  "#olark-box-wrapper",
  ".olark-launch-button",
  // LiveChat
  'iframe[src*="livechatinc.com"]',
  "#chat-widget-container",
  // Freshchat
  'iframe[id^="fc_frame"]',
  "#freshworks-container",
  // Zopim (legacy Zendesk)
  'iframe[id*="zopim"]',
  ".zopim",
];

const UNION_SELECTOR = SELECTORS.join(",");

let stylesheet: HideStylesheet | null = null;
let unregisterCount: (() => void) | null = null;

export const chatWidgetHideRule = {
  id: RULE_ID,
  label: "Remove Chat Widgets",
  description: "Remove live-chat widgets (Intercom, Drift, Zendesk, etc.).",
  // The wrapper element (`#intercom-frame`, `#hubspot-messages-iframe-container`,
  // Zendesk's `iframe#launcher`, etc.) always lives on the top frame — the
  // widget's own iframe content is reached by hiding the wrapper, not by
  // descending into it. Running this rule inside vendor iframes would also
  // try to delete the vendor's own UI.
  topFrameOnly: true,
  // Param matches `Rule.apply` even though this rule ignores the root (it
  // injects a document-level stylesheet). Without it, `satisfies Rule` would
  // infer `() => void` and callers passing a root would fail to type-check.
  apply(_root: ParentNode) {
    // Idempotent — `injectHideStylesheet` re-uses the existing <style> if
    // it's still connected, and `registerCssFirstSelectors` no-ops on
    // duplicate registration (Set semantics).
    stylesheet ??= injectHideStylesheet({
      elementId: STYLE_ID,
      selectors: SELECTORS,
    });
    unregisterCount ??= registerCssFirstSelectors(RULE_ID, UNION_SELECTOR);
  },
  teardown() {
    stylesheet?.remove();
    stylesheet = null;
    unregisterCount?.();
    unregisterCount = null;
  },
} satisfies Rule;
