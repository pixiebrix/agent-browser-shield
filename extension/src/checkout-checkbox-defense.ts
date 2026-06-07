// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Build entrypoint for the page-world (main-world) checkout-checkbox
// defense. Registered dynamically by the background worker via
// `chrome.scripting.registerContentScripts` with `world: "MAIN"` and
// `runAt: "document_start"` whenever `checkout-checkbox-sanitize` is
// enabled. Runs before the page's first script so the patched
// `HTMLInputElement.prototype.checked` setter is in place before any
// React/Vue bundle caches the descriptor.
//
// Kept tiny on purpose — the bundled output ships into every page-world
// at document_start, so anything imported here lands in the page's JS
// heap. Pull only from `lib/checkout-checkbox-defense-source.ts`, which
// is dependency-free for the same reason.

import { installCheckoutCheckboxDefense } from "./lib/checkout-checkbox-defense-source";

installCheckoutCheckboxDefense.call(globalThis as unknown as Window);
