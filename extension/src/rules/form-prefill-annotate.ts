// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Annotate pre-populated form controls on checkout pages so the agent
// reads "pre-populated" in its snapshot and decides whether to overwrite.
// Three control shapes are covered:
//
//   1. <input type="text|email|tel|number"> with a non-empty initial value
//      that doesn't look like a legitimate browser-autofill target.
//   2. <select> whose initial selectedIndex !== 0 and that isn't a geo /
//      country / state field.
//   3. Radio group with an initially-checked option (covered as the
//      group's enclosing fieldset / wrapper, never the individual radio,
//      so we don't suggest the agent uncheck and break a required-
//      selection submit).
//
// Companion to `checkout-checkbox-sanitize` (preselection on checkboxes)
// and to `hidden-affiliate-sanitize` (the hidden-input arm split out into
// its own rule because the value-clear contract differs). The split
// follows issue #121: visible inputs have a high FP profile against
// legitimate autofill / multi-step persistence, so annotation is the
// right action; hidden-input clearing is allowlist-narrow and can be
// sanitize-and-forget.
//
// Action is annotation-only — no values are changed and no nodes are
// detached. Worst case is one extra chip on a form field.
//
// FP control is layered:
//   - URL gate (`isCheckoutUrl`) — never fires off checkout-shape paths.
//   - Per-form chip cap so a long form (e.g. saved-card management) gets
//     at most `MAX_CHIPS_PER_FORM` chips total.
//   - Skip when `document.activeElement` matches the control, or when
//     the control has already been focused (tracked via a focusin
//     listener) — cooperates with autofill that runs after our scan.
//   - For text/email/tel/number: skip when the `autocomplete` attribute
//     names a recognized browser-autofill target (name, email, tel,
//     given-name, family-name, street-address, postal-code, etc.).
//     This is intentionally permissive — accept FPs on the autofill
//     side rather than risk annotating real autofill output.
//   - For <select>: skip the GEO allowlist (country / state / region /
//     province / county / locale / currency). Country-of-residence
//     defaults set by geo-IP are legitimate.
//   - For radio groups: only annotate when at least one radio in the
//     group reports `checked` at scan time. The group-focused skip
//     covers the case where the user clicked a sibling before our
//     scan.

import { isCheckoutUrl } from "../lib/checkout-url";
import {
  FORM_PREFILL_ANNOTATED_ATTR as FLAGGED_ATTR,
  RULE_ATTR,
} from "../lib/dom-markers";
import { createRuleLogger } from "../lib/log";
import { createSubtreeWatcher } from "../lib/subtree-watcher";
import { traceMutation } from "../lib/trace-mutation";
import type { Rule } from "./types";

const RULE_ID = "form-prefill-annotate" as const;
const log = createRuleLogger(RULE_ID);

const FLAG_CLASS = "abs-form-prefill-annotate";

// Reject after this many chips per form. Long forms (saved-card managers,
// admin panels that happen to live under /order/*) would otherwise carry
// chip clutter that drowns out the signal. Eight is well above the
// typical checkout (name / email / phone / address line × few / postal /
// shipping speed / tip).
const MAX_CHIPS_PER_FORM = 8;

// Recognized autocomplete tokens that imply browser/password-manager
// autofill. When the `autocomplete` attribute names one of these, we
// treat the prefill as legitimate. List intentionally short — we cover
// the common shipping/billing checkout fields and skip more exotic
// tokens (`cc-*`, `one-time-code`, etc.) because the rule never runs on
// payment iframes anyway and a credit-card autofill is already off-
// scope.
const AUTOFILL_TOKENS: ReadonlySet<string> = new Set([
  "name",
  "given-name",
  "additional-name",
  "family-name",
  "honorific-prefix",
  "honorific-suffix",
  "nickname",
  "username",
  "email",
  "tel",
  "tel-national",
  "tel-area-code",
  "tel-local",
  "street-address",
  "address-line1",
  "address-line2",
  "address-line3",
  "address-level1",
  "address-level2",
  "address-level3",
  "address-level4",
  "country",
  "country-name",
  "postal-code",
  "bday",
  "bday-day",
  "bday-month",
  "bday-year",
  "organization",
  "organization-title",
]);

