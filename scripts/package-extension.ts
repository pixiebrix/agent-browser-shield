#!/usr/bin/env bun
// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DIST = join(REPO_ROOT, "extension", "dist");
const DEFAULT_OUTPUT = join(REPO_ROOT, "output", "extension.zip");

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: "string", short: "o" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(
    `Usage: bun run scripts/package-extension.ts [output]\n\n` +
      `Zips extension/dist/ for upload to Browserbase.\n\n` +
      `Arguments:\n` +
      `  output            Output path. If it's a directory, writes extension.zip inside.\n` +
      `                    Defaults to ${relative(REPO_ROOT, DEFAULT_OUTPUT)}.\n\n` +
      `Options:\n` +
      `  -o, --output      Same as the positional argument.\n` +
      `  -h, --help        Show this help.`,
  );
  process.exit(0);
}

const distInfo = await stat(DIST).catch(() => null);
if (!distInfo?.isDirectory()) {
  console.error(
    `extension/dist not found. Run \`cd extension && bun run build\` first.`,
  );
  process.exit(1);
}

const manifestInfo = await stat(join(DIST, "manifest.json")).catch(() => null);
if (!manifestInfo?.isFile()) {
  console.error(`manifest.json missing from ${DIST}. Rebuild the extension.`);
  process.exit(1);
}

async function resolveOutput(): Promise<string> {
  const raw = values.output ?? positionals[0];
  if (!raw) return DEFAULT_OUTPUT;
  const abs = resolve(process.cwd(), raw);
  const existing = await stat(abs).catch(() => null);
  if (existing?.isDirectory() || raw.endsWith("/")) {
    return join(abs, "extension.zip");
  }
  return abs.endsWith(".zip") ? abs : `${abs}.zip`;
}

const outputPath = await resolveOutput();
await mkdir(dirname(outputPath), { recursive: true });
await rm(outputPath, { force: true });

// `zip -r` from inside DIST so manifest.json sits at the archive root, which
// Browserbase requires. -x excludes sourcemaps to keep the upload small.
const result = await Bun.spawn({
  cmd: ["zip", "-r", "-q", outputPath, ".", "-x", "*.map"],
  cwd: DIST,
  stdout: "inherit",
  stderr: "inherit",
}).exited;

if (result !== 0) {
  console.error(`zip exited with status ${result}`);
  process.exit(result);
}

const size = (await stat(outputPath)).size;
console.log(
  `Packaged extension (${(size / 1024).toFixed(1)} KB) → ${relative(process.cwd(), outputPath)}`,
);
