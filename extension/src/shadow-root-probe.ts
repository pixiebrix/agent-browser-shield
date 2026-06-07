// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Build entrypoint for the page-world shadow-root probe. Registered
// dynamically by the background worker via
// `chrome.scripting.registerContentScripts` with `world: "MAIN"` and
// `runAt: "document_start"` whenever `closed-shadow-root-annotate` is
// enabled. Runs before the page's first script so the wraps over
// `Element.prototype.attachShadow` and `setHTMLUnsafe` land before any
// framework bundle caches the descriptors.
//
// Kept tiny on purpose — the bundled output ships into every page-world
// at document_start, so anything imported here lands in the page's JS
// heap. Pull only from `lib/shadow-root-probe-source.ts`, which is
// dependency-free for the same reason.

import { installShadowRootProbe } from "./lib/shadow-root-probe-source";

installShadowRootProbe.call(globalThis as unknown as Window);
