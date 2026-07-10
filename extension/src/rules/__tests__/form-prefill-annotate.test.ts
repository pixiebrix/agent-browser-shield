/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://shop.example.com/checkout"}
 */
import { FORM_PREFILL_ANNOTATED_ATTR as FLAGGED_ATTR } from "../../lib/dom-markers";
import { formPrefillAnnotateRule, isGeoSelect } from "../form-prefill-annotate";

const MUTATION_THROTTLE_MS = 250;
const FLAG_CLASS = "abs-form-prefill-annotate";

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

beforeEach(() => {
  document.body.replaceChildren();
  jest.useFakeTimers();
});

afterEach(() => {
  formPrefillAnnotateRule.teardown();
  jest.useRealTimers();
});

describe("formPrefillAnnotateRule — text/email/tel/number inputs", () => {
  it("annotates a pre-populated email field", () => {
    document.body.innerHTML = `
      <form>
        <label>Email
          <input type="email" name="email_marketing" value="jordan@example.com">
        </label>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);

    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
    expect(
      document.querySelectorAll(`[${FLAGGED_ATTR}=""]`).length,
    ).toBeGreaterThan(0);
  });

  it("skips an email field with autocomplete='email' (legitimate autofill target)", () => {
    document.body.innerHTML = `
      <form>
        <label>Email
          <input type="email" name="email" autocomplete="email" value="jordan@example.com">
        </label>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("annotates an autocomplete='off' field that ships with a value (the interesting case)", () => {
    document.body.innerHTML = `
      <form>
        <label>Promo code
          <input type="text" name="promo" autocomplete="off" value="SUMMER25">
        </label>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
  });

  it("skips an empty input", () => {
    document.body.innerHTML = `
      <form><input type="text" name="referral" value=""></form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("skips a hidden, disabled, or readonly input", () => {
    document.body.innerHTML = `
      <form>
        <input type="hidden" name="ref" value="abc">
        <input type="text" name="a" value="x" disabled>
        <input type="text" name="b" value="y" readonly>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("skips a password field", () => {
    document.body.innerHTML = `
      <form><input type="password" value="hunter2"></form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("uses the live value, matching what the agent's snapshot would see", () => {
    // Framework defaults (React `defaultValue`, Vue `v-model`) populate
    // the live property without writing an attribute. Reading the
    // attribute would miss those; reading `.value` flags them.
    document.body.innerHTML = `
      <form>
        <label>Notes
          <input id="notes" type="text" name="notes">
        </label>
      </form>
    `;
    (document.querySelector("#notes") as HTMLInputElement).value =
      "framework-prefilled";
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
  });
});

describe("formPrefillAnnotateRule — <select>", () => {
  it("annotates a select whose default isn't the first option", () => {
    document.body.innerHTML = `
      <form>
        <label>Shipping speed
          <select name="shipping">
            <option value="standard">Standard (free)</option>
            <option value="express">Express ($9.99)</option>
            <option value="overnight" selected>Overnight ($24.99)</option>
          </select>
        </label>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    const chip = document.querySelector(`.${FLAG_CLASS}`);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("Overnight");
  });

  it("skips a select where the first option is the default (no signal)", () => {
    document.body.innerHTML = `
      <form>
        <select name="size">
          <option selected>Small</option>
          <option>Medium</option>
          <option>Large</option>
        </select>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("flags a select where the framework set the default via the live property", () => {
    // Mimic React's `<select defaultValue="overnight">` — no `selected`
    // attribute on the option, just a property-level selection.
    document.body.innerHTML = `
      <form>
        <select id="shipping" name="shipping">
          <option value="standard">Standard</option>
          <option value="express">Express</option>
          <option value="overnight">Overnight</option>
        </select>
      </form>
    `;
    (document.querySelector("#shipping") as HTMLSelectElement).value =
      "overnight";
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
  });

  it("skips a geo select (country)", () => {
    document.body.innerHTML = `
      <form>
        <label>Country
          <select name="country">
            <option value="US">United States</option>
            <option value="CA" selected>Canada</option>
          </select>
        </label>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("skips a multi-select", () => {
    document.body.innerHTML = `
      <form>
        <select name="interests" multiple>
          <option selected>Books</option>
          <option selected>Music</option>
          <option>Games</option>
        </select>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("isGeoSelect returns true for country / state / province / region / currency selects", () => {
    document.body.innerHTML = `
      <form>
        <select id="s1" name="country"></select>
        <select id="s2" name="state"></select>
        <select id="s3" name="province"></select>
        <select id="s4" name="region"></select>
        <select id="s5" name="currency"></select>
        <select id="s6" aria-label="Choose your shipping state"></select>
      </form>
    `;
    for (const id of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      const select = document.querySelector(`#${id}`) as HTMLSelectElement;
      expect(isGeoSelect(select)).toBe(true);
    }
  });

  it("isGeoSelect returns false for shipping-speed / tip / donation selects", () => {
    document.body.innerHTML = `
      <form>
        <select id="s1" name="shipping"></select>
        <select id="s2" name="tip_percent"></select>
        <select id="s3" name="donation_amount"></select>
        <select id="s4" name="insurance_plan"></select>
      </form>
    `;
    for (const id of ["s1", "s2", "s3", "s4"]) {
      const select = document.querySelector(`#${id}`) as HTMLSelectElement;
      expect(isGeoSelect(select)).toBe(false);
    }
  });
});

describe("formPrefillAnnotateRule — radio groups", () => {
  it("annotates a radio group with a pre-selected option (once at the fieldset)", () => {
    document.body.innerHTML = `
      <form>
        <fieldset>
          <legend>Tip amount</legend>
          <label><input type="radio" name="tip" value="18">18%</label>
          <label><input type="radio" name="tip" value="20">20%</label>
          <label><input type="radio" name="tip" value="22" checked>22%</label>
        </fieldset>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
    const fieldset = document.querySelector("fieldset");
    expect(fieldset?.firstElementChild?.classList.contains(FLAG_CLASS)).toBe(
      true,
    );
  });

  it("uses a role='radiogroup' wrapper when no fieldset", () => {
    document.body.innerHTML = `
      <form>
        <div role="radiogroup" aria-label="Delivery slot">
          <label><input type="radio" name="slot" value="am">Morning</label>
          <label><input type="radio" name="slot" value="pm" checked>Afternoon</label>
        </div>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    const group = document.querySelector('[role="radiogroup"]');
    expect(group?.firstElementChild?.classList.contains(FLAG_CLASS)).toBe(true);
  });

  it("does not annotate a radio group where no option is checked", () => {
    document.body.innerHTML = `
      <form>
        <fieldset>
          <legend>Tip amount</legend>
          <label><input type="radio" name="tip" value="18">18%</label>
          <label><input type="radio" name="tip" value="20">20%</label>
        </fieldset>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });

  it("annotates each form's radio group independently (same `name` across forms)", () => {
    document.body.innerHTML = `
      <form id="a">
        <fieldset>
          <input type="radio" name="tip" value="22" checked>
        </fieldset>
      </form>
      <form id="b">
        <fieldset>
          <input type="radio" name="tip" value="22" checked>
        </fieldset>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(2);
  });

  it("skips a radio without a name attribute (standalone toggle)", () => {
    document.body.innerHTML = `
      <form>
        <fieldset><input type="radio" checked></fieldset>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });
});

describe("formPrefillAnnotateRule — focus interaction", () => {
  it("does not annotate a control the user has already focused", async () => {
    document.body.innerHTML = `
      <form>
        <label>Notes
          <input id="focused" type="text" name="notes" value="server-default">
        </label>
        <label>Other
          <input id="quiet" type="text" name="other" value="">
        </label>
      </form>
    `;
    // Start observing — installs the focusin listener.
    formPrefillAnnotateRule.apply(document.body);
    // First scan already flagged the prefilled field. Strip the chip
    // and FLAG_ATTR so the next pass re-evaluates.
    for (const chip of document.querySelectorAll(`.${FLAG_CLASS}`)) {
      chip.remove();
    }
    for (const node of document.querySelectorAll(`[${FLAGGED_ATTR}]`)) {
      node.removeAttribute(FLAGGED_ATTR);
    }
    // Simulate the user clicking into the field.
    const focused = document.querySelector("#focused") as HTMLInputElement;
    focused.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    // Trigger a re-scan via a mutation.
    document.body.querySelector("form")?.append(document.createElement("div"));
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
  });
});

describe("formPrefillAnnotateRule — chip cap", () => {
  it("caps chips at MAX_CHIPS_PER_FORM per form", () => {
    const form = document.createElement("form");
    for (let i = 0; i < 20; i++) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "text";
      input.name = `field_${i}`;
      input.setAttribute("value", `prefilled-${i}`);
      label.append(input);
      form.append(label);
    }
    document.body.append(form);
    formPrefillAnnotateRule.apply(document.body);
    // MAX_CHIPS_PER_FORM = 8 in form-prefill-annotate.ts
    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(8);
  });
});

describe("formPrefillAnnotateRule URL gating", () => {
  it("does not annotate on a non-checkout URL", () => {
    const originalHref = location.href;
    history.replaceState({}, "", "/profile/edit");
    try {
      document.body.innerHTML = `
        <form>
          <input type="text" name="nickname" value="Jordan">
        </form>
      `;
      formPrefillAnnotateRule.apply(document.body);
      expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(0);
    } finally {
      history.replaceState({}, "", originalHref);
    }
  });
});

describe("formPrefillAnnotateRule idempotency", () => {
  it("does not double-flag on a repeat scan", async () => {
    document.body.innerHTML = `
      <form>
        <label>Email
          <input type="email" name="newsletter" value="jordan@example.com">
        </label>
      </form>
    `;
    formPrefillAnnotateRule.apply(document.body);
    // Trigger another scan via an unrelated mutation.
    document.body.append(document.createElement("div"));
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelectorAll(`.${FLAG_CLASS}`).length).toBe(1);
  });

  it("annotates a lazy-loaded form", async () => {
    formPrefillAnnotateRule.apply(document.body);
    const late = document.createElement("div");
    late.innerHTML = `
      <form>
        <label>Phone
          <input type="tel" name="contact_phone" value="555-867-5309">
        </label>
      </form>
    `;
    document.body.append(late);
    await flushMutations();
    jest.advanceTimersByTime(MUTATION_THROTTLE_MS);

    expect(document.querySelector(`.${FLAG_CLASS}`)).not.toBeNull();
  });
});