// Names / ids / labels that indicate a geo-driven <select> (country,
// state, province, region, etc.). Geo-IP defaults are legitimate and
// annotating them would generate noise on every international checkout.
//
// The boundary class is `[^A-Za-z]` instead of `\b` because real-world
// selects use snake_case ids like `user_country_picker` — `\b` doesn't
// fire at `_country_` since `_` is a word character.
const GEO_SELECT_RE =
  /(?:^|[^A-Za-z])(?:country|state|province|region|county|locale|language|currency|territory|prefecture)(?:[^A-Za-z]|$)/i;

// Text input types we consider. `password` is excluded — a pre-filled
// password is either restored by a password manager (legitimate) or a
// site bug we shouldn't comment on. `search` is excluded — search boxes
// aren't preselection vectors. `hidden` is handled by the companion
// `hidden-affiliate-sanitize` rule.
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "email",
  "tel",
  "number",
  "url",
]);

// jsdom (the test runtime) doesn't expose the global `CSS` object, so
// `CSS.escape` would throw `ReferenceError` in unit tests that build a
// <select> with an `id` attribute. Fall back to a conservative literal
// matcher when CSS.escape isn't available — element ids in real pages
// rarely contain quote chars and any id with quotes was never going to
// pair with a `<label for>` lookup anyway.
function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replaceAll(/["\\]/g, String.raw`\$&`);
}

// Track controls that have been focused (or are currently focused) at
// any point since the rule started observing. We don't annotate a
// control the user has already interacted with — what's in the value
// then is user-entered, not a server-pushed prefill.
const focusedControls = new WeakSet<HTMLElement>();
let focusInListener: ((event: FocusEvent) => void) | null = null;

function ensureFocusTracking(): void {
  if (focusInListener !== null) {
    return;
  }
  focusInListener = (event) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      focusedControls.add(target);
    }
  };
  // capture:true so we record focusin before any page handler can stop
  // propagation.
  document.addEventListener("focusin", focusInListener, { capture: true });
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    focusedControls.add(active);
  }
}

function teardownFocusTracking(): void {
  if (focusInListener === null) {
    return;
  }
  document.removeEventListener("focusin", focusInListener, true);
  focusInListener = null;
}

function isFlaggedAlready(element: Element): boolean {
  return element.hasAttribute(FLAGGED_ATTR);
}

