import { metaInjectionStripRule } from "../meta-injection-strip";
import { FIXTURES } from "./injection-fixtures";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

function appendMetaToHead(attributes: Record<string, string>): HTMLMetaElement {
  const meta = document.createElement("meta");
  for (const [name, value] of Object.entries(attributes)) {
    meta.setAttribute(name, value);
  }
  document.head.append(meta);
  return meta;
}

function appendTitleToHead(text: string): HTMLTitleElement {
  const title = document.createElement("title");
  title.textContent = text;
  document.head.append(title);
  return title;
}

function resetHead(): void {
  for (const element of [
    ...document.head.querySelectorAll("meta"),
    ...document.head.querySelectorAll("title"),
  ]) {
    element.remove();
  }
}

beforeEach(() => {
  document.body.replaceChildren();
  resetHead();
  jest.useFakeTimers();
});

afterEach(() => {
  metaInjectionStripRule.teardown();
  jest.useRealTimers();
});

describe("meta-injection-strip meta tags", () => {
  it("blanks the content attribute on a poisoned <meta name=description>", () => {
    const meta = appendMetaToHead({
      name: "description",
      content: FIXTURES.IGNORE_HACKED,
    });

    metaInjectionStripRule.apply(document.body);

    // Element stays attached so framework reconciliation (React 19 hoisted
    // metadata etc.) can still unmount it cleanly on route change.
    expect(meta.isConnected).toBe(true);
    expect(meta.getAttribute("content")).toBe("");
  });

  it("blanks <meta property=og:description> when content matches", () => {
    const meta = appendMetaToHead({
      property: "og:description",
      content: FIXTURES.NEW_INSTRUCTIONS,
    });

    metaInjectionStripRule.apply(document.body);

    expect(meta.isConnected).toBe(true);
    expect(meta.getAttribute("content")).toBe("");
  });

  it("blanks <meta name=twitter:title> when content matches", () => {
    const meta = appendMetaToHead({
      name: "twitter:title",
      content: FIXTURES.OVERRIDE_GUARDRAILS,
    });

    metaInjectionStripRule.apply(document.body);

    expect(meta.isConnected).toBe(true);
    expect(meta.getAttribute("content")).toBe("");
  });

  it("preserves clean meta tags", () => {
    const description = appendMetaToHead({
      name: "description",
      content: "Quality kitchenware at fair prices.",
    });
    const viewport = appendMetaToHead({
      name: "viewport",
      content: "width=device-width",
    });

    metaInjectionStripRule.apply(document.body);

    expect(description.getAttribute("content")).toBe(
      "Quality kitchenware at fair prices.",
    );
    expect(viewport.getAttribute("content")).toBe("width=device-width");
  });

  it("blanks a poisoned meta but leaves siblings untouched", () => {
    const poisoned = appendMetaToHead({
      name: "description",
      content: FIXTURES.DAN,
    });
    const clean = appendMetaToHead({
      property: "og:title",
      content: "RiverMart Skillet",
    });

    metaInjectionStripRule.apply(document.body);

    expect(poisoned.isConnected).toBe(true);
    expect(poisoned.getAttribute("content")).toBe("");
    expect(clean.getAttribute("content")).toBe("RiverMart Skillet");
  });

  it("does not touch meta tags without a content attribute", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "color-scheme");
    document.head.append(meta);

    metaInjectionStripRule.apply(document.body);

    expect(meta.isConnected).toBe(true);
    expect(meta.hasAttribute("content")).toBe(false);
  });

  it("processes meta tags in document.body", () => {
    // React 19 / react-helmet style: a component renders <meta> in body
    // and the framework hoists. We still want to catch it where it lives.
    document.body.innerHTML = `<meta name="description" content="${FIXTURES.IGNORE_HACKED}">`;

    metaInjectionStripRule.apply(document.body);

    const meta = document.body.querySelector("meta");
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute("content")).toBe("");
  });
});

describe("meta-injection-strip title", () => {
  it("clears <title> text when it matches", () => {
    const title = appendTitleToHead(FIXTURES.DISREGARD);

    metaInjectionStripRule.apply(document.body);

    expect(title.textContent).toBe("");
    expect(title.isConnected).toBe(true); // element preserved
  });

  it("preserves clean <title> text", () => {
    const title = appendTitleToHead("RiverMart — Cast Iron Skillet");

    metaInjectionStripRule.apply(document.body);

    expect(title.textContent).toBe("RiverMart — Cast Iron Skillet");
  });
});

describe("meta-injection-strip lazy subtrees", () => {
  it("scrubs a meta tag added to head after apply", async () => {
    metaInjectionStripRule.apply(document.body);

    const meta = appendMetaToHead({
      name: "description",
      content: FIXTURES.DEV_MODE,
    });

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(meta.isConnected).toBe(true);
    expect(meta.getAttribute("content")).toBe("");
  });

  it("scrubs a meta tag added to body after apply", async () => {
    metaInjectionStripRule.apply(document.body);

    const route = document.createElement("section");
    const meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", FIXTURES.IGNORE_ALL);
    route.append(meta);
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(meta.isConnected).toBe(true);
    expect(meta.getAttribute("content")).toBe("");
  });

  it("re-scrubs a meta whose content is overwritten in place after blanking", async () => {
    // Initial scrub blanks the existing payload but leaves the element
    // attached. A subsequent framework / page-script write to `content=`
    // would, pre-fix, sit visible until the next route change. With
    // `content` in OBSERVED_ATTRIBUTES + observeAttributes on the watcher,
    // the rewrite reaches scrubMeta and the new payload is blanked too.
    const meta = appendMetaToHead({
      name: "description",
      content: FIXTURES.IGNORE_HACKED,
    });

    metaInjectionStripRule.apply(document.body);
    expect(meta.getAttribute("content")).toBe("");

    meta.setAttribute("content", FIXTURES.DAN);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(meta.isConnected).toBe(true);
    expect(meta.getAttribute("content")).toBe("");
  });

  it("leaves a meta with a clean in-place content rewrite alone", async () => {
    // The attribute-mutation hook is opt-in for the rule, not for the
    // page — a benign rewrite stays exactly as the page wrote it.
    const meta = appendMetaToHead({
      name: "description",
      content: "RiverMart skillets",
    });

    metaInjectionStripRule.apply(document.body);
    meta.setAttribute("content", "RiverMart cookware");

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(meta.getAttribute("content")).toBe("RiverMart cookware");
  });

  it("teardown stops both watchers", async () => {
    metaInjectionStripRule.apply(document.body);
    metaInjectionStripRule.teardown();

    const meta = appendMetaToHead({
      name: "description",
      content: FIXTURES.IGNORE_HACKED,
    });

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(meta.getAttribute("content")).toBe(FIXTURES.IGNORE_HACKED);
  });
});

describe("meta-injection-strip idempotency", () => {
  it("is idempotent on a second apply", () => {
    const meta = appendMetaToHead({
      name: "description",
      content: FIXTURES.IGNORE_HACKED,
    });
    const title = appendTitleToHead(FIXTURES.DAN);

    metaInjectionStripRule.apply(document.body);
    metaInjectionStripRule.apply(document.body);

    expect(meta.getAttribute("content")).toBe("");
    expect(title.textContent).toBe("");
  });
});
