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

import { createSelectorHideRule } from "../lib/selector-hide-rule";

const { rule } = createSelectorHideRule({
  id: "chat-widget-hide",
  label: "Remove Chat Widgets",
  description: "Remove live-chat widgets (Intercom, Drift, Zendesk, etc.).",
  removeEntirely: true,
  alwaysOnSelectors: [
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
  ],
  // Chat widgets load via async vendor scripts and inject after document_idle
  // (HubSpot's conversations-embed.js, Intercom's loader, etc.) — re-scan on
  // DOM mutations.
  watchSubtrees: true,
  // The wrapper element (`#intercom-frame`, `#hubspot-messages-iframe-container`,
  // Zendesk's `iframe#launcher`, etc.) always lives on the top frame — the
  // widget's own iframe content is reached by hiding the wrapper, not by
  // descending into it. Running this rule inside vendor iframes would also
  // try to delete the vendor's own UI.
  topFrameOnly: true,
});

export const chatWidgetHideRule = rule;
