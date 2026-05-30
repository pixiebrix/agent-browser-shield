export interface Rule {
  id: string;
  label: string;
  description: string;
  // Initial state on a fresh install. Overridden by anything the user has
  // toggled in the popup/options page.
  defaultEnabled: boolean;
  // When false, the rule is shown in the UI as unavailable: the toggle is
  // disabled and the engine never applies it, regardless of stored state.
  // Use for rules temporarily turned off at the build level (e.g. while the
  // backing capability is offline).
  available?: boolean;
  // Optional note rendered alongside the disabled toggle when `available` is
  // false, explaining why the rule is unavailable.
  unavailableReason?: string;
  // When true, the rule is only applied in the top-level browsing context.
  // Set this for rules whose targets are inherently page-wide (site footer,
  // cookie/newsletter overlays, per-host URL recipes) so they don't fire
  // pointlessly — or, worse, inject duplicate UI — in every same-origin or
  // covered cross-origin iframe.
  topFrameOnly?: boolean;
  apply(root: ParentNode): void;
  // Release any long-lived resources (mutation observers, throttled callbacks,
  // pending timeouts) that `apply` set up. Called by the engine when the rule
  // is disabled.
  teardown?(): void;
}
