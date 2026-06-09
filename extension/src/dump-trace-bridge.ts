// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Build entrypoint for the page-world dump-trace bridge. Registered
// dynamically by the background worker via
// `chrome.scripting.registerContentScripts` with `world: "MAIN"` and
// `runAt: "document_start"` whenever the debug-trace toggle is on.
// Exposes `window.__abs_dumpTrace()` for CDP clients to scrape the
// extension's IndexedDB-backed trace mid-flow.
//
// Kept tiny on purpose — anything imported here ships into every
// page-world heap when the bridge is registered. Pull only from
// `lib/dump-trace-bridge-source.ts`, which is also kept
// dependency-free.

import { installDumpTraceBridge } from "./lib/dump-trace-bridge-source";

installDumpTraceBridge.call(globalThis as unknown as Window);
