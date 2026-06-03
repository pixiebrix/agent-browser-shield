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
  document.body.innerHTML = "";
  resetHead();
  jest.useFakeTimers();
});

afterEach(() => {
  metaInjectionStripRule.teardown();
  jest.useRealTimers();
});

describe("meta-injection-strip meta tags", () => {
  it("removes <meta name=description> when content matches", () => {
    appendMetaToHead({ name: "description", content: FIXTURES.IGNORE_HACKED });

    metaInjectionStripRule.apply(document.body);

    expect(document.head.querySelector("meta[name=description]")).toBeNull();
  });

  it("removes <meta property=og:description> when content matches", () => {
    appendMetaToHead({
      property: "og:description",
      content: FIXTURES.NEW_INSTRUCTIONS,
    });

    metaInjectionStripRule.apply(document.body);

    expect(
      document.head.querySelector('meta[property="og:description"]'),
    ).toBeNull();
  });

  it("removes <meta name=twitter:title> when content matches", () => {
    appendMetaToHead({
      name: "twitter:title",
      content: FIXTURES.OVERRIDE_GUARDRAILS,
    });

    metaInjectionStripRule.apply(document.body);

    expect(
      document.head.querySelector('meta[name="twitter:title"]'),
    ).toBeNull();
  });

  it("preserves clean meta tags", () => {
    appendMetaToHead({
      name: "description",
      content: "Quality kitchenware at fair prices.",
    });
    appendMetaToHead({ name: "viewport", content: "width=device-width" });

    metaInjectionStripRule.apply(document.body);

    expect(
      document.head.querySelector('meta[name="description"]'),
    ).not.toBeNull();
    expect(document.head.querySelector('meta[name="viewport"]')).not.toBeNull();
  });

  it("removes a poisoned meta but keeps siblings", () => {
    const poisoned = appendMetaToHead({
      name: "description",
      content: FIXTURES.DAN,
    });
    const clean = appendMetaToHead({
      property: "og:title",
      content: "RiverMart Skillet",
    });

    metaInjectionStripRule.apply(document.body);

    expect(poisoned.isConnected).toBe(false);
    expect(clean.isConnected).toBe(true);
  });

  it("does not touch meta tags without a content attribute", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "color-scheme");
    document.head.append(meta);

    metaInjectionStripRule.apply(document.body);

    expect(meta.isConnected).toBe(true);
  });

  it("processes meta tags in document.body", () => {
    // React 19 / react-helmet style: a component renders <meta> in body
    // and the framework hoists. We still want to catch it where it lives.
    document.body.innerHTML = `<meta name="description" content="${FIXTURES.IGNORE_HACKED}">`;

    metaInjectionStripRule.apply(document.body);

    expect(document.body.querySelector("meta")).toBeNull();
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

    expect(meta.isConnected).toBe(false);
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

    expect(route.querySelector("meta")).toBeNull();
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

    expect(meta.isConnected).toBe(true);
  });
});

describe("meta-injection-strip idempotency", () => {
  it("is idempotent on a second apply", () => {
    appendMetaToHead({ name: "description", content: FIXTURES.IGNORE_HACKED });
    const title = appendTitleToHead(FIXTURES.DAN);

    metaInjectionStripRule.apply(document.body);
    metaInjectionStripRule.apply(document.body);

    expect(document.head.querySelector("meta[name=description]")).toBeNull();
    expect(title.textContent).toBe("");
  });
});
