// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for `replaceMatchesInTextNode`. The invariants are
// small but easy to break when iterating on the cursor/overlap logic, so we
// fuzz with fast-check rather than enumerating cases by hand.

import fc from "fast-check";

import type { InlineMatch } from "../placeholder";
import { PLACEHOLDER_CLASS, replaceMatchesInTextNode } from "../placeholder";
import type { RuleId } from "../storage";

const RULE_ID = "pii-redact" as RuleId;
const LABEL = "[hidden]";

// Generate a string + a list of disjoint match windows over that string.
// `start` is inside the string, `end` is at most string.length, and each
// match's `start` is >= the previous `end` so they never overlap.
const disjointMatches = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 200 }),
    fc.array(fc.tuple(fc.nat(20), fc.integer({ min: 1, max: 20 })), {
      maxLength: 8,
    }),
  )
  .map(([text, raw]) => {
    const matches: InlineMatch[] = [];
    let cursor = 0;
    for (const [gap, length] of raw) {
      const start = cursor + gap;
      const end = start + length;
      if (end > text.length) {
        break;
      }
      matches.push({ start, end, label: LABEL });
      cursor = end;
    }
    return { text, matches };
  });

function applyToFreshNode(
  text: string,
  matches: InlineMatch[],
): HTMLDivElement {
  const host = document.createElement("div");
  const node = document.createTextNode(text);
  host.append(node);
  replaceMatchesInTextNode(node, matches, RULE_ID);
  return host;
}

describe("replaceMatchesInTextNode (property)", () => {
  it("leaves the text node untouched when there are no matches", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const host = applyToFreshNode(text, []);
        expect(host.childNodes.length).toBe(1);
        expect(host.firstChild?.nodeType).toBe(Node.TEXT_NODE);
        expect(host.textContent).toBe(text);
        expect(host.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
      }),
    );
  });

  it("emits one inline placeholder per disjoint match", () => {
    fc.assert(
      fc.property(disjointMatches, ({ text, matches }) => {
        const host = applyToFreshNode(text, matches);
        const placeholders = host.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
        expect(placeholders).toHaveLength(matches.length);
        for (const placeholder of placeholders) {
          expect(placeholder.textContent).toBe(LABEL);
        }
      }),
    );
  });

  it("preserves non-matched text exactly, in order", () => {
    fc.assert(
      fc.property(disjointMatches, ({ text, matches }) => {
        const host = applyToFreshNode(text, matches);
        // Visible text = original gaps stitched together with LABEL between.
        const expected: string[] = [];
        let cursor = 0;
        for (const match of matches) {
          if (match.start > cursor) {
            expected.push(text.slice(cursor, match.start));
          }
          expected.push(LABEL);
          cursor = match.end;
        }
        if (cursor < text.length) {
          expected.push(text.slice(cursor));
        }
        expect(host.textContent).toBe(expected.join(""));
      }),
    );
  });

  it("restores the original text after every placeholder is revealed", () => {
    fc.assert(
      fc.property(disjointMatches, ({ text, matches }) => {
        const host = applyToFreshNode(text, matches);
        // Revealing replaces the placeholder with its original substring, so
        // iterating over a live NodeList would skip nodes as it shrinks. Snap
        // first, then click each.
        const placeholders = [
          ...host.querySelectorAll<HTMLElement>(`.${PLACEHOLDER_CLASS}`),
        ];
        for (const placeholder of placeholders) {
          placeholder.dispatchEvent(new MouseEvent("click"));
        }
        expect(host.textContent).toBe(text);
        expect(host.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
      }),
    );
  });

  it("drops overlapping matches instead of double-replacing", () => {
    // Hand-built overlap — two windows where the second starts inside the
    // first. The implementation skips by `match.start < cursor`, so only the
    // first should land.
    const text = "abcdefghij";
    const matches: InlineMatch[] = [
      { start: 1, end: 5, label: LABEL },
      { start: 3, end: 7, label: LABEL },
    ];
    const host = applyToFreshNode(text, matches);
    expect(host.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
    expect(host.textContent).toBe(`a${LABEL}fghij`);
  });
});
