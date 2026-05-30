import { injectOptionsBadge } from "./lib/options-badge";
import { start } from "./lib/rule-engine";

start().catch((error) => {
  console.error("[abs] failed to start rule engine", error);
});

injectOptionsBadge();
