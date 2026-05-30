import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { piiMaskRule } from "../pii-mask";

const VALID_CARD = "4111 1111 1111 1111"; // Visa test number, Luhn-valid.
const INVALID_CARD = "4111 1111 1111 1112"; // Same shape, Luhn-invalid.
const SSN = "123-45-6789";
const PHONE = "(555) 123-4567";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("pii-mask", () => {
  it("masks Luhn-valid credit card numbers", () => {
    document.body.innerHTML = `<p>My card is ${VALID_CARD} thanks</p>`;
    piiMaskRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toBe("[card hidden]");
    expect(document.body.textContent).not.toContain(VALID_CARD);
  });

  it("does not mask Luhn-invalid card-shaped digits", () => {
    document.body.innerHTML = `<p>Not a card: ${INVALID_CARD}</p>`;
    piiMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(INVALID_CARD);
  });

  it("masks SSNs", () => {
    document.body.innerHTML = `<p>SSN ${SSN}</p>`;
    piiMaskRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[ssn hidden]");
  });

  it("masks US phone numbers", () => {
    document.body.innerHTML = `<p>Call ${PHONE}</p>`;
    piiMaskRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[phone hidden]");
  });

  it("masks multiple matches in the same text node", () => {
    document.body.innerHTML = `<p>${PHONE} and ${SSN}</p>`;
    piiMaskRule.apply(document.body);

    const placeholders = document.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
    expect(placeholders).toHaveLength(2);
    const labels = Array.from(placeholders, (el) => el.textContent);
    expect(labels).toContain("[phone hidden]");
    expect(labels).toContain("[ssn hidden]");
  });

  it("does not process text inside SCRIPT or STYLE", () => {
    document.body.innerHTML = `<script>const ssn = "${SSN}";</script><style>/* ${PHONE} */</style>`;
    piiMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not re-process content inside an existing placeholder", () => {
    document.body.innerHTML = `<p><span class="${PLACEHOLDER_CLASS}">${SSN}</span></p>`;
    piiMaskRule.apply(document.body);

    const placeholders = document.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
    expect(placeholders).toHaveLength(1);
  });

  it("reveals the original value on click", () => {
    document.body.innerHTML = `<p>${SSN}</p>`;
    piiMaskRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    expect(placeholder).not.toBeNull();

    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(SSN);
  });
});
