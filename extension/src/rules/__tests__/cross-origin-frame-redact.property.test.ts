// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Property-based tests for cross-origin-frame-redact. fast-check
// explores the boundary between elements that should be redacted and
// those that should pass through:
//   - any http(s) cross-origin host on iframe[src] / object[data] /
//     embed[src] triggers a placeholder,
//   - same-origin URLs (resolved against document.baseURI) and inert
//     protocols (about:, data:, javascript:, blob:) are left alone,
//   - iframe[srcdoc] is always redacted regardless of any src.

import fc from "fast-check";

import { RULE_ATTR } from "../../lib/dom-markers";
import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { crossOriginFrameRedactRule } from "../cross-origin-frame-redact";

const RULE_ID = "cross-origin-frame-redact";

function hasPlaceholder(): boolean {
  return Boolean(
    document.querySelector(`.${PLACEHOLDER_CLASS}[${RULE_ATTR}="${RULE_ID}"]`),
  );
}

// jsdom defaults `location.origin` to `http://localhost`. Anything else
// is cross-origin.
const CROSS_ORIGIN_HOST = fc.constantFrom(
  "example.com",
  "other.example",
  "tracker.test",
  "cdn.partner.example",
  "ads.example.org",
);
const HTTP_SCHEME = fc.constantFrom("http", "https");
const PATH_SEGMENT = fc.stringMatching(/^[\w-]{1,16}$/);

const CROSS_ORIGIN_URL = fc
  .tuple(
    HTTP_SCHEME,
    CROSS_ORIGIN_HOST,
    fc.array(PATH_SEGMENT, { maxLength: 3 }),
  )
  .map(
    ([scheme, host, segments]) => `${scheme}://${host}/${segments.join("/")}`,
  );

// Same-origin URLs: absolute pointing at localhost, or relative paths
// that resolve against http://localhost via document.baseURI.
const SAME_ORIGIN_URL = fc.oneof(
  fc
    .array(PATH_SEGMENT, { minLength: 1, maxLength: 3 })
    .map((segments) => `/${segments.join("/")}`),
  fc
    .array(PATH_SEGMENT, { maxLength: 3 })
    .map((segments) => `http://localhost/${segments.join("/")}`),
);

// Protocols that don't carry a distinct web origin — either inherit the
// embedding origin or are inert.
const INERT_URL = fc.constantFrom(
  "about:blank",
  "javascript:void(0)",
  "data:text/html,<p>hi</p>",
  "blob:http://localhost/abc-123",
);

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  crossOriginFrameRedactRule.teardown();
});

describe("cross-origin-frame-redact (property)", () => {
  it("redacts any http(s) cross-origin iframe regardless of host or path", () => {
    fc.assert(
      fc.property(CROSS_ORIGIN_URL, (src) => {
        document.body.innerHTML = "";
        const iframe = document.createElement("iframe");
        iframe.setAttribute("src", src);
        document.body.append(iframe);

        crossOriginFrameRedactRule.apply(document.body);

        expect(document.querySelector("iframe")).toBeNull();
        expect(hasPlaceholder()).toBe(true);

        crossOriginFrameRedactRule.teardown();
      }),
    );
  });

  it("redacts any http(s) cross-origin <object data=…>", () => {
    fc.assert(
      fc.property(CROSS_ORIGIN_URL, (data) => {
        document.body.innerHTML = "";
        const object = document.createElement("object");
        object.setAttribute("data", data);
        document.body.append(object);

        crossOriginFrameRedactRule.apply(document.body);

        expect(document.querySelector("object")).toBeNull();
        expect(hasPlaceholder()).toBe(true);

        crossOriginFrameRedactRule.teardown();
      }),
    );
  });

  it("redacts any http(s) cross-origin <embed src=…>", () => {
    fc.assert(
      fc.property(CROSS_ORIGIN_URL, (src) => {
        document.body.innerHTML = "";
        const embed = document.createElement("embed");
        embed.setAttribute("src", src);
        document.body.append(embed);

        crossOriginFrameRedactRule.apply(document.body);

        expect(document.querySelector("embed")).toBeNull();
        expect(hasPlaceholder()).toBe(true);

        crossOriginFrameRedactRule.teardown();
      }),
    );
  });

  it("leaves same-origin iframes/objects/embeds untouched", () => {
    fc.assert(
      fc.property(
        SAME_ORIGIN_URL,
        fc.constantFrom("iframe", "object", "embed"),
        (url, tag) => {
          document.body.innerHTML = "";
          const element = document.createElement(tag);
          element.setAttribute(tag === "object" ? "data" : "src", url);
          document.body.append(element);

          crossOriginFrameRedactRule.apply(document.body);

          expect(document.querySelector(tag)).not.toBeNull();
          expect(hasPlaceholder()).toBe(false);

          crossOriginFrameRedactRule.teardown();
        },
      ),
    );
  });

  it("leaves inert-protocol embeds untouched", () => {
    fc.assert(
      fc.property(
        INERT_URL,
        fc.constantFrom("iframe", "object", "embed"),
        (url, tag) => {
          document.body.innerHTML = "";
          const element = document.createElement(tag);
          element.setAttribute(tag === "object" ? "data" : "src", url);
          document.body.append(element);

          crossOriginFrameRedactRule.apply(document.body);

          expect(document.querySelector(tag)).not.toBeNull();
          expect(hasPlaceholder()).toBe(false);

          crossOriginFrameRedactRule.teardown();
        },
      ),
    );
  });

  // srcdoc takes precedence over src per spec, so a srcdoc iframe is
  // always redacted via the inline-content branch regardless of whether
  // src is absent, same-origin, or cross-origin.
  it("redacts any iframe with srcdoc set, regardless of accompanying src", () => {
    const ANY_SRC = fc.oneof(
      fc.constant<string | undefined>(undefined),
      SAME_ORIGIN_URL,
      CROSS_ORIGIN_URL,
    );
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }),
        ANY_SRC,
        (srcdocBody, src) => {
          document.body.innerHTML = "";
          const iframe = document.createElement("iframe");
          iframe.setAttribute("srcdoc", `<p>${srcdocBody}</p>`);
          if (src !== undefined) {
            iframe.setAttribute("src", src);
          }
          document.body.append(iframe);

          crossOriginFrameRedactRule.apply(document.body);

          expect(document.querySelector("iframe")).toBeNull();
          const placeholder = document.querySelector(
            `.${PLACEHOLDER_CLASS}[${RULE_ATTR}="${RULE_ID}"]`,
          );
          expect(placeholder).not.toBeNull();
          // srcdoc branch never surfaces an origin — it's inline.
          expect(placeholder?.textContent).toContain("Inline frame content");

          crossOriginFrameRedactRule.teardown();
        },
      ),
    );
  });
});
