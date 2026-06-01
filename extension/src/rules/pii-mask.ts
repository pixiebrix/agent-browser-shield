// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { walkTextNodes } from "../lib/dom-utils";
import type { InlineMatch } from "../lib/placeholder";
import { replaceMatchesInTextNode } from "../lib/placeholder";
import type { Rule } from "./types";

const RULE_ID = "pii-mask" as const;
const MIN_TEXT_LENGTH = 9; // shortest pattern is a hyphenated 9-digit SSN.

const CC_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_PATTERN =
  /(?<![\d.])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g;

function passesLuhn(raw: string): boolean {
  const digits = raw.replaceAll(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function collectMatches(text: string): InlineMatch[] {
  const matches: InlineMatch[] = [];

  for (const m of text.matchAll(CC_PATTERN)) {
    if (!passesLuhn(m[0])) {
      continue;
    }
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      label: "[card hidden]",
    });
  }
  for (const m of text.matchAll(SSN_PATTERN)) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      label: "[ssn hidden]",
    });
  }
  for (const m of text.matchAll(PHONE_PATTERN)) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      label: "[phone hidden]",
    });
  }

  matches.sort((a, b) => a.start - b.start);
  const merged: InlineMatch[] = [];
  for (const match of matches) {
    const last = merged.at(-1);
    if (last && match.start < last.end) {
      continue;
    }
    merged.push(match);
  }
  return merged;
}

function apply(root: ParentNode): void {
  for (const node of walkTextNodes(root, { minLength: MIN_TEXT_LENGTH })) {
    const matches = collectMatches(node.nodeValue ?? "");
    if (matches.length > 0) {
      replaceMatchesInTextNode(node, matches, RULE_ID);
    }
  }
}

export const piiMaskRule = {
  id: RULE_ID,
  label: "Mask PII",
  description: "Hide credit card numbers, phone numbers, and SSNs.",
  apply,
} satisfies Rule;
