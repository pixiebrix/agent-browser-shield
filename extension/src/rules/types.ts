// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

export interface AvailabilitySnapshot {
  available: boolean;
  // Optional human-readable explanation rendered alongside the disabled toggle
  // in the popup/options when `available` is false.
  reason?: string;
}

// Reactive availability accessor. Use when a rule's availability depends on
// runtime state that can change after install (e.g. user-supplied credentials
// in storage). The popup, options page, and rule engine call `get()` to read
// the current snapshot and `subscribe()` to refresh when the underlying state
// changes.
export interface RuleAvailability {
  get: () => Promise<AvailabilitySnapshot>;
  subscribe: (listener: () => void) => () => void;
}

export interface Rule {
  id: string;
  label: string;
  description: string;
  // Initial state on a fresh install. Overridden by anything the user has
  // toggled in the popup/options page.
  defaultEnabled: boolean;
  // - omitted / `true` — always available
  // - `false` — statically unavailable (e.g. backing capability turned off at
  //   build time); pair with `unavailableReason` for the UI
  // - `RuleAvailability` — reactive accessor for runtime-dependent rules. The
  //   snapshot's own `reason` takes precedence over `unavailableReason`.
  available?: boolean | RuleAvailability;
  unavailableReason?: string;
  // When true, the rule is only applied in the top-level browsing context.
  // Set this for rules whose targets are inherently page-wide (site footer,
  // cookie/newsletter overlays, per-host URL recipes) so they don't fire
  // pointlessly — or, worse, inject duplicate UI — in every same-origin or
  // covered cross-origin iframe.
  topFrameOnly?: boolean;
  apply: (root: ParentNode) => void;
  // Release any long-lived resources (mutation observers, throttled callbacks,
  // pending timeouts) that `apply` set up. Called by the engine when the rule
  // is disabled.
  teardown?: () => void;
}
