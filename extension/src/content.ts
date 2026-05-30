import { isTopFrame } from "./lib/frame";
import { injectOptionsBadge } from "./lib/options-badge";
import { start } from "./lib/rule-engine";

// Content script runs in every frame (`all_frames: true`). The rule engine
// applies frame-appropriate rules in each; the badge is a single UI affordance
// that belongs only on the top frame so the user doesn't get one per iframe.
start().catch((error) => {
  console.error("[abs] failed to start rule engine", error);
});

if (isTopFrame()) {
  injectOptionsBadge();
}
