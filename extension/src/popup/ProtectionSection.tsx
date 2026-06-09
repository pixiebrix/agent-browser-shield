// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// The unified "turn protection off" card (spec 0010 §"Recovery controls",
// ADR-0018/0019). One bordered card holding a scope ladder of every escape
// hatch, so the four controls read as one family ordered narrow→broad instead
// of four competing cards with mismatched visual weight:
//
//   - "This tab · temporary" (RecoverySection) — the in-the-moment "this page
//     looks broken" escapes: reveal-everything + a tab-scoped snooze. Ephemeral.
//   - "This site · saved" (SiteDisableSection) — the deliberate, persistent
//     per-host denylist entry.
//
// The global Enforcement master switch stays in its own card above this one
// (Popup.tsx); this card only appears while enforcement is on.
//
// Each child keeps its own render-null logic (loading, non-content schemes, a
// denylisted host where there's nothing left to recover). The card itself
// mirrors only the shared loading guard so it never renders as an empty box;
// once the tab URL and denylist have loaded, SiteDisableSection always renders
// at least the disable row, so the card always has content. The row divider is
// a pure CSS adjacent-sibling rule, so it appears only when both rows are present.

import { RecoverySection } from "./RecoverySection";
import { SiteDisableSection } from "./SiteDisableSection";

export function ProtectionSection({
  activeTabId,
  activeTabUrl,
  denylist,
}: {
  activeTabId: number | null;
  activeTabUrl: string | null;
  denylist: string[] | null;
}) {
  if (activeTabUrl === null || denylist === null) {
    return null;
  }
  return (
    <div className="protection">
      <RecoverySection
        activeTabId={activeTabId}
        activeTabUrl={activeTabUrl}
        denylist={denylist}
      />
      <SiteDisableSection activeTabUrl={activeTabUrl} denylist={denylist} />
    </div>
  );
}