function readAutocompleteTokens(element: HTMLElement): readonly string[] {
  const attribute = element.getAttribute("autocomplete");
  if (attribute === null) {
    return [];
  }
  return attribute
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function hasRecognizedAutofillToken(element: HTMLElement): boolean {
  for (const token of readAutocompleteTokens(element)) {
    if (AUTOFILL_TOKENS.has(token)) {
      return true;
    }
  }
  return false;
}

// Read the field's accessible label-ish text for the GEO check on
// <select>. Cheap concatenation across name/id/aria-label and a single
// associated <label> if reachable. We don't walk the full a11y tree —
// the GEO check only needs a recognizable signal.
//
// `Element.textContent` is typed `string` (not `string | null`) by the
// project's TypeScript lib, and `@typescript-eslint/no-unnecessary-
// condition` flags `?? ""` as a redundant guard. Per the DOM spec only
// `Document` and `DocumentType` nodes ever return `null`, neither of
// which can flow through these selectors. Same convention as
// `hidden-fee-annotate.ts` and `cart-addon-annotate.ts`.
function readSelectLabelHints(element: HTMLSelectElement): string {
  const parts: string[] = [];
  const name = element.getAttribute("name");
  if (name !== null) {
    parts.push(name);
  }
  const id = element.id;
  if (id.length > 0) {
    parts.push(id);
  }
  const aria = element.getAttribute("aria-label");
  if (aria !== null) {
    parts.push(aria);
  }
  if (id.length > 0) {
    const document_ = element.ownerDocument;
    const label = document_.querySelector(
      `label[for="${escapeAttributeValue(id)}"]`,
    );
    if (label !== null) {
      parts.push(label.textContent);
    }
  }
  // <select> inside a wrapping <label>.
  const wrappingLabel = element.closest("label");
  if (wrappingLabel !== null) {
    parts.push(wrappingLabel.textContent);
  }
  return parts.join(" ");
}

export function isGeoSelect(element: HTMLSelectElement): boolean {
  return GEO_SELECT_RE.test(readSelectLabelHints(element));
}

function isVisibleControl(element: HTMLElement): boolean {
  // Cheap check: tab a hidden-by-type input out, and skip explicit
  // `display:none` / `visibility:hidden` styles. We don't compute the
  // full rendered box — that'd cost layout. The chip we'd attach
  // wouldn't render on an invisible form anyway.
  if (element instanceof HTMLInputElement && element.type === "hidden") {
    return false;
  }
  if (element.hidden) {
    return false;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style === undefined) {
    return true;
  }
  return style.display !== "none" && style.visibility !== "hidden";
}

function findChipTarget(element: HTMLElement): HTMLElement {
  // The chip goes just above the field rather than inside it because
  // <input>/<select> have no child text rendering. Walk up to the first
  // useful insertion point — a wrapping <label>, a `.field` / `.form-
  // row` wrapper, or just the parent element.
  const wrappingLabel = element.closest("label");
  if (wrappingLabel !== null && wrappingLabel instanceof HTMLElement) {
    return wrappingLabel;
  }
  const parent = element.parentElement;
  return parent ?? element;
}

function buildChip(text: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = FLAG_CLASS;
  chip.setAttribute(RULE_ATTR, RULE_ID);
  // Inline styling so the chip is visible even on pages that strip
  // extension stylesheets. Block layout puts the chip on its own line
  // above the field.
  chip.style.display = "block";
  chip.style.padding = "2px 6px";
  chip.style.margin = "0 0 4px 0";
  chip.style.border = "1px solid #b00";
  chip.style.background = "#fff5f5";
  chip.style.color = "#900";
  chip.style.font = "12px/1.4 system-ui, sans-serif";
  chip.style.fontStyle = "italic";
  chip.textContent = text;
  return chip;
}

function countChipsInForm(form: HTMLElement | null): number {
  if (form === null) {
    return 0;
  }
  return form.querySelectorAll(`.${FLAG_CLASS}`).length;
}

function getEnclosingForm(element: HTMLElement): HTMLElement | null {
  const form = element.closest("form");
  return form instanceof HTMLElement ? form : null;
}

interface TextCandidate {
  kind: "text";
  control: HTMLInputElement;
  inputType: string;
}

interface SelectCandidate {
  kind: "select";
  control: HTMLSelectElement;
  selectedLabel: string;
}

interface RadioCandidate {
  kind: "radio";
  // The fieldset / wrapper that we'll chip. Picked once per radio group.
  target: HTMLElement;
  control: HTMLInputElement;
  groupName: string;
  selectedLabel: string;
}

type Candidate = TextCandidate | SelectCandidate | RadioCandidate;

function readTextCandidate(input: HTMLInputElement): TextCandidate | null {
  const type = input.type.toLowerCase();
  if (!TEXT_INPUT_TYPES.has(type)) {
    return null;
  }
  if (input.disabled || input.readOnly) {
    return null;
  }
  if (!isVisibleControl(input)) {
    return null;
  }
  if (focusedControls.has(input)) {
    return null;
  }
  if (hasRecognizedAutofillToken(input)) {
    return null;
  }
  // `autocomplete="off"` is intentionally not a skip signal — a site
  // disabling browser autofill while still serving a value is exactly
  // the prefill case we want to flag, so we fall through here.
  // Read live `.value` rather than the `value` attribute. The attribute
  // is only set when SSR templated the prefill in HTML; framework-
  // rendered defaults (React `defaultValue`, Vue `v-model` initialState,
  // jQuery `.val()`) populate the live property without writing an
  // attribute. The agent's DOM snapshot reads the live property too, so
  // our scan should match what the agent will see. The focused-set
  // skip above already covers the "user typed it" case.
  if (input.value.trim().length === 0) {
    return null;
  }
  return { kind: "text", control: input, inputType: type };
}

function readSelectCandidate(
  select: HTMLSelectElement,
): SelectCandidate | null {
  if (select.disabled) {
    return null;
  }
  if (!isVisibleControl(select)) {
    return null;
  }
  if (focusedControls.has(select)) {
    return null;
  }
  if (isGeoSelect(select)) {
    return null;
  }
  // Multi-selects don't have a "default option" notion in the same way;
  // they ship with whatever rows the page chose to mark `selected`.
  // Annotating those would add noise without surfacing a sneak pattern.
  if (select.multiple) {
    return null;
  }
  // Use the live `selectedIndex` rather than scanning for `<option
  // selected>` because framework defaults (React `<select
  // defaultValue=…>`, Vue `v-model` initialState) populate the property
  // without writing the attribute. The focused-set skip above already
  // covers the "user changed it" case before our scan.
  if (select.selectedIndex <= 0) {
    return null;
  }
  const option = select.options[select.selectedIndex];
  if (option === undefined) {
    return null;
  }
  const text = option.textContent.trim();
  const selectedLabel = text.length > 0 ? text : option.value.trim();
  return { kind: "select", control: select, selectedLabel };
}

function findRadioGroupTarget(radio: HTMLInputElement): HTMLElement {
  const fieldset = radio.closest("fieldset");
  if (fieldset instanceof HTMLElement) {
    return fieldset;
  }
  // role="radiogroup" container — common in ARIA-styled designs that
  // wrap native radios in a div.
  let cursor: HTMLElement | null = radio.parentElement;
  while (cursor !== null) {
    if (cursor.getAttribute("role") === "radiogroup") {
      return cursor;
    }
    cursor = cursor.parentElement;
  }
  return radio.parentElement ?? radio;
}

function readRadioCandidate(radio: HTMLInputElement): RadioCandidate | null {
  if (radio.type.toLowerCase() !== "radio") {
    return null;
  }
  if (radio.disabled) {
    return null;
  }
  if (!isVisibleControl(radio)) {
    return null;
  }
  // Live property covers framework-rendered defaults (React
  // `defaultChecked`, Vue `v-model`) the same way the agent's snapshot
  // would see them. The group-focused skip below covers the case
  // where the user clicked any sibling in the group before our scan.
  if (!radio.checked) {
    return null;
  }
  const groupName = radio.name;
  // Radios without a `name` aren't a group — they're standalone
  // toggles. We don't have the "did the agent need to keep some option
  // selected?" concern for those, so leave them to the checkbox rule's
  // domain (it doesn't touch them either; see issue #121).
  if (groupName.length === 0) {
    return null;
  }
  const target = findRadioGroupTarget(radio);
  // Multiple checked radios with the same `name` is a malformed group
  // — the browser will resolve to the last-checked one, but we only
  // annotate once.
  if (isFlaggedAlready(target)) {
    return null;
  }
  // If the user clicked any radio in the group before our scan, treat
  // the group's selection as user-driven. `radio.form` scopes the
  // lookup so distinct `<form>`s with the same `name` don't collide.
  const root = radio.form ?? radio.ownerDocument;
  for (const sibling of root.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${escapeAttributeValue(groupName)}"]`,
  )) {
    if (focusedControls.has(sibling)) {
      return null;
    }
  }
  let selectedLabel = radio.value;
  if (radio.id.length > 0) {
    const label = radio.ownerDocument.querySelector(
      `label[for="${escapeAttributeValue(radio.id)}"]`,
    );
    if (label !== null) {
      const text = label.textContent.trim();
      if (text.length > 0) {
        selectedLabel = text;
      }
    }
  } else {
    const wrappingLabel = radio.closest("label");
    if (wrappingLabel !== null) {
      const text = wrappingLabel.textContent.trim();
      if (text.length > 0) {
        selectedLabel = text;
      }
    }
  }
  return {
    kind: "radio",
    target,
    control: radio,
    groupName,
    selectedLabel,
  };
}

