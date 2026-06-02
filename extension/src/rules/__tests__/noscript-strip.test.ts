import { noscriptStripRule } from "../noscript-strip";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("noscript").forEach((n) => {
    n.remove();
  });
  jest.useFakeTimers();
});

afterEach(() => {
  noscriptStripRule.teardown();
  jest.useRealTimers();
});

describe("noscript-strip", () => {
  it("removes a top-level noscript element from the body", () => {
    document.body.innerHTML = `<noscript>fallback</noscript><p>real</p>`;
    noscriptStripRule.apply(document.body);

    expect(document.body.querySelector("noscript")).toBeNull();
    expect(document.body.textContent).toBe("real");
  });

  it("removes nested noscript elements", () => {
    document.body.innerHTML = `
      <article>
        <p>visible</p>
        <noscript>do this instead</noscript>
        <div><noscript>and this</noscript></div>
      </article>
    `;
    noscriptStripRule.apply(document.body);

    expect(document.body.querySelectorAll("noscript")).toHaveLength(0);
    expect(document.body.querySelector("article")).not.toBeNull();
  });

  it("removes a noscript element in <head>", () => {
    const head = document.createElement("noscript");
    head.textContent = "head fallback";
    document.head.append(head);

    noscriptStripRule.apply(document);

    expect(document.head.querySelector("noscript")).toBeNull();
  });

  it("is idempotent on a second apply", () => {
    document.body.innerHTML = `<noscript>x</noscript><p>y</p>`;
    noscriptStripRule.apply(document.body);
    noscriptStripRule.apply(document.body);

    expect(document.body.querySelector("noscript")).toBeNull();
    expect(document.body.textContent).toBe("y");
  });

  it("leaves a page with no noscript untouched", () => {
    document.body.innerHTML = `<p>hello</p><span>world</span>`;
    const before = document.body.innerHTML;
    noscriptStripRule.apply(document.body);

    expect(document.body.innerHTML).toBe(before);
  });

  it("strips a noscript injected after apply", async () => {
    noscriptStripRule.apply(document.body);

    const route = document.createElement("section");
    route.innerHTML = `<noscript>lazy</noscript><p>visible</p>`;
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(route.querySelector("noscript")).toBeNull();
    expect(route.textContent).toBe("visible");
  });

  it("strips a noscript that is itself the added subtree root", async () => {
    noscriptStripRule.apply(document.body);

    const root = document.createElement("noscript");
    root.textContent = "appended";
    document.body.append(root);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.body.querySelector("noscript")).toBeNull();
  });

  it("teardown stops the observer", async () => {
    noscriptStripRule.apply(document.body);
    noscriptStripRule.teardown();

    const route = document.createElement("noscript");
    route.textContent = "after teardown";
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.body.querySelector("noscript")).not.toBeNull();
  });
});
