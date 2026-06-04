// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for `meta-injection-strip`. Confirms that the
// remove-vs-blank asymmetry holds across the injection fixture set:
// `<meta>` is removed entirely (a content-less meta has no value), while
// `<title>` is kept as an element with empty text (so `document.title`
// returns "" rather than the payload — code reading title still works).

import fc from "fast-check";

import { metaInjectionStripRule } from "../meta-injection-strip";
import { FIXTURES } from "./injection-fixtures";

const ADVERSARIAL = fc.constantFrom(
  FIXTURES.IGNORE_HACKED,
  FIXTURES.DISREGARD,
  FIXTURES.DAN,
  FIXTURES.DEV_MODE,
  FIXTURES.NEW_INSTRUCTIONS,
  FIXTURES.OVERRIDE_GUARDRAILS,
  FIXTURES.PLEASE_IGNORE,
  FIXTURES.IGNORE_ALL,
);

// Common meta naming conventions — `name=` (HTML), `property=` (OG /
// Twitter), `itemprop=` (schema.org), `http-equiv=` (legacy). The rule
// must remove the meta regardless of which attribute names it.
const NAME_ATTRS = fc.constantFrom(
  "name",
  "property",
  "itemprop",
  "http-equiv",
);
const NAME_VALUES = fc.constantFrom(
  "description",
  "og:description",
  "twitter:description",
  "og:title",
  "keywords",
  "summary",
);

function resetHead(): void {
  for (const element of [
    ...document.head.querySelectorAll("meta"),
    ...document.head.querySelectorAll("title"),
  ]) {
    element.remove();
  }
}

afterEach(() => {
  metaInjectionStripRule.teardown();
  document.body.innerHTML = "";
  resetHead();
});

describe("meta-injection-strip (property)", () => {
  it("removes any <meta content> carrying injection text regardless of name attribute", () => {
    fc.assert(
      fc.property(
        ADVERSARIAL,
        NAME_ATTRS,
        NAME_VALUES,
        (payload, nameAttribute, nameValue) => {
          resetHead();
          const meta = document.createElement("meta");
          meta.setAttribute(nameAttribute, nameValue);
          meta.setAttribute("content", payload);
          document.head.append(meta);

          metaInjectionStripRule.apply(document.body);

          const remaining = document.head.querySelector(
            `meta[${nameAttribute}="${nameValue}"]`,
          );
          expect(remaining).toBeNull();
        },
      ),
    );
  });

  it("blanks <title> text but keeps the element when title carries injection", () => {
    fc.assert(
      fc.property(ADVERSARIAL, (payload) => {
        resetHead();
        const title = document.createElement("title");
        title.textContent = payload;
        document.head.append(title);

        metaInjectionStripRule.apply(document.body);

        // Element survives so consumers of `document.title` still get
        // a string (empty), not undefined.
        const remaining = document.head.querySelector("title");
        expect(remaining).not.toBeNull();
        expect(remaining?.textContent).toBe("");
        expect(document.title).toBe("");
      }),
    );
  });

  it("preserves benign meta and title content", () => {
    const cleanArb = fc.constantFrom(
      "Shop the latest sneakers and apparel",
      "RiverMart — everything from cookware to compute",
      "Free returns on orders over $25",
      FIXTURES.BENIGN_LLM,
    );
    fc.assert(
      fc.property(cleanArb, cleanArb, (metaContent, titleText) => {
        resetHead();
        const meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        meta.setAttribute("content", metaContent);
        const title = document.createElement("title");
        title.textContent = titleText;
        document.head.append(meta, title);

        metaInjectionStripRule.apply(document.body);

        expect(
          document.head
            .querySelector('meta[name="description"]')
            ?.getAttribute("content"),
        ).toBe(metaContent);
        expect(document.head.querySelector("title")?.textContent).toBe(
          titleText,
        );
      }),
    );
  });
});