function collectCandidates(root: ParentNode): Candidate[] {
  const out: Candidate[] = [];
  const seenRadioGroups = new Set<string>();

  for (const input of root.querySelectorAll<HTMLInputElement>(
    `input:not([${FLAGGED_ATTR}])`,
  )) {
    if (!input.isConnected) {
      continue;
    }
    const type = input.type.toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) {
      const candidate = readTextCandidate(input);
      if (candidate !== null) {
        out.push(candidate);
      }
      continue;
    }
    if (type === "radio") {
      // Only consider the first checked radio per group; the chip lives
      // on the group container, not on individual radios.
      const formScope = getEnclosingForm(input);
      const scopeKey =
        formScope === null ? "" : `${formScope.id || "_form_"}::`;
      const groupKey = `${scopeKey}${input.name}`;
      if (seenRadioGroups.has(groupKey)) {
        continue;
      }
      const candidate = readRadioCandidate(input);
      if (candidate === null) {
        continue;
      }
      seenRadioGroups.add(groupKey);
      out.push(candidate);
    }
  }

  for (const select of root.querySelectorAll<HTMLSelectElement>(
    `select:not([${FLAGGED_ATTR}])`,
  )) {
    if (!select.isConnected) {
      continue;
    }
    const candidate = readSelectCandidate(select);
    if (candidate !== null) {
      out.push(candidate);
    }
  }

  return out;
}

