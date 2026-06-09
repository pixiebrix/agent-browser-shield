// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Schema-conformance check for the popup's JSONL export. Reads the same
// `extension/data/debug-trace.schema.json` the README/docs link to and
// validates every line `buildJsonl` emits with @cfworker/json-schema. If a
// field is added to a `DebugTraceEntry` variant (or the wrapper) without a
// corresponding schema bump, the existing fixture covers the existing
// variants and the new field would either be flagged by `additionalProperties:
// false` or land here as a fixture omission.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Validator } from "@cfworker/json-schema";
import { buildJsonl, toExportedRecord } from "../debug-trace-export";
import type { DebugTraceStoredEntry } from "../detection-messages";

const schema = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "..", "data", "debug-trace.schema.json"),
    "utf8",
  ),
) as Record<string, unknown>;

const validator = new Validator(schema, "2020-12");

function expectValid(line: string): void {
  const parsed: unknown = JSON.parse(line);
  const result = validator.validate(parsed);
  if (!result.valid) {
    throw new Error(
      `JSONL line did not match schema:\n${line}\nerrors: ${JSON.stringify(
        result.errors,
        null,
        2,
      )}`,
    );
  }
}

// One stored record per entry variant the recorder can emit. Mirrors the
// shapes in `lib/debug-trace.ts` (segment, rule-application) and the
// background's navigation marker.
function fixtures(): DebugTraceStoredEntry[] {
  return [
    {
      tabId: 42,
      frameId: 0,
      addedAt: 1_700_000_000_000,
      entry: {
        type: "segment",
        segmentId: 1,
        kind: "initial-load",
        timestamp: 1_700_000_000_000,
        meta: { url: "https://example.com/" },
      },
    },
    {
      tabId: 42,
      frameId: 0,
      addedAt: 1_700_000_000_100,
      entry: {
        type: "rule-application",
        segmentId: 1,
        ruleId: "hidden-affiliate-sanitize",
        kind: "sanitize",
        timestamp: 1_700_000_000_100,
        selector: "a.ref-link",
        beforeHtml:
          "<a class='ref-link' href='https://aff.example/?ref=x'>x</a>",
        afterHtml: "<a class='ref-link' href='https://aff.example/'>x</a>",
      },
    },
    {
      tabId: 42,
      frameId: 7,
      addedAt: 1_700_000_000_200,
      entry: {
        type: "rule-application",
        segmentId: 2,
        ruleId: "pii-mask",
        kind: "mask",
        timestamp: 1_700_000_000_200,
        selector: "span.email",
        beforeHtml: "",
        afterHtml: "<span class='abs-placeholder' />",
        beforeText: "alice@example.com",
      },
    },
    {
      tabId: 42,
      frameId: 0,
      addedAt: 1_700_000_000_300,
      entry: {
        type: "rule-application",
        segmentId: 2,
        ruleId: "tracker-hide",
        kind: "hide",
        timestamp: 1_700_000_000_300,
        selector: ".tracker-pixel",
        beforeHtml: "<img class='tracker-pixel' />",
        afterHtml: "<img class='tracker-pixel' />",
        cssOnly: true,
      },
    },
    {
      tabId: 42,
      frameId: 0,
      addedAt: 1_700_000_000_400,
      entry: {
        type: "navigation",
        url: "https://example.com/next",
        timestamp: 1_700_000_000_400,
      },
    },
    {
      tabId: 42,
      frameId: 0,
      addedAt: 1_700_000_000_500,
      entry: {
        type: "navigation",
        url: null,
        timestamp: 1_700_000_000_500,
      },
    },
  ];
}

function firstFixture(): DebugTraceStoredEntry {
  const [first, ...rest] = fixtures();
  if (!first) {
    throw new Error("fixtures() must return at least one record");
  }
  void rest;
  return first;
}

describe("debug-trace JSONL export", () => {
  it("flattens stored records into entry + tabId + frameId", () => {
    const stored = firstFixture();
    const exported = toExportedRecord(stored);
    expect(exported).toEqual({
      ...stored.entry,
      tabId: stored.tabId,
      frameId: stored.frameId,
    });
    expect(exported).not.toHaveProperty("addedAt");
    expect(exported).not.toHaveProperty("entry");
  });

  it("produces one JSON-encoded record per line", () => {
    const stored = fixtures();
    const jsonl = buildJsonl(stored);
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(stored.length);
    // No trailing newline — splitting again must not yield empties.
    expect(lines.at(-1)).not.toBe("");
  });

  it("every line validates against extension/data/debug-trace.schema.json", () => {
    const jsonl = buildJsonl(fixtures());
    for (const line of jsonl.split("\n")) {
      expectValid(line);
    }
  });

  it("rejects a line that drops tabId (schema is load-bearing)", () => {
    // Smoke test that the validator actually rejects something — if it
    // accepted everything, the schema test would silently pass even on a
    // shape regression. Construct a payload missing `tabId` and assert
    // the validator catches it.
    const { tabId: _tabId, ...withoutTabId } = toExportedRecord(firstFixture());
    const result = validator.validate(withoutTabId);
    expect(result.valid).toBe(false);
  });
});
