// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { readFileSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { generateInjectionPatterns } from "./scripts/build-injection-patterns";
import { generateSiteData } from "./scripts/build-site-data";
import { checkBackgroundPurity } from "./scripts/check-background-purity";
import { loadDefaultOverrides } from "./scripts/load-default-overrides";

const ROOT = import.meta.dir;
const SRC = join(ROOT, "src");
const DATA = join(ROOT, "data");
const ICONS = join(ROOT, "icons");
const DIST = join(ROOT, "dist");

const watch = process.argv.includes("--watch");
const minify = process.env.NODE_ENV === "production";

// Accept `--defaults <path>` or `--defaults=<path>`. CLI flag wins over the
// EXTENSION_DEFAULTS_FILE env var if both are set; behaviour mirrors the
// readEnvValue helper's .env file fallback.
function parseDefaultsFlag(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--defaults") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--defaults requires a path argument");
      }
      return next;
    }
    if (argument?.startsWith("--defaults=")) {
      return argument.slice("--defaults=".length);
    }
  }
  return undefined;
}

function readEnvValue(name: string): string {
  if (process.env[name]) {
    return process.env[name] ?? "";
  }
  for (const candidate of [join(ROOT, ".env"), join(ROOT, "..", ".env")]) {
    let content: string;
    try {
      content = readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const eq = line.indexOf("=");
      if (eq === -1) {
        continue;
      }
      if (line.slice(0, eq).trim() !== name) {
        continue;
      }
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  }
  return "";
}

const OPENAI_API_KEY =
  readEnvValue("OPENAI_API_KEY") || readEnvValue("MODEL_API_KEY");

const defaultsFlagPath = parseDefaultsFlag(process.argv);
const defaultsEnvPath = readEnvValue("EXTENSION_DEFAULTS_FILE");
const defaultsPath = defaultsFlagPath ?? (defaultsEnvPath || undefined);

async function build(): Promise<void> {
  // Regenerate src/rules/site-data.generated.ts from data/sites/*.yaml and
  // src/rules/injection-patterns.generated.ts from data/injection-patterns.yaml.
  // Cheap and idempotent; ensures dev never forgets to rerun codegen.
  generateSiteData();
  generateInjectionPatterns();

  // Resolve the optional --defaults / EXTENSION_DEFAULTS_FILE override
  // against the hand-edited RULE_DEFAULTS so the validator knows the current
  // rule registry.
  const { RULE_DEFAULTS } = await import("./src/rules/rule-metadata");
  const knownRuleIds = Object.keys(RULE_DEFAULTS);
  const overrides = defaultsPath
    ? loadDefaultOverrides({
        path: isAbsolute(defaultsPath)
          ? defaultsPath
          : resolve(process.cwd(), defaultsPath),
        knownRuleIds,
      })
    : { rules: {} };
  if (defaultsPath) {
    const changed =
      Object.keys(overrides.rules).length +
      (overrides.optionsButton === undefined ? 0 : 1) +
      (overrides.runOnInactiveTabs === undefined ? 0 : 1) +
      (overrides.debugTrace === undefined ? 0 : 1);
    console.log(
      `Applying ${changed} build-time default override(s) from ${defaultsPath}.`,
    );
  }

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const result = await Bun.build({
    entrypoints: [
      join(SRC, "content.ts"),
      join(SRC, "popup.tsx"),
      join(SRC, "options.tsx"),
      join(SRC, "background.ts"),
      // Standalone main-world bundle registered by the background worker
      // via chrome.scripting.registerContentScripts when
      // `webdriver-probe-annotate` is enabled. Must build separately so
      // it ships as its own file and can be referenced by name in the
      // registration call. See `lib/webdriver-probe-source.ts` and
      // `lib/webdriver-probe-registration.ts`.
      join(SRC, "webdriver-probe.ts"),
      // Standalone main-world bundle registered by the background worker
      // whenever `checkout-checkbox-sanitize` is enabled. The patched
      // `HTMLInputElement.prototype.checked` setter MUST live in the page
      // world — page scripts (React/Vue reconciles) hit the page's own
      // copy of the prototype, which is distinct from the one the
      // isolated-world content script sees. See
      // `lib/checkout-checkbox-defense-source.ts` and
      // `lib/checkout-checkbox-defense-registration.ts`.
      join(SRC, "checkout-checkbox-defense.ts"),
      // Standalone main-world bundle registered by the background worker
      // whenever `closed-shadow-root-annotate` is enabled. Wraps
      // `Element.prototype.attachShadow` and `setHTMLUnsafe` in the page
      // world so page-script shadow attachments (which never touch the
      // isolated-world copies of those prototypes) emit the events the
      // `closed-shadow-root-annotate` and `shadow-roots` consumers rely
      // on. See `lib/shadow-root-probe-source.ts` and
      // `lib/shadow-root-probe-registration.ts`.
      join(SRC, "shadow-root-probe.ts"),
      // Standalone main-world bundle registered by the background worker
      // whenever the debug-trace toggle is on. Exposes
      // `window.__abs_dumpTrace()` for CDP-driven harnesses to scrape
      // the IDB-backed trace mid-flow via `Runtime.evaluate` without
      // needing the popup's Export button. See
      // `lib/dump-trace-bridge-source.ts` and
      // `lib/dump-trace-bridge-registration.ts`.
      join(SRC, "dump-trace-bridge.ts"),
    ],
    outdir: DIST,
    target: "browser",
    format: "iife",
    minify,
    sourcemap: minify ? "none" : "linked",
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        minify ? "production" : "development",
      ),
      "process.env.OPENAI_API_KEY": JSON.stringify(OPENAI_API_KEY),
      "process.env.HAS_BUILT_IN_OPENAI_KEY": JSON.stringify(
        Boolean(OPENAI_API_KEY),
      ),
      "process.env.EXTENSION_DEFAULT_OVERRIDES": JSON.stringify(
        JSON.stringify(overrides.rules),
      ),
      "process.env.EXTENSION_OPTIONS_BUTTON_DEFAULT": JSON.stringify(
        overrides.optionsButton === undefined
          ? ""
          : String(overrides.optionsButton),
      ),
      "process.env.EXTENSION_RUN_ON_INACTIVE_TABS_DEFAULT": JSON.stringify(
        overrides.runOnInactiveTabs === undefined
          ? ""
          : String(overrides.runOnInactiveTabs),
      ),
      "process.env.EXTENSION_DEBUG_TRACE_DEFAULT": JSON.stringify(
        overrides.debugTrace === undefined ? "" : String(overrides.debugTrace),
      ),
    },
  });

  if (!result.success) {
    for (const message of result.logs) {
      console.error(message);
    }
    throw new Error("Build failed");
  }

  await cp(join(SRC, "manifest.json"), join(DIST, "manifest.json"));
  await cp(join(SRC, "popup.html"), join(DIST, "popup.html"));
  await cp(join(SRC, "options.html"), join(DIST, "options.html"));
  await cp(ICONS, join(DIST, "icons"), {
    recursive: true,
    filter: (src) => !src.endsWith(".svg"),
  });

  // Fails the build if any rule implementation file leaks into the
  // background bundle — the service worker can't execute DOM-touching rule
  // code. See scripts/check-background-purity.ts.
  checkBackgroundPurity();

  console.log(`Built extension to ${DIST}`);
}

await build();

if (watch) {
  const { watch: fsWatch } = await import("node:fs");
  console.log(`Watching ${SRC} and ${DATA} for changes…`);
  let pending = false;
  const trigger = () => {
    if (pending) {
      return;
    }
    pending = true;
    setTimeout(() => {
      pending = false;
      build().catch((error: unknown) => {
        console.error(error);
      });
    }, 50);
  };
  fsWatch(SRC, { recursive: true }, trigger);
  fsWatch(DATA, { recursive: true }, trigger);
}