function chipTextFor(candidate: Candidate): string {
  switch (candidate.kind) {
    case "text": {
      return `[abs: pre-populated ${candidate.inputType} field — verify before submit]`;
    }
    case "select": {
      // Quote the label so the agent's snapshot reader sees the
      // specific default that was set — but without the field's name
      // (preselection is about *what* is the default, not which field).
      // Trim long labels so a verbose option doesn't explode the chip.
      const label = candidate.selectedLabel.slice(0, 60);
      return `[abs: select default "${label}" is not the first option — verify before submit]`;
    }
    case "radio": {
      const label = candidate.selectedLabel.slice(0, 60);
      return `[abs: radio "${label}" pre-selected — verify before submit]`;
    }
  }
}

function flag(candidate: Candidate): void {
  const target =
    candidate.kind === "radio"
      ? candidate.target
      : findChipTarget(candidate.control);
  if (!target.isConnected) {
    return;
  }

  const form = getEnclosingForm(target);
  if (countChipsInForm(form) >= MAX_CHIPS_PER_FORM) {
    return;
  }

  traceMutation({ ruleId: RULE_ID, kind: "flag", target }, () => {
    // Stamp the control itself so a later scan doesn't re-evaluate
    // it, and stamp the target so we don't append a sibling chip in
    // case the same target is selected by two different candidates
    // (the seenRadioGroups guard already prevents that for radios
    // within one scan; the target stamp is the cross-scan guard for
    // radios).
    candidate.control.setAttribute(FLAGGED_ATTR, "");
    if (target !== candidate.control) {
      target.setAttribute(FLAGGED_ATTR, "");
    }

    const chip = buildChip(chipTextFor(candidate));
    target.prepend(chip);
  });
}

function scanAndFlag(root: ParentNode): void {
  if (!isCheckoutUrl(location.href)) {
    return;
  }
  const candidates = collectCandidates(root);
  if (candidates.length === 0) {
    return;
  }
  ensureFocusTracking();
  let count = 0;
  for (const candidate of candidates) {
    flag(candidate);
    count++;
  }
  log.info("form prefills flagged", {
    count,
    kinds: candidates.map((c) => c.kind),
    url: location.href,
  });
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      scanAndFlag(root);
    }
  },
});

function apply(root: ParentNode): void {
  ensureFocusTracking();
  scanAndFlag(root);
  watcher.start(root);
}

export const formPrefillAnnotateRule = {
  id: RULE_ID,
  label: "Annotate Form Prefills (Experimental)",
  description:
    "On checkout pages, flag pre-populated text/email/tel/number fields, non-first <select> defaults, and pre-selected radio groups with a visible annotation. Values are not changed — the agent reads the chip and decides whether to overwrite.",
  apply,
  teardown: () => {
    watcher.stop();
    teardownFocusTracking();
  },
} satisfies Rule;
