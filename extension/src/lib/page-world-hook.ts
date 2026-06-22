// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Generic life-cycle for a page-world (`world: "MAIN"`) script that the
// background worker registers via `chrome.scripting.registerContentScripts`
// at `runAt: "document_start"`. Several features share this exact shape — a
// probe/defense that must wrap a page-world prototype before the page's first
// script runs, gated on a toggle, reconciled register↔unregister as that
// toggle (and global enforcement) change.
//
// The per-feature specifics — script id, bundled file, eligibility predicate,
// whether to inject into same-origin subframes, which storage changes to
// reconcile on — are the config. The
// register/isRegistered/unregister/sync plumbing is here, written once. The
// concrete hooks live in `page-world-hooks.ts`.
//
// `injectPageWorldScript` is the on-demand `executeScript` fallback for the
// already-open tab: dynamic registrations only take effect on subsequent
// navigations, so a rule toggled on mid-session asks the background worker to
// run the install fn against the current tab. The page-world install fn's own
// `__abs_*_installed` guard makes a redundant call a no-op.

import { log } from "./log";

export interface PageWorldHookConfig {
  /** chrome.scripting content-script id; doubles as the unregister key. */
  readonly scriptId: string;
  /** Bundled entrypoint filename registered as the MAIN-world script. */
  readonly scriptFile: string;
  /** Short label used in this hook's log lines. */
  readonly logLabel: string;
  /**
   * Whether to inject into same-origin subframes (`allFrames`). Each
   * feature's config carries the rationale: top-frame-only when the wrap is
   * shared across same-origin frames or only the top frame matters;
   * all-frames when each frame has its own prototype copy to patch.
   */
  readonly allFrames: boolean;
  /** Is the hook eligible to be registered right now? */
  readonly shouldRegister: () => Promise<boolean>;
  /**
   * Storage change-sources that can flip `shouldRegister`'s result. Each is
   * invoked once with a reconcile callback; any return value (e.g. an
   * unsubscribe fn) is ignored — these live for the service worker's lifetime.
   */
  readonly subscribe: ReadonlyArray<(listener: () => void) => unknown>;
}

export interface PageWorldHook {
  /** Reconcile once at startup, then on every subscribed change. */
  start: () => void;
}

export function createPageWorldHook(
  config: PageWorldHookConfig,
): PageWorldHook {
  const { scriptId, scriptFile, logLabel, allFrames, shouldRegister } = config;

  async function isRegistered(): Promise<boolean> {
    try {
      const registered = await chrome.scripting.getRegisteredContentScripts({
        ids: [scriptId],
      });
      return registered.length > 0;
    } catch (error) {
      // getRegisteredContentScripts throws if no script with the id exists
      // in some Chrome versions; treat that as "not registered" rather than
      // a failure mode that prevents registration.
      log.warn(`${logLabel} registration: getRegistered threw`, { error });
      return false;
    }
  }

  async function register(): Promise<void> {
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: scriptId,
          matches: ["<all_urls>"],
          js: [scriptFile],
          runAt: "document_start",
          world: "MAIN",
          allFrames,
          persistAcrossSessions: true,
        },
      ]);
      log.info(`${logLabel} registered at document_start (main world)`);
    } catch (error) {
      log.error(`${logLabel} registration failed`, { error });
    }
  }

  async function unregister(): Promise<void> {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
      log.info(`${logLabel} unregistered`);
    } catch (error) {
      // Unregister fails if the script wasn't registered to begin with;
      // that's a benign state, not a problem.
      log.debug(`${logLabel} unregister no-op`, { error });
    }
  }

  async function sync(): Promise<void> {
    const [target, current] = await Promise.all([
      shouldRegister(),
      isRegistered(),
    ]);
    if (target === current) {
      return;
    }
    await (target ? register : unregister)();
  }

  return {
    start(): void {
      // Initial reconciliation when the service worker spins up — covers both
      // first install and SW restarts on Chrome's idle timer.
      void sync();
      for (const subscribeTo of config.subscribe) {
        subscribeTo(() => {
          void sync();
        });
      }
    },
  };
}

// On-demand `executeScript` fallback that runs `func` in the page world of the
// frame that sent `message`. Used by the `inject-*` dispatch so the tab the
// user was already viewing picks up a freshly-enabled script without a reload.
export function injectPageWorldScript(
  sender: chrome.runtime.MessageSender,
  installFunction: (this: Window) => void,
  messageType: string,
): void {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    return;
  }
  const frameId = sender.frameId;
  // executeScript with world: "MAIN" is exempt from page CSP the same way the
  // registered content script is, so this lands on strict `script-src` origins
  // where an inline-<script> fallback would be blocked. Targeting the sender's
  // specific frameId keeps subframes that already received the registered
  // script from being re-invoked; the install fn's `__abs_*_installed` guard
  // makes a redundant call a no-op in the page world.
  chrome.scripting
    .executeScript({
      target: {
        tabId,
        frameIds: typeof frameId === "number" ? [frameId] : undefined,
      },
      world: "MAIN",
      func: installFunction,
    })
    .catch((error: unknown) => {
      // Restricted URLs (chrome://, Web Store, view-source:, file: when
      // disallowed) reject here. The primary registration silently skips these
      // origins via match-pattern filtering; the fallback swallows it here.
      log.error(`${messageType} executeScript failed`, { error });
    });
}
