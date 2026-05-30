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
  apply(root: ParentNode): void;
  // Release any long-lived resources (mutation observers, throttled callbacks,
  // pending timeouts) that `apply` set up. Called by the engine when the rule
  // is disabled.
  teardown?(): void;
}
