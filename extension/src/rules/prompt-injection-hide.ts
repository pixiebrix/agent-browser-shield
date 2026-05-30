// Hide page sections containing phrases commonly used in prompt-injection
// attacks (instruction overrides, jailbreak personas, chat-template tokens).
// Regex-based heuristic for v1; an ML-based classifier is planned to replace
// this once we can afford the latency budget.

import {
  filterToOutermost,
  isInsidePlaceholder,
  walkTextNodes,
} from "../lib/dom-utils";
import { replaceWithBlockPlaceholder } from "../lib/placeholder";
import type { Rule } from "./types";

const RULE_ID = "prompt-injection-hide" as const;
const MIN_TEXT_LENGTH = 8;

// Patterns are tuned for precision over recall — false positives are visible
// to the user as hidden content, and a regex layer should not be aggressive.
const INJECTION_PATTERNS: RegExp[] = [
  // "Ignore/disregard/forget (all) (the) previous/prior/above ..."
  /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|preceding|earlier|foregoing)\s+(?:instructions?|prompts?|messages?|directives?|commands?|rules?|directions?|context|conversation|system\s+prompt)\b/i,
  // "Override/bypass/disable (your/the) (safety/system) instructions/guardrails/..."
  /\b(?:override|bypass|disable|circumvent)\s+(?:all\s+)?(?:your\s+|the\s+)?(?:safety\s+|security\s+|system\s+|content\s+)?(?:instructions?|filters?|guardrails?|guidelines?|restrictions?|safeguards?|policies?)\b/i,
  // "You are now (DAN/unrestricted/jailbroken/uncensored/...)"
  /\byou\s+are\s+(?:now\s+)?(?:an?\s+)?(?:DAN|do\s+anything\s+now|jailbroken|unrestricted|uncensored|unfiltered)\b/i,
  // "Act/pretend/roleplay as (DAN/unrestricted/...)"
  /\b(?:act|pretend|behave|roleplay|respond)\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:an?\s+)?(?:DAN|do\s+anything\s+now|jailbroken|unrestricted|uncensored|unfiltered)\b/i,
  // Mode-activation jailbreak phrasing
  /\b(?:developer|god|admin|sudo|debug)\s+mode\s+(?:enabled|activated|on|engaged|unlocked)\b/i,
  // ChatML / OpenAI special tokens
  /<\|im_(?:start|end)\|>/i,
  /<\|endoftext\|>/i,
  // Llama / instruct special tokens
  /\[\/?INST\]/,
  /<<\/?SYS>>/,
  // System-prompt directive markers
  /\bsystem\s+prompt\s*[:=]/i,
  // "New instructions: ..." — common injection prefix
  /\bnew\s+(?:instructions?|directives?|task|prompt|rules?)\s*:/i,
];

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
