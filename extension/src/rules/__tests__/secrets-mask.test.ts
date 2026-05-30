import { PLACEHOLDER_CLASS } from "../../lib/placeholder";
import { secretsMaskRule } from "../secrets-mask";

const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const GITHUB_PAT = `ghp_${"a".repeat(36)}`;
const GOOGLE_KEY = `AIza${"abcdefghij".repeat(3)}ABCDE`; // 39 chars total
const STRIPE_KEY = `sk_live_${"A1b2C3d4E5".repeat(3)}`;
const ANTHROPIC_KEY = `sk-ant-api03-${"x".repeat(40)}`;
const SLACK_TOKEN = `xoxb-1234567890-${"abcdef".repeat(4)}`;
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----`;
// A 64-char hex string (well above 3.0 bits/char) — looks like a hash/token.
const HIGH_ENTROPY_HEX =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
// Random base64-ish, 40 chars.
const HIGH_ENTROPY_B64 = "k3M9xQ8vP2nL5tR7yW1aZ4bC6dE0fG2hJ8iK3lMn";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("secrets-mask", () => {
  it("masks AWS access keys", () => {
    document.body.innerHTML = `<p>key=${AWS_KEY} here</p>`;
    secretsMaskRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[aws key hidden]");
    expect(document.body.textContent).not.toContain(AWS_KEY);
  });

  it("masks GitHub personal access tokens", () => {
    document.body.innerHTML = `<p>token: ${GITHUB_PAT}</p>`;
    secretsMaskRule.apply(document.body);

    const placeholder = document.querySelector(`.${PLACEHOLDER_CLASS}`);
    expect(placeholder?.textContent).toBe("[github token hidden]");
  });

  it("masks Google API keys", () => {
    document.body.innerHTML = `<p>k=${GOOGLE_KEY}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[google api key hidden]",
    );
  });

  it("masks Stripe keys", () => {
    document.body.innerHTML = `<p>${STRIPE_KEY}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[stripe key hidden]",
    );
  });

  it("masks Anthropic keys with the specific label", () => {
    document.body.innerHTML = `<p>${ANTHROPIC_KEY}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[anthropic key hidden]",
    );
  });

  it("masks Slack tokens", () => {
    document.body.innerHTML = `<p>${SLACK_TOKEN}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[slack token hidden]",
    );
  });

  it("masks JWTs", () => {
    document.body.innerHTML = `<p>Authorization: Bearer ${JWT}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[jwt hidden]",
    );
    expect(document.body.textContent).not.toContain(JWT);
  });

  it("masks PEM private key blocks", () => {
    document.body.innerHTML = `<pre>${PRIVATE_KEY}</pre>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[private key hidden]",
    );
    expect(document.body.textContent).not.toContain("BEGIN RSA PRIVATE KEY");
  });

  it("masks high-entropy hex strings", () => {
    document.body.innerHTML = `<p>digest: ${HIGH_ENTROPY_HEX}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[secret hidden]",
    );
  });

  it("masks high-entropy base64-ish strings", () => {
    document.body.innerHTML = `<p>token=${HIGH_ENTROPY_B64}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)?.textContent).toBe(
      "[secret hidden]",
    );
  });

  it("does not mask ordinary low-entropy prose", () => {
    document.body.innerHTML = `<p>The quick brown fox jumps over the lazy dog repeatedly today</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not mask a 32-char repeating pattern (low entropy)", () => {
    // Only 2 distinct chars → entropy = 1 bit/char, well below either threshold.
    document.body.innerHTML = `<p>${"ab".repeat(20)}</p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("prefers a provider-specific label over the generic entropy fallback", () => {
    document.body.innerHTML = `<p>${GITHUB_PAT}</p>`;
    secretsMaskRule.apply(document.body);

    const placeholders = document.querySelectorAll(`.${PLACEHOLDER_CLASS}`);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].textContent).toBe("[github token hidden]");
  });

  it("masks multiple secrets in the same text node", () => {
    document.body.innerHTML = `<p>${AWS_KEY} and ${JWT}</p>`;
    secretsMaskRule.apply(document.body);

    const labels = Array.from(
      document.querySelectorAll(`.${PLACEHOLDER_CLASS}`),
      (el) => el.textContent,
    );
    expect(labels).toContain("[aws key hidden]");
    expect(labels).toContain("[jwt hidden]");
  });

  it("does not process text inside SCRIPT or STYLE", () => {
    document.body.innerHTML = `<script>const k = "${AWS_KEY}";</script><style>/* ${JWT} */</style>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
  });

  it("does not re-process content inside an existing placeholder", () => {
    document.body.innerHTML = `<p><span class="${PLACEHOLDER_CLASS}">${AWS_KEY}</span></p>`;
    secretsMaskRule.apply(document.body);

    expect(document.querySelectorAll(`.${PLACEHOLDER_CLASS}`)).toHaveLength(1);
  });

  it("reveals the original value on click", () => {
    document.body.innerHTML = `<p>${AWS_KEY}</p>`;
    secretsMaskRule.apply(document.body);

    const placeholder = document.querySelector<HTMLElement>(
      `.${PLACEHOLDER_CLASS}`,
    );
    placeholder?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelector(`.${PLACEHOLDER_CLASS}`)).toBeNull();
    expect(document.body.textContent).toContain(AWS_KEY);
  });
});
