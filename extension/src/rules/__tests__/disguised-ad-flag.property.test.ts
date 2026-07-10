// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for disguised-ad-flag. fast-check explores the
// boundary case the feed-wrapper guard is supposed to enforce:
//   - a wrapper containing N >= 2 labeled card-shaped descendants must
//     never itself be replaced as one placeholder. Each card gets its
//     own placeholder; the wrapper survives.
// This is the invariant violated by #228 — entire reddit feed replaced
// as a single placeholder.

import fc from "fast-check";

import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { disguisedAdFlagRule } from "../disguised-ad-flag";

const LABEL_PHRASES = [
  "Sponsored",
  "Promoted",
  "Advertorial",
  "Paid Post",
  "Branded Content",
  "[Ad]",
  "(promoted)",
] as const;

afterEach(() => {
  disguisedAdFlagRule.teardown();
  document.body.replaceChildren();
});

function buildFeed(
  cardCount: number,
  labelText: string,
  headlessCount: number,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.dataset.fixture = "feed";
  for (let i = 0; i < cardCount; i++) {
    const card = document.createElement("article");
    card.dataset.fixture = `card-${i}`;
    const heading =
      i < headlessCount ? "" : `<h2><a href="/${i}">Title ${i}</a></h2>`;
    card.innerHTML = `
      <span class="label">${labelText}</span>
      ${heading}
      <img alt="" src="/${i}.jpg" />
      <a href="/${i}">Visit</a>
      <p>Body copy for card ${i} that exceeds the eighty-character prose minimum the disguised-ad-flag rule applies to article-shape candidates.</p>
    `;
    wrapper.append(card);
  }
  return wrapper;
}

describe("disguisedAdFlagRule feed-wrapper invariants (property)", () => {
  it("a wrapper with multiple labeled card-shaped children is never replaced", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.constantFrom(...LABEL_PHRASES),
        (cardCount, labelText) => {
          document.body.replaceChildren();
          const wrapper = buildFeed(cardCount, labelText, 0);
          document.body.append(wrapper);

          disguisedAdFlagRule.apply(document.body);

          // Wrapper survives — only individual cards are replaced.
          expect(
            document.querySelector('[data-fixture="feed"]'),
          ).not.toBeNull();
          // Every card got its own placeholder.
          expect(
            document.querySelectorAll(`.${PLACEHOLDER_CLASS}`),
          ).toHaveLength(cardCount);

          disguisedAdFlagRule.teardown();
        },
      ),
      { numRuns: 30 },
    );
  });

  it("a wrapper with a mix of headed and headless labeled cards is never replaced", () => {
    // Mirrors the #228 trigger: not every ad post carries its own
    // headline. The headless cards walk past their own boundary; the
    // feed wrapper must still reject them.
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 1, max: 5 }),
        (totalCards, headlessRaw) => {
          const headlessCount = Math.min(headlessRaw, totalCards - 1);
          document.body.replaceChildren();
          const wrapper = buildFeed(totalCards, "Promoted", headlessCount);
          document.body.append(wrapper);

          disguisedAdFlagRule.apply(document.body);

          expect(
            document.querySelector('[data-fixture="feed"]'),
          ).not.toBeNull();
          // Headed cards are hidden; headless ones are left alone.
          const headedCount = totalCards - headlessCount;
          expect(
            document.querySelectorAll(`.${PLACEHOLDER_CLASS}`),
          ).toHaveLength(headedCount);
          for (let i = 0; i < headlessCount; i++) {
            expect(
              document.querySelector(`[data-fixture="card-${i}"]`),
            ).not.toBeNull();
          }

          disguisedAdFlagRule.teardown();
        },
      ),
      { numRuns: 40 },
    );
  });

  it("a single card with N stacked wrapper divs is always hidden", () => {
    // Regression for the follow-up to #228: stacking wrapper divs
    // between the label and the heading+image+link content must not
    // cause the rule to skip the card. The multi-card guard counts
    // only outermost qualifying subtrees, so nested wrappers collapse
    // to one and the card matches.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom(...LABEL_PHRASES),
        (wrapperDepth, labelText) => {
          document.body.replaceChildren();
          const card = document.createElement("article");
          card.dataset.fixture = "card";
          const label = document.createElement("span");
          label.className = "label";
          label.textContent = labelText;
          card.append(label);
          let cursor: HTMLElement = card;
          for (let i = 0; i < wrapperDepth; i++) {
            const wrapper = document.createElement("div");
            wrapper.className = `wrapper-${i}`;
            cursor.append(wrapper);
            cursor = wrapper;
          }
          cursor.innerHTML = `
            <h2><a href="/x">Title</a></h2>
            <img alt="" src="/x.jpg" />
            <p>Body copy that exceeds the eighty-character prose minimum the disguised-ad-flag rule applies to article-shape candidates.</p>
          `;
          document.body.append(card);

          disguisedAdFlagRule.apply(document.body);

          expect(document.querySelector('[data-fixture="card"]')).toBeNull();
          expect(
            document.querySelectorAll(`.${PLACEHOLDER_CLASS}`),
          ).toHaveLength(1);

          disguisedAdFlagRule.teardown();
        },
      ),
      { numRuns: 30 },
    );
  });

  it("a role='feed' wrapper is never crossed by the walk-up", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom(...LABEL_PHRASES),
        (cardCount, labelText) => {
          document.body.replaceChildren();
          const wrapper = buildFeed(cardCount, labelText, cardCount);
          wrapper.setAttribute("role", "feed");
          document.body.append(wrapper);

          disguisedAdFlagRule.apply(document.body);

          // No card has its own heading, and the feed boundary stops
          // the walk — nothing gets hidden, but critically the feed
          // itself is preserved.
          expect(
            document.querySelector('[data-fixture="feed"]'),
          ).not.toBeNull();
          expect(
            document.querySelectorAll(`.${PLACEHOLDER_CLASS}`),
          ).toHaveLength(0);

          disguisedAdFlagRule.teardown();
        },
      ),
      { numRuns: 30 },
    );
  });
});
