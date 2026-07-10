import { noscriptStripRule } from "../noscript-strip";

const MUTATION_THROTTLE_MS = 250;

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.replaceChildren();
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
  it("blanks a top-level noscript element from the body", () => {
    document.body.innerHTML = `<noscript>fallback</noscript><p>real</p>`;
    noscriptStripRule.apply(document.body);

    const noscript = document.body.querySelector("noscript");
    // Element stays attached so framework reconciliation (React unmount
    // on route change, Vue/Svelte teardown, etc.) does not crash on a
    // detached parent.
    expect(noscript).not.toBeNull();
    expect(noscript?.textContent).toBe("");
    expect(document.body.textContent).toBe("real");
  });

  it("blanks nested noscript elements", () => {
    document.body.innerHTML = `
      <article>
        <p>visible</p>
        <noscript>do this instead</noscript>
        <div><noscript>and this</noscript></div>
      </article>
    `;
    noscriptStripRule.apply(document.body);

    const noscripts = document.body.querySelectorAll("noscript");
    expect(noscripts).toHaveLength(2);
    for (const noscript of noscripts) {
      expect(noscript.textContent).toBe("");
    }
    expect(document.body.querySelector("article")).not.toBeNull();
  });

  it("blanks a noscript element in <head>", () => {
    const noscript = document.createElement("noscript");
    noscript.textContent = "head fallback";
    document.head.append(noscript);

    noscriptStripRule.apply(document);

    expect(noscript.isConnected).toBe(true);
    expect(noscript.textContent).toBe("");
  });

  it("is idempotent on a second apply", () => {
    document.body.innerHTML = `<noscript>x</noscript><p>y</p>`;
    noscriptStripRule.apply(document.body);
    noscriptStripRule.apply(document.body);

    const noscript = document.body.querySelector("noscript");
    expect(noscript).not.toBeNull();
    expect(noscript?.textContent).toBe("");
    expect(document.body.textContent).toBe("y");
  });

  it("leaves a page with no noscript untouched", () => {
    document.body.innerHTML = `<p>hello</p><span>world</span>`;
    const before = document.body.innerHTML;
    noscriptStripRule.apply(document.body);

    expect(document.body.innerHTML).toBe(before);
  });

  it("blanks a noscript injected after apply", async () => {
    noscriptStripRule.apply(document.body);

    const route = document.createElement("section");
    route.innerHTML = `<noscript>lazy</noscript><p>visible</p>`;
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const noscript = route.querySelector("noscript");
    expect(noscript).not.toBeNull();
    expect(noscript?.textContent).toBe("");
    expect(route.textContent).toBe("visible");
  });

  it("blanks a noscript that is itself the added subtree root", async () => {
    noscriptStripRule.apply(document.body);

    const root = document.createElement("noscript");
    root.textContent = "appended";
    document.body.append(root);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const noscript = document.body.querySelector("noscript");
    expect(noscript).not.toBeNull();
    expect(noscript?.textContent).toBe("");
  });

  it("re-blanks a noscript when a child is later rendered into it", async () => {
    // After initial blanking the <noscript> is kept attached. If a
    // framework re-renders content INTO it, the watcher delivers the new
    // child as the added subtree root — closest("noscript") walks back up
    // to the kept wrapper so the new fallback gets blanked too.
    document.body.innerHTML = `<noscript>initial</noscript>`;
    noscriptStripRule.apply(document.body);

    const noscript = document.body.querySelector("noscript");
    expect(noscript).not.toBeNull();
    expect(noscript?.textContent).toBe("");

    const lateChild = document.createElement("span");
    lateChild.textContent = "re-rendered fallback";
    noscript?.append(lateChild);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(noscript?.isConnected).toBe(true);
    expect(noscript?.textContent).toBe("");
  });

  it("teardown stops the observer", async () => {
    noscriptStripRule.apply(document.body);
    noscriptStripRule.teardown();

    const route = document.createElement("noscript");
    route.textContent = "after teardown";
    document.body.append(route);

    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    const noscript = document.body.querySelector("noscript");
    expect(noscript).not.toBeNull();
    expect(noscript?.textContent).toBe("after teardown");
  });
});
