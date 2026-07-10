// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for `html-comment-strip`. Pins two invariants the
// rule must maintain together:
//
//   1. Any Comment node whose `data` carries injection text is blanked
//      (data === ""), but the node itself stays attached so React 18+
//      Suspense / hydration walks don't `removeChild` a now-missing
//      marker mid-commit.
//
//   2. Any Comment node whose data is a framework marker shape (React
//      Suspense `$` / `/$` / `$?` / `$!`, Vue 3 fragment `[` / `]`) or
//      a short syntactic note (build stamps, TODOs, license headers) is
//      left untouched. This is the regression guard for the original bug
//      class — a future change to INJECTION_PATTERNS that accidentally
//      widened to match `$` would silently reintroduce the navigation
//      crash on every React 18+ app.

import fc from "fast-check";

import { htmlCommentStripRule } from "../html-comment-strip";
import { FIXTURES } from "./injection-fixtures";

const POISONED = fc.constantFrom(
  FIXTURES.IGNORE_HACKED,
  FIXTURES.DISREGARD,
  FIXTURES.DAN,
  FIXTURES.DEV_MODE,
  FIXTURES.NEW_INSTRUCTIONS,
  FIXTURES.OVERRIDE_GUARDRAILS,
  FIXTURES.IGNORE_ALL,
);

const FRAMEWORK_MARKER = fc.constantFrom(
  "$",
  "/$",
  "$?",
  "/$?",
  "$!",
  "/$!",
  "[",
  "]",
  " build: rev 1234 ",
  " TODO: refactor this ",
  " Copyright (c) 2026 Acme Corp. ",
  " /Footer ",
);

const EXCLUDED_PARENT_TAG = fc.constantFrom("script", "style", "noscript");

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  htmlCommentStripRule.teardown();
});

describe("html-comment-strip (property)", () => {
  it("blanks any comment whose data carries injection text", () => {
    fc.assert(
      fc.property(POISONED, (payload) => {
        document.body.replaceChildren();
        const comment = document.createComment(payload);
        document.body.append(comment);

        htmlCommentStripRule.apply(document.body);

        expect(comment.isConnected).toBe(true);
        expect(comment.data).toBe("");
      }),
    );
  });

  it("leaves framework markers and benign comments untouched", () => {
    fc.assert(
      fc.property(FRAMEWORK_MARKER, (data) => {
        document.body.replaceChildren();
        const comment = document.createComment(data);
        document.body.append(comment);

        htmlCommentStripRule.apply(document.body);

        expect(comment.isConnected).toBe(true);
        expect(comment.data).toBe(data);
      }),
    );
  });

  it("preserves comments inside <script>/<style>/<noscript> regardless of payload", () => {
    fc.assert(
      fc.property(POISONED, EXCLUDED_PARENT_TAG, (payload, parentTag) => {
        document.body.innerHTML = `<${parentTag}></${parentTag}>`;
        const parent = document.body.querySelector(parentTag);
        expect(parent).not.toBeNull();
        const comment = document.createComment(payload);
        parent?.append(comment);

        htmlCommentStripRule.apply(document.body);

        expect(comment.isConnected).toBe(true);
        expect(comment.data).toBe(payload);
      }),
    );
  });
});
