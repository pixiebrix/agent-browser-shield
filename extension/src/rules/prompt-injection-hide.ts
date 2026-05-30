// Hide page sections containing phrases commonly used in prompt-injection
// attacks (instruction overrides, jailbreak personas, chat-template tokens).
// Regex-based heuristic for v1; an ML-based classifier is planned to replace
// this once we can afford the latency budget.
//
// Pattern sources are base64-encoded so coding agents reading this file
// don't have to scan literal adversarial phrasing. See
// `lib/encoded-fixture.ts` for the helper. The decoded sources are
// compiled into RegExp once at module load and never logged anywhere.

import {
  filterToOutermost,
  isInsidePlaceholder,
  walkTextNodes,
} from "../lib/dom-utils";
import { decode } from "../lib/encoded-fixture";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import type { Rule } from "./types";

const RULE_ID = "prompt-injection-hide" as const;
const MIN_TEXT_LENGTH = 8;

// Each entry is [base64-encoded RegExp source, RegExp flags].
// Tuned for precision over recall — false positives are visible to the user
// as hidden content, and a regex layer should not be aggressive. To inspect
// a pattern, decode the first element with `atob()` (or
// `lib/encoded-fixture#decode`).
const ENCODED_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  // "Ignore/disregard/forget (all) (the) previous/prior/above ..."
  [
    "XGIoPzppZ25vcmV8ZGlzcmVnYXJkfGZvcmdldClccysoPzphbGxccyspPyg/OnRoZVxzKyk/KD86cHJldmlvdXN8cHJpb3J8YWJvdmV8cHJlY2VkaW5nfGVhcmxpZXJ8Zm9yZWdvaW5nKVxzKyg/Omluc3RydWN0aW9ucz98cHJvbXB0cz98bWVzc2FnZXM/fGRpcmVjdGl2ZXM/fGNvbW1hbmRzP3xydWxlcz98ZGlyZWN0aW9ucz98Y29udGV4dHxjb252ZXJzYXRpb258c3lzdGVtXHMrcHJvbXB0KVxi",
    "i",
  ],
  // "Override/bypass/disable (your/the) (safety/system) instructions/guardrails/..."
  [
    "XGIoPzpvdmVycmlkZXxieXBhc3N8ZGlzYWJsZXxjaXJjdW12ZW50KVxzKyg/OmFsbFxzKyk/KD86eW91clxzK3x0aGVccyspPyg/OnNhZmV0eVxzK3xzZWN1cml0eVxzK3xzeXN0ZW1ccyt8Y29udGVudFxzKyk/KD86aW5zdHJ1Y3Rpb25zP3xmaWx0ZXJzP3xndWFyZHJhaWxzP3xndWlkZWxpbmVzP3xyZXN0cmljdGlvbnM/fHNhZmVndWFyZHM/fHBvbGljaWVzPylcYg==",
    "i",
  ],
  // "You are now (DAN/unrestricted/jailbroken/uncensored/...)"
  [
    "XGJ5b3VccythcmVccysoPzpub3dccyspPyg/OmFuP1xzKyk/KD86REFOfGRvXHMrYW55dGhpbmdccytub3d8amFpbGJyb2tlbnx1bnJlc3RyaWN0ZWR8dW5jZW5zb3JlZHx1bmZpbHRlcmVkKVxi",
    "i",
  ],
  // "Act/pretend/roleplay as (DAN/unrestricted/...)"
  [
    "XGIoPzphY3R8cHJldGVuZHxiZWhhdmV8cm9sZXBsYXl8cmVzcG9uZClccythc1xzKyg/OmlmXHMreW91XHMrKD86YXJlfHdlcmUpXHMrKT8oPzphbj9ccyspPyg/OkRBTnxkb1xzK2FueXRoaW5nXHMrbm93fGphaWxicm9rZW58dW5yZXN0cmljdGVkfHVuY2Vuc29yZWR8dW5maWx0ZXJlZClcYg==",
    "i",
  ],
  // Mode-activation jailbreak phrasing
  [
    "XGIoPzpkZXZlbG9wZXJ8Z29kfGFkbWlufHN1ZG98ZGVidWcpXHMrbW9kZVxzKyg/OmVuYWJsZWR8YWN0aXZhdGVkfG9ufGVuZ2FnZWR8dW5sb2NrZWQpXGI=",
    "i",
  ],
  // ChatML / OpenAI special tokens
  ["PFx8aW1fKD86c3RhcnR8ZW5kKVx8Pg==", "i"],
  ["PFx8ZW5kb2Z0ZXh0XHw+", "i"],
  // Llama / instruct special tokens
  ["XFtcLz9JTlNUXF0=", ""],
  ["PDxcLz9TWVM+Pg==", ""],
  // System-prompt directive markers
  ["XGJzeXN0ZW1ccytwcm9tcHRccypbOj1d", "i"],
  // Common injection-prefix
  [
    "XGJuZXdccysoPzppbnN0cnVjdGlvbnM/fGRpcmVjdGl2ZXM/fHRhc2t8cHJvbXB0fHJ1bGVzPylccyo6",
    "i",
  ],
] as const;

const INJECTION_PATTERNS: ReadonlyArray<RegExp> = ENCODED_PATTERNS.map(
  ([source, flags]) => new RegExp(decode(source), flags),
);

// Containers we consider a reasonable unit to hide. Walking up from the text
// node, we hide the closest matching ancestor — this keeps the placeholder
// scoped to the offending paragraph/list-item rather than the whole page.
const BLOCK_CONTAINER_SELECTOR =
  "p, li, blockquote, pre, td, dd, article, aside, section";

function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function findContainer(textNode: Text): HTMLElement | null {
  const parent = textNode.parentElement;
  if (!parent) return null;
  const block = parent.closest<HTMLElement>(BLOCK_CONTAINER_SELECTOR);
  if (block) return block;
  // No block-level ancestor — fall back to the text node's direct parent,
  // but never escalate to BODY/HTML (would hide the whole page).
  if (parent.tagName === "BODY" || parent.tagName === "HTML") return null;
  return parent;
}

function apply(root: ParentNode): void {
  const containers = new Set<HTMLElement>();
  for (const node of walkTextNodes(root, { minLength: MIN_TEXT_LENGTH })) {
    if (!containsInjection(node.nodeValue ?? "")) continue;
    const container = findContainer(node);
    if (container) containers.add(container);
  }

  for (const element of filterToOutermost(Array.from(containers))) {
    if (!element.isConnected) continue;
    if (isInsidePlaceholder(element)) continue;
    replaceWithBlockPlaceholder(
      element,
      RULE_ID,
      "[possible prompt injection hidden — click to reveal]",
    );
  }
}

export const promptInjectionHideRule = {
  id: RULE_ID,
  label: "Hide Prompt Injection",
  description:
    "Hide page sections containing phrases commonly used in prompt-injection attacks — instruction overrides, jailbreak personas, and chat-template tokens. Regex-based heuristic; an ML classifier is planned.",
  defaultEnabled: true,
  apply,
} satisfies Rule;
