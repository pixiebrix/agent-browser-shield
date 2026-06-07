/**
 * @jest-environment jsdom
 */
// Property tests for the page-world shadow-root probe. Two invariants:
//
//   1. Event counts equal call counts. For any random sequence of
//      attachShadow / setHTMLUnsafe operations, the listener tally for
//      each event kind matches the number of corresponding operations.
//      Catches regressions where a wrap swallows events on some shape
//      (e.g. forgets to fire on a no-op setHTMLUnsafe call).
//   2. abs:shadow-discover detail.target is the operation's receiver.
//      Catches regressions where a refactor passes the wrong reference
//      (the resulting ShadowRoot vs. the host element, or document vs.
//      the receiver).

import fc from "fast-check";

import { installShadowRootProbe } from "../shadow-root-probe-source";

interface ProbeWindow {
  __abs_shadow_root_probe_installed?: boolean;
}

const ORIGINAL_ATTACH_SHADOW = Element.prototype.attachShadow;
interface ElementSetHTMLUnsafeCapable {
  setHTMLUnsafe?: (this: Element, html: string) => void;
}
const ORIGINAL_ELEMENT_SET_HTML = (
  Element.prototype as ElementSetHTMLUnsafeCapable
).setHTMLUnsafe;

function resetProbe(): void {
  delete (globalThis as unknown as ProbeWindow)
    .__abs_shadow_root_probe_installed;
  Element.prototype.attachShadow = ORIGINAL_ATTACH_SHADOW;
  if (ORIGINAL_ELEMENT_SET_HTML) {
    (Element.prototype as ElementSetHTMLUnsafeCapable).setHTMLUnsafe =
      ORIGINAL_ELEMENT_SET_HTML;
  }
}

type Op =
  | { kind: "attach-open"; hostIndex: number }
  | { kind: "attach-closed"; hostIndex: number }
  | { kind: "set-html"; hostIndex: number };

const opArb = (hostCount: number): fc.Arbitrary<Op> =>
  fc.oneof(
    fc.record({
      kind: fc.constant<"attach-open">("attach-open"),
      hostIndex: fc.integer({ min: 0, max: hostCount - 1 }),
    }),
    fc.record({
      kind: fc.constant<"attach-closed">("attach-closed"),
      hostIndex: fc.integer({ min: 0, max: hostCount - 1 }),
    }),
    fc.record({
      kind: fc.constant<"set-html">("set-html"),
      hostIndex: fc.integer({ min: 0, max: hostCount - 1 }),
    }),
  );

const sequenceArb = fc
  .integer({ min: 1, max: 6 })
  .chain((hostCount) =>
    fc
      .array(opArb(hostCount), { minLength: 1, maxLength: 16 })
      .map((ops) => ({ hostCount, ops })),
  );

describe("installShadowRootProbe — property: event tally matches op tally", () => {
  it("dispatches exactly one event per op of the matching kind", () => {
    fc.assert(
      fc.property(sequenceArb, ({ hostCount, ops }) => {
        resetProbe();
        document.body.innerHTML = "";
        installShadowRootProbe.call(globalThis as unknown as Window);

        const hosts = Array.from({ length: hostCount }, () => {
          const host = document.createElement("div");
          document.body.append(host);
          return host;
        });

        const closedEvents: Event[] = [];
        const discoverEvents: Array<CustomEvent<{ target?: unknown }>> = [];
        const onClosed = (event: Event): void => {
          closedEvents.push(event);
        };
        const onDiscover = (event: Event): void => {
          discoverEvents.push(event as CustomEvent<{ target?: unknown }>);
        };
        document.addEventListener("abs:closed-shadow-attached", onClosed);
        document.addEventListener("abs:shadow-discover", onDiscover);

        // Track which hosts already received a shadow — attachShadow
        // throws on a second attach to the same host. Skip duplicates
        // so the property assertion compares against the number of
        // *successful* attach calls, not the number of attempts.
        const attached = new Set<number>();
        let attachOpenCount = 0;
        let attachClosedCount = 0;
        let setHtmlCount = 0;

        for (const op of ops) {
          const host = hosts[op.hostIndex];
          if (!host) {
            continue;
          }
          if (op.kind === "attach-open") {
            if (attached.has(op.hostIndex)) {
              continue;
            }
            attached.add(op.hostIndex);
            host.attachShadow({ mode: "open" });
            attachOpenCount += 1;
          } else if (op.kind === "attach-closed") {
            if (attached.has(op.hostIndex)) {
              continue;
            }
            attached.add(op.hostIndex);
            host.attachShadow({ mode: "closed" });
            attachClosedCount += 1;
          } else {
            // set-html: only run if jsdom-extras polyfilled setHTMLUnsafe.
            if (
              typeof (Element.prototype as ElementSetHTMLUnsafeCapable)
                .setHTMLUnsafe !== "function"
            ) {
              continue;
            }
            host.setHTMLUnsafe("<span>plain</span>");
            setHtmlCount += 1;
          }
        }

        expect(closedEvents).toHaveLength(attachClosedCount);
        // Open attach AND set-html both fire abs:shadow-discover, so the
        // total tally is the sum.
        expect(discoverEvents).toHaveLength(attachOpenCount + setHtmlCount);

        document.removeEventListener("abs:closed-shadow-attached", onClosed);
        document.removeEventListener("abs:shadow-discover", onDiscover);
      }),
      { numRuns: 50 },
    );
  });
});

describe("installShadowRootProbe — property: discover target equals receiver", () => {
  it("event.detail.target is exactly the host element for attachShadow open", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (count) => {
        resetProbe();
        document.body.innerHTML = "";
        installShadowRootProbe.call(globalThis as unknown as Window);

        const hosts = Array.from({ length: count }, () => {
          const host = document.createElement("div");
          document.body.append(host);
          return host;
        });

        const received: unknown[] = [];
        const onDiscover = (event: Event): void => {
          const detail = (event as CustomEvent<{ target?: unknown }>).detail;
          received.push(detail.target);
        };
        document.addEventListener("abs:shadow-discover", onDiscover);

        for (const host of hosts) {
          host.attachShadow({ mode: "open" });
        }

        expect(received).toEqual(hosts);

        document.removeEventListener("abs:shadow-discover", onDiscover);
      }),
      { numRuns: 20 },
    );
  });
});
