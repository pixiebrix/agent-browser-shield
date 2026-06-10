// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// The concrete page-world hook table: every `world: "MAIN"` script the
// background worker registers at `document_start`, expressed as one config
// object over the shared `createPageWorldHook` life-cycle (see
// `page-world-hook.ts`). Adding a fifth page-world hook is one entry here
// (plus its `*-source.ts`, its thin entry file, and the manifest), not a new
// register/unregister/sync module and a hand-written `inject-*` handler.
//
// Each hook runs before the page's first script so its prototype wrap lands
// before any framework bundle caches the descriptor. When the gating toggle
// turns off (or, for the rule-gated hooks, global enforcement turns off) the
// registration is removed so future navigations get a clean prototype.
// Already-loaded tabs keep whatever wrap they had until the user reloads —
// same constraint as static content_scripts. The `inject` fallback covers the
// already-open tab for the three rule-gated hooks (see `injectPageWorldScript`).

import type { RuleId } from "../rules/rule-metadata";
import { installCheckoutCheckboxDefense } from "./checkout-checkbox-defense-source";
import { debugTraceStorage } from "./debug-trace";
import {
  getEnforcementEnabled,
  subscribeEnforcementEnabled,
} from "./enforcement";
import type { PageWorldInjectType } from "./messenger";
import type { PageWorldHookConfig } from "./page-world-hook";
import { createPageWorldHook, injectPageWorldScript } from "./page-world-hook";
import { installShadowRootProbe } from "./shadow-root-probe-source";
import { getRuleStates, subscribe } from "./storage";
import { installProbe } from "./webdriver-probe-source";

// Eligibility shared by the three rule-gated hooks: the rule is enabled AND
// global enforcement is on. (The dump-trace bridge gates on its own debug
// toggle, independent of enforcement.)
function ruleEnabledAndEnforced(ruleId: RuleId): () => Promise<boolean> {
  return async () => {
    const [states, enforcementEnabled] = await Promise.all([
      getRuleStates(),
      getEnforcementEnabled(),
    ]);
    return enforcementEnabled && states[ruleId];
  };
}

// The rule-gated hooks all reconcile on rule-state and enforcement changes.
const RULE_SUBSCRIPTIONS = [subscribe, subscribeEnforcementEnabled];

interface PageWorldHookEntry extends PageWorldHookConfig {
  /**
   * Optional on-demand fallback: the page-world inject the rule's `apply`
   * requests (via `requestPageWorldInject`) so the already-open tab picks up
   * the script without a reload. Absent for the dump-trace bridge, whose trace
   * recorder also only starts collecting on the next navigation, so a reload is
   * already implied.
   */
  readonly inject?: {
    readonly injectType: PageWorldInjectType;
    readonly installFn: (this: Window) => void;
  };
}

export const PAGE_WORLD_HOOKS: readonly PageWorldHookEntry[] = [
  {
    scriptId: "webdriver-probe-annotate-main-world",
    scriptFile: "webdriver-probe.js",
    logLabel: "webdriver-probe",
    // Top frame only: the rule wraps Navigator.prototype on the top-level
    // document. Same-origin iframes share the prototype so they inherit the
    // wrap; cross-origin frames have their own Navigator and aren't reachable
    // from a top-frame-only rule.
    allFrames: false,
    shouldRegister: ruleEnabledAndEnforced("webdriver-probe-annotate"),
    subscribe: RULE_SUBSCRIPTIONS,
    inject: {
      injectType: "webdriver-probe",
      installFn: installProbe,
    },
  },
  {
    scriptId: "checkout-checkbox-sanitize-main-world",
    scriptFile: "checkout-checkbox-defense.js",
    logLabel: "checkout-checkbox-defense",
    // allFrames: cart/checkout flows often render the payment widget in a
    // same-origin iframe (Stripe Checkout's embedded mode, shop-hosted
    // express-pay drawers). Same-origin iframes have their own
    // HTMLInputElement.prototype, so the wrap has to run per-frame. Cross-origin
    // iframes get the patch too but their own document.location gates it via
    // isCheckoutHref.
    allFrames: true,
    shouldRegister: ruleEnabledAndEnforced("checkout-checkbox-sanitize"),
    subscribe: RULE_SUBSCRIPTIONS,
    inject: {
      injectType: "checkout-checkbox-defense",
      installFn: installCheckoutCheckboxDefense,
    },
  },
  {
    scriptId: "closed-shadow-root-annotate-main-world",
    scriptFile: "shadow-root-probe.js",
    logLabel: "shadow-root-probe",
    // allFrames: shadow roots attach inside any frame, and each frame has its
    // own copy of Element.prototype / ShadowRoot.prototype. Without per-frame
    // injection, attachments in same-origin subframes would still bypass the
    // probe.
    allFrames: true,
    shouldRegister: ruleEnabledAndEnforced("closed-shadow-root-annotate"),
    subscribe: RULE_SUBSCRIPTIONS,
    inject: {
      injectType: "shadow-root-probe",
      installFn: installShadowRootProbe,
    },
  },
  {
    scriptId: "dump-trace-bridge-main-world",
    scriptFile: "dump-trace-bridge.js",
    logLabel: "dump-trace-bridge",
    // Top frame only — the isolated-world content-bridge only starts inside
    // `isTopFrame()` and `getEventsForTab` returns every frame's entries for
    // the tab, so a CDP caller asking from the top gets the full picture
    // without sub-frame bridges.
    allFrames: false,
    // Gated on the debug-trace toggle (same one that gates emission in
    // `lib/debug-trace.ts`), independent of rule state and enforcement.
    shouldRegister: () => debugTraceStorage.get(),
    subscribe: [debugTraceStorage.subscribe],
    // No `inject` fallback — see PageWorldHookEntry.inject.
  },
];

const hooks = PAGE_WORLD_HOOKS.map((entry) => createPageWorldHook(entry));

const injectorsByType = new Map(
  PAGE_WORLD_HOOKS.flatMap((entry) =>
    entry.inject ? [[entry.inject.injectType, entry.inject] as const] : [],
  ),
);

// Start every page-world hook's register/unregister life-cycle. Called once
// from background.ts at service-worker startup.
export function startPageWorldHooks(): void {
  for (const hook of hooks) {
    hook.start();
  }
}

// Route a validated page-world inject request to its installer. The background
// only calls this after `injectTypeSchema` has confirmed `injectType` is one of
// the known kinds, so an unrecognized value here is a programming error, not
// untrusted input — it returns false and is otherwise a no-op.
export function dispatchPageWorldInject(
  injectType: PageWorldInjectType,
  sender: chrome.runtime.MessageSender,
): boolean {
  const injector = injectorsByType.get(injectType);
  if (!injector) {
    return false;
  }
  injectPageWorldScript(sender, injector.installFn, injector.injectType);
  return true;
}
