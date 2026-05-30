import { walkTextNodes } from "../lib/dom-utils";
import { type InlineMatch, replaceMatchesInTextNode } from "../lib/placeholder";
import type { Rule } from "./types";

const RULE_ID = "secrets-mask" as const;
// Shortest provider-prefixed pattern (npm_<32>) is 36 chars; cap below that
// to skip prose nodes early without losing real candidates.
const MIN_TEXT_LENGTH = 16;

interface NamedPattern {
  regex: RegExp;
  label: string;
}

// Provider-prefixed credentials. Patterns are anchored on the prefix to keep
// false-positive rates low even with very loose tail character classes.
const PREFIXED_SECRETS: NamedPattern[] = [
  { regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, label: "[aws key hidden]" },
  {
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    label: "[google api key hidden]",
  },
  {
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g,
    label: "[github token hidden]",
  },
  {
    regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    label: "[slack token hidden]",
  },
  {
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    label: "[anthropic key hidden]",
  },
  {
    regex: /\b(?:sk|pk|rk|whsec)_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
    label: "[stripe key hidden]",
  },
  // OpenAI and generic `sk-...` keys. Listed after Stripe/Anthropic so the
  // more specific labels win on overlap.
  { regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g, label: "[api key hidden]" },
  { regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, label: "[gitlab token hidden]" },
  {
    regex: /\bhf_[A-Za-z0-9]{30,}\b/g,
    label: "[huggingface token hidden]",
  },
  { regex: /\bnpm_[A-Za-z0-9]{36}\b/g, label: "[npm token hidden]" },
];

// Three base64url segments separated by dots, header conventionally starts
// with `eyJ` (the base64 of `{"`).
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

// PEM-encoded private keys. `[\s\S]*?` so it spans newlines lazily.
const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/g;

// Candidate windows for entropy scoring. Restricted to typical token alphabets
// (base64url / base64) plus hex; word boundaries keep us off prose.
const ENTROPY_CANDIDATE = /[A-Za-z0-9+/=_-]{32,}/g;
const HEX_CANDIDATE = /\b[0-9a-fA-F]{32,}\b/g;

const BASE64_ENTROPY_THRESHOLD = 4.5;
const HEX_ENTROPY_THRESHOLD = 3.0;

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function collectPattern(
  text: string,
  pattern: NamedPattern,
  matches: InlineMatch[],
): void {
  for (const m of text.matchAll(pattern.regex)) {
    if (m.index === undefined) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      label: pattern.label,
    });
  }
}

function collectEntropy(text: string, matches: InlineMatch[]): void {
  for (const m of text.matchAll(ENTROPY_CANDIDATE)) {
    if (m.index === undefined) continue;
    if (shannonEntropy(m[0]) < BASE64_ENTROPY_THRESHOLD) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      label: "[secret hidden]",
    });
  }
  for (const m of text.matchAll(HEX_CANDIDATE)) {
    if (m.index === undefined) continue;
    if (shannonEntropy(m[0]) < HEX_ENTROPY_THRESHOLD) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      label: "[secret hidden]",
    });
  }
}

function collectMatches(text: string): InlineMatch[] {
  const matches: InlineMatch[] = [];

  for (const pattern of PREFIXED_SECRETS) {
    collectPattern(text, pattern, matches);
  }
  collectPattern(text, { regex: JWT_PATTERN, label: "[jwt hidden]" }, matches);
  collectPattern(
    text,
    { regex: PRIVATE_KEY_PATTERN, label: "[private key hidden]" },
    matches,
  );
  collectEntropy(text, matches);

  // Prefer the earliest-starting match, and on tie prefer the longest so a
  // specific provider pattern wins over the generic entropy fallback.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: InlineMatch[] = [];
  for (const match of matches) {
    const last = merged[merged.length - 1];
    if (last && match.start < last.end) continue;
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

export const secretsMaskRule = {
  id: RULE_ID,
  label: "Mask Secrets",
  description:
    "Hide API keys, tokens, JWTs, private keys, and other high-entropy credentials.",
  defaultEnabled: true,
  apply,
} satisfies Rule;
