#!/usr/bin/env bun
// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = resolve(import.meta.dir, "..");
const DIST = join(REPO_ROOT, "extension", "dist");
const DEFAULT_OUTPUT = join(REPO_ROOT, "output", "agent-browser-shield-extension.zip");

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: "string", short: "o" },
    "strip-key": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(
    `Usage: bun run scripts/package-extension.ts [output]\n\n` +
      `Zips extension/dist/ for upload to Browserbase or the Chrome Web Store.\n\n` +
      `Arguments:\n` +
      `  output            Output path. If it's a directory, writes agent-browser-shield-extension.zip inside.\n` +
      `                    Defaults to ${relative(REPO_ROOT, DEFAULT_OUTPUT)}.\n\n` +
      `Options:\n` +
      `  -o, --output      Same as the positional argument.\n` +
      `      --strip-key   Remove the "key" field from manifest.json before zipping.\n` +
      `                    Required for Chrome Web Store uploads.\n` +
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
    return join(abs, "agent-browser-shield-extension.zip");
  }
  return abs.endsWith(".zip") ? abs : `${abs}.zip`;
}

const outputPath = await resolveOutput();
await mkdir(dirname(outputPath), { recursive: true });
await rm(outputPath, { force: true });

// When --strip-key is set, stage dist/ into a temp dir and rewrite manifest.json
// there. Mutating dist/ in place would race with concurrent builds.
let zipRoot = DIST;
let stagedRoot: string | undefined;
if (values["strip-key"]) {
  stagedRoot = await mkdtemp(join(tmpdir(), "abs-package-"));
  await cp(DIST, stagedRoot, { recursive: true });
  const manifestPath = join(stagedRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const hadKey = Object.hasOwn(manifest, "key");
  delete manifest.key;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    hadKey
      ? `Stripped manifest.key for Chrome Web Store compatibility`
      : `manifest.key not present; --strip-key was a no-op`,
  );
  zipRoot = stagedRoot;
}

// `zip -r` from inside the source root so manifest.json sits at the archive
// root, which Browserbase and CWS both require. -x excludes sourcemaps to keep
// the upload small.
const result = await Bun.spawn({
  cmd: ["zip", "-r", "-q", outputPath, ".", "-x", "*.map"],
  cwd: zipRoot,
  stdout: "inherit",
  stderr: "inherit",
}).exited;

if (stagedRoot) {
  await rm(stagedRoot, { recursive: true, force: true });
}

if (result !== 0) {
  console.error(`zip exited with status ${result}`);
  process.exit(result);
}

const size = (await stat(outputPath)).size;
console.log(
  `Packaged extension (${(size / 1024).toFixed(1)} KB) → ${relative(process.cwd(), outputPath)}`,
);
