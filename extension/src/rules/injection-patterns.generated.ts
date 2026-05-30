// AUTO-GENERATED — do not edit by hand.
// Source: extension/data/injection-patterns.yaml
// Regenerate with `bun run build-injection-patterns`.

export const INJECTION_PATTERNS: readonly RegExp[] = [
  // instruction-override-ignore
  new RegExp("\\b(?:ignore|disregard|forget)\\s+(?:all\\s+)?(?:the\\s+)?(?:previous|prior|above|preceding|earlier|foregoing)\\s+(?:instructions?|prompts?|messages?|directives?|commands?|rules?|directions?|context|conversation|system\\s+prompt)\\b", "i"),
  // guardrail-bypass
  new RegExp("\\b(?:override|bypass|disable|circumvent)\\s+(?:all\\s+)?(?:your\\s+|the\\s+)?(?:safety\\s+|security\\s+|system\\s+|content\\s+)?(?:instructions?|filters?|guardrails?|guidelines?|restrictions?|safeguards?|policies?)\\b", "i"),
  // persona-declarative
  new RegExp("\\byou\\s+are\\s+(?:now\\s+)?(?:an?\\s+)?(?:DAN|do\\s+anything\\s+now|jailbroken|unrestricted|uncensored|unfiltered)\\b", "i"),
  // persona-imperative
  new RegExp("\\b(?:act|pretend|behave|roleplay|respond)\\s+as\\s+(?:if\\s+you\\s+(?:are|were)\\s+)?(?:an?\\s+)?(?:DAN|do\\s+anything\\s+now|jailbroken|unrestricted|uncensored|unfiltered)\\b", "i"),
  // mode-activation
  new RegExp("\\b(?:developer|god|admin|sudo|debug)\\s+mode\\s+(?:enabled|activated|on|engaged|unlocked)\\b", "i"),
  // chatml-im-token
  new RegExp("<\\|im_(?:start|end)\\|>", "i"),
  // chatml-endoftext-token
  new RegExp("<\\|endoftext\\|>", "i"),
  // llama-inst-token
  new RegExp("\\[\\/?INST\\]", ""),
  // llama-sys-token
  new RegExp("<<\\/?SYS>>", ""),
  // system-prompt-directive
  new RegExp("\\bsystem\\s+prompt\\s*[:=]", "i"),
  // new-directive-prefix
  new RegExp("\\bnew\\s+(?:instructions?|directives?|task|prompt|rules?)\\s*:", "i"),
];
