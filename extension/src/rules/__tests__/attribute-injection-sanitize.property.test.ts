// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for `attribute-injection-sanitize`. Fuzzes across
// the allowlisted attributes × the shared injection fixture set, plus
// random benign prefix/suffix noise to confirm the regex set still fires
// when the payload is embedded inside surrounding text. A negative
// property covers attributes outside the allowlist (the rule must not
// touch them) and another covers enabled visible-input `value` (only
// `disabled` or `type="hidden"` inputs get their value stripped).

import fc from "fast-check";

import { attributeInjectionSanitizeRule } from "../attribute-injection-sanitize";
import { FIXTURES } from "./injection-fixtures";

const ALLOWLISTED_ATTRS = [
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-placeholder",
  "aria-valuetext",
  "aria-keyshortcuts",
  "alt",
  "title",
  "placeholder",
  "data-tooltip",
] as const;

const TAG_FOR_ATTR: Record<(typeof ALLOWLISTED_ATTRS)[number], string> = {
  "aria-label": "button",
  "aria-description": "div",
  "aria-roledescription": "div",
  "aria-placeholder": "input",
  "aria-valuetext": "div",
  "aria-keyshortcuts": "button",
  alt: "img",
  title: "span",
  placeholder: "input",
  "data-tooltip": "div",
};

// Subset of FIXTURES that unambiguously match a current injection
// pattern. Skip `BENIGN_LLM` etc. which are intentionally non-matching.
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

// Hex-character noise — can't form English imperatives so it won't
// accidentally trip an injection pattern when used as prefix/suffix.
// We require word-boundary separation from the payload (trailing space
// on prefix, leading space on suffix) because the injection patterns
// anchor with `\b`; concatenating a word character directly against
// the payload defeats the boundary by design.
const prefixArb = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[0-9a-f]{1,30}$/).map((s) => `${s} `),
);
const suffixArb = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[0-9a-f]{1,30}$/).map((s) => ` ${s}`),
);

const attributeArb = fc.constantFrom(...ALLOWLISTED_ATTRS);

function buildElement(
  tag: string,
  attribute: string,
  value: string,
): HTMLElement {
  document.body.innerHTML = "";
  const element = document.createElement(tag);
  element.setAttribute(attribute, value);
  document.body.append(element);
  return element;
}

afterEach(() => {
  attributeInjectionSanitizeRule.teardown();
  document.body.innerHTML = "";
});

describe("attribute-injection-sanitize (property)", () => {
  it("strips any allowlisted attribute when its value carries an injection payload, possibly embedded in surrounding noise", () => {
    fc.assert(
      fc.property(
        attributeArb,
        ADVERSARIAL,
        prefixArb,
        suffixArb,
        (attribute, payload, prefix, suffix) => {
          const tag = TAG_FOR_ATTR[attribute];
          const element = buildElement(
            tag,
            attribute,
            `${prefix}${payload}${suffix}`,
          );
          attributeInjectionSanitizeRule.apply(document.body);
          expect(element.hasAttribute(attribute)).toBe(false);
        },
      ),
    );
  });

  it("preserves non-allowlisted attributes even when they carry an injection payload", () => {
    fc.assert(
      fc.property(ADVERSARIAL, (payload) => {
        // `data-foo` and `name` are not in the allowlist. The rule
        // should treat them as page data and leave them alone.
        const element = buildElement("div", "data-foo", payload);
        element.setAttribute("name", payload);
        attributeInjectionSanitizeRule.apply(document.body);
        expect(element.dataset.foo).toBe(payload);
        expect(element.getAttribute("name")).toBe(payload);
      }),
    );
  });

  it("strips value on disabled and hidden inputs, leaves enabled visible inputs alone", () => {
    fc.assert(
      fc.property(ADVERSARIAL, (payload) => {
        document.body.innerHTML = "";
        const disabled = document.createElement("input");
        disabled.setAttribute("disabled", "");
        disabled.setAttribute("value", payload);
        const hidden = document.createElement("input");
        hidden.setAttribute("type", "hidden");
        hidden.setAttribute("value", payload);
        const enabled = document.createElement("input");
        enabled.setAttribute("value", payload);
        document.body.append(disabled, hidden, enabled);

        attributeInjectionSanitizeRule.apply(document.body);

        expect(disabled.hasAttribute("value")).toBe(false);
        expect(hidden.hasAttribute("value")).toBe(false);
        expect(enabled.getAttribute("value")).toBe(payload);
      }),
    );
  });

  it("preserves clean (non-injection) values on allowlisted attributes", () => {
    const cleanArb = fc.constantFrom(
      "Add to cart",
      "Product photo",
      "Posted 3 days ago",
      "Search products",
      "Apply coupon",
      "Free shipping over $25",
    );
    fc.assert(
      fc.property(attributeArb, cleanArb, (attribute, value) => {
        const tag = TAG_FOR_ATTR[attribute];
        const element = buildElement(tag, attribute, value);
        attributeInjectionSanitizeRule.apply(document.body);
        expect(element.getAttribute(attribute)).toBe(value);
      }),
    );
  });
});
