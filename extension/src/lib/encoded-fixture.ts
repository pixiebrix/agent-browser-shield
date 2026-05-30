// Base64 decode helper for adversarial fixture text.
//
// Several files in this repo legitimately need to embed phrases that look
// like prompt-injection attacks — the rule patterns in
// `rules/prompt-injection-hide.ts` (which must spell out the phrases they
// match), and the test fixtures in `rules/__tests__/*.test.ts` (which
// assert that the rules correctly identify those phrases). Reading those
// strings in plain text trips up downstream coding agents that scan the
// source.
//
// We store them base64-encoded and decode at module load. This is purely
// a readability concern — the decoded values are identical to the
// originals, and the encoding adds no security. `atob` is a content-script
// global (and available in Node 16+), so no polyfill is needed.
export function decode(encoded: string): string {
  return atob(encoded);
}
