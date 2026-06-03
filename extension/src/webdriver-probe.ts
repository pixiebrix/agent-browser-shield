// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Build entrypoint for the page-world probe. Registered dynamically by
// the background worker via `chrome.scripting.registerContentScripts`
// with `world: "MAIN"` and `runAt: "document_start"` whenever
// `webdriver-probe-annotate` is enabled. Runs before the page's first
// script so reads issued during initial HTML parse are caught.
//
// Kept tiny on purpose — the bundled output ships into every page-world
// at document_start, so anything imported here lands in the page's JS
// heap. Pull only from `lib/webdriver-probe-source.ts`, which is also
// kept dependency-free.

import { installProbe } from "./lib/webdriver-probe-source";

installProbe.call(globalThis as unknown as Window);
