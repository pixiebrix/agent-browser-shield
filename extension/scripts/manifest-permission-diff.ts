// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Surfaces changes to the high-risk surface of manifest.json on PRs:
// `permissions`, `host_permissions`, and `content_scripts[*].matches`. Prints
// a markdown summary to stdout when any of these fields changed and exits 0;
// prints nothing when they're unchanged. The CI workflow at
// .github/workflows/manifest-permission-diff.yml posts the output as a sticky
// PR comment so reviewers always see permission deltas — silent broadening is
// the most common AI-maintenance failure mode for an extension.

import { readFileSync } from "node:fs";

interface ContentScriptEntry {
  matches?: string[];
}

interface Manifest {
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: ContentScriptEntry[];
}

function loadManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function flattenContentScriptMatches(manifest: Manifest): string[] {
  const out: string[] = [];
  for (const entry of manifest.content_scripts ?? []) {
    for (const match of entry.matches ?? []) {
      out.push(match);
    }
  }
  return out;
}

interface Delta {
  added: string[];
  removed: string[];
}

function delta(before: readonly string[], after: readonly string[]): Delta {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: [...afterSet].filter((value) => !beforeSet.has(value)).toSorted(),
    removed: [...beforeSet].filter((value) => !afterSet.has(value)).toSorted(),
  };
}

function renderSection(title: string, d: Delta): string | null {
  if (d.added.length === 0 && d.removed.length === 0) {
    return null;
  }
  const lines = [`### ${title}`, ""];
  for (const value of d.added) {
    lines.push(`+ \`${value}\``);
  }
  for (const value of d.removed) {
    lines.push(`- \`${value}\``);
  }
  return `${lines.join("\n")}\n`;
}

const [basePath, headPath] = process.argv.slice(2);
if (!basePath || !headPath) {
  console.error(
    "usage: manifest-permission-diff.ts <base-manifest.json> <head-manifest.json>",
  );
  process.exit(2);
}

const base = loadManifest(basePath);
const head = loadManifest(headPath);

const sections = [
  renderSection(
    "permissions",
    delta(base.permissions ?? [], head.permissions ?? []),
  ),
  renderSection(
    "host_permissions",
    delta(base.host_permissions ?? [], head.host_permissions ?? []),
  ),
  renderSection(
    "content_scripts matches",
    delta(flattenContentScriptMatches(base), flattenContentScriptMatches(head)),
  ),
].filter((section): section is string => section !== null);

if (sections.length === 0) {
  process.exit(0);
}

const body = [
  "## Manifest permission diff",
  "",
  "The extension's MV3 permission surface changed in this PR. Reviewer: confirm each addition is intentional and necessary.",
  "",
  ...sections,
].join("\n");

console.log(body);
