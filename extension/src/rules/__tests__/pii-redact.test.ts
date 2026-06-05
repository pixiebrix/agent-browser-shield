import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { __resetRouteChangeForTesting } from "../../lib/route-change";
import { piiRedactRule } from "../pii-redact";

const VALID_CARD = "4111 1111 1111 1111"; // Visa test number, Luhn-valid.
const INVALID_CARD = "4111 1111 1111 1112"; // Same shape, Luhn-invalid.
const SSN = "123-45-6789";
const PHONE = "(555) 123-4567";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
  history.replaceState(null, "", "/initial");
  __resetRouteChangeForTesting();
});

afterEach(() => {
  piiRedactRule.teardown();
  __resetRouteChangeForTesting();
  jest.useRealTimers();
});

describe("pii-redact", () => {
  it("masks Luhn-valid credit card numbers", () => {
    document.body.innerHTML = `<p>My card is ${VALID_CARD} thanks</p>`;
    piiRedactRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toBe("[card hidden]");
    expect(document.body.textContent).not.toContain(VALID_CARD);
  });

  it("does not mask Luhn-invalid card-shaped digits", () => {
    document.body.innerHTML = `<p>Not a card: ${INVALID_CARD}</p>`;
    piiRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(INVALID_CARD);
  });

  it("masks SSNs", () => {
    document.body.innerHTML = `<p>SSN ${SSN}</p>`;
    piiRedactRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[ssn hidden]");
  });

  it("masks US phone numbers", () => {
    document.body.innerHTML = `<p>Call ${PHONE}</p>`;
    piiRedactRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[phone hidden]");
  });

  it("masks multiple matches in the same text node", () => {
    document.body.innerHTML = `<p>${PHONE} and ${SSN}</p>`;
    piiRedactRule.apply(document.body);

    const placeholders = document.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
    expect(placeholders).toHaveLength(2);
    const labels = Array.from(placeholders, (element) => element.textContent);
    expect(labels).toContain("[phone hidden]");
    expect(labels).toContain("[ssn hidden]");
  });

  it("does not process text inside SCRIPT or STYLE", () => {
    document.body.innerHTML = `<script>const ssn = "${SSN}";</script><style>/* ${PHONE} */</style>`;
    piiRedactRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not re-process content inside an existing placeholder", () => {
    document.body.innerHTML = `<p><span class="${PLACEHOLDER_CLASS}">${SSN}</span></p>`;
    piiRedactRule.apply(document.body);

    const placeholders = document.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
    expect(placeholders).toHaveLength(1);
  });

  it("reveals the original value on click", () => {
    document.body.innerHTML = `<p>${SSN}</p>`;
    piiRedactRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    expect(placeholder).not.toBeNull();

    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(SSN);
  });
});

describe("pii-redact lazy-loaded subtrees", () => {
  it("masks PII appearing after a client-side route change", async () => {
    piiRedactRule.apply(document.body);

    const route = document.createElement("section");
    route.innerHTML = `<p>SSN ${SSN}</p>`;
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[ssn hidden]");
    expect(document.body.textContent).not.toContain(SSN);
  });

  it("teardown stops the observer", async () => {
    piiRedactRule.apply(document.body);
    piiRedactRule.teardown();

    const route = document.createElement("section");
    route.innerHTML = `<p>SSN ${SSN}</p>`;
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not loop when its own placeholder is inserted", async () => {
    document.body.innerHTML = `<p>SSN ${SSN}</p>`;
    piiRedactRule.apply(document.body);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("masks every match when the tree spans multiple chunks", async () => {
    // Tree exceeds chunkSize=100 so the walker yields mid-scan. Without
    // the resume-anchor in walkSync, the walker's currentNode points to
    // the (now-detached) last node of chunk 1 after replaceMatchesInTextNode
    // runs — and nextNode() returns null, silently dropping every match
    // past the first 100. This test runs the rule end-to-end and
    // confirms all 200 SSNs get hidden, not just the first chunk.
    document.body.innerHTML = Array.from(
      { length: 200 },
      (_, i) => `<p>node-${i}: ${SSN}</p>`,
    ).join("");

    piiRedactRule.apply(document.body);
    // Chunk 1 (100 nodes) runs synchronously.
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );

    // Drain the chunked walk's yields. Each yield is a setTimeout(0)
    // whose `.then()` callback schedules the next chunk via microtask;
    // alternating timer + microtask drains the queue.
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(0);
      await flushMutations();
    }

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      200,
    );
  });

  it("route change aborts the in-flight chunked walk", () => {
    // Same shape as the teardown abort test, but the cancellation
    // signal is a route-change event (the rule subscribes to
    // subscribeRouteChange on first apply). Confirms the
    // route-change → abortAndReset wiring fires.
    document.body.innerHTML = Array.from(
      { length: 200 },
      (_, i) => `<p>node-${i}: ${SSN}</p>`,
    ).join("");

    piiRedactRule.apply(document.body);
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );

    history.replaceState(null, "", "/new-route");
    globalThis.dispatchEvent(new Event("popstate"));
    jest.advanceTimersByTime(0);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );
  });

  it("teardown aborts the in-flight chunked walk", () => {
    // 200 text nodes — exceeds the 100-node chunkSize default, so the
    // walk yields after chunk 1. teardown fires before the yield's
    // setTimeout(0) resolves; the continuation sees the aborted signal
    // and bails, leaving only the first chunk's matches masked.
    document.body.innerHTML = Array.from(
      { length: 200 },
      (_, i) => `<p>node-${i}: ${SSN}</p>`,
    ).join("");

    piiRedactRule.apply(document.body);
    // Sync chunk 1: 100 placeholders.
    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );

    piiRedactRule.teardown();
    // Fire the yield's setTimeout(0). The continuation checks the
    // signal first — aborted — and returns without processing
    // chunk 2.
    jest.advanceTimersByTime(0);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(
      100,
    );
  });
});
