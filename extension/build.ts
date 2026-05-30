// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { readFileSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { generateInjectionPatterns } from "./scripts/build-injection-patterns";
import { generateSiteData } from "./scripts/build-site-data";

const ROOT = import.meta.dir;
const SRC = join(ROOT, "src");
const DATA = join(ROOT, "data");
const DIST = join(ROOT, "dist");

const watch = process.argv.includes("--watch");
const minify = process.env.NODE_ENV === "production";

function readEnvValue(name: string): string {
  if (process.env[name]) return process.env[name] ?? "";
  for (const candidate of [join(ROOT, ".env"), join(ROOT, "..", ".env")]) {
    let content: string;
    try {
      content = readFileSync(candidate, "utf-8");
    } catch {
      continue;
    }
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      if (line.slice(0, eq).trim() !== name) continue;
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

async function build(): Promise<void> {
  // Regenerate src/rules/site-data.generated.ts from data/sites/*.yaml and
  // src/rules/injection-patterns.generated.ts from data/injection-patterns.yaml.
  // Cheap and idempotent; ensures dev never forgets to rerun codegen.
  generateSiteData();
  generateInjectionPatterns();

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const result = await Bun.build({
    entrypoints: [
      join(SRC, "content.ts"),
      join(SRC, "popup.tsx"),
      join(SRC, "options.tsx"),
      join(SRC, "background.ts"),
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
  console.log(`Built extension to ${DIST}`);
}

await build();

if (watch) {
  const { watch: fsWatch } = await import("node:fs");
  console.log(`Watching ${SRC} and ${DATA} for changes…`);
  let pending = false;
  const trigger = () => {
    if (pending) return;
    pending = true;
    setTimeout(async () => {
      pending = false;
      try {
        await build();
      } catch (error) {
        console.error(error);
      }
    }, 50);
  };
  fsWatch(SRC, { recursive: true }, trigger);
  fsWatch(DATA, { recursive: true }, trigger);
}
