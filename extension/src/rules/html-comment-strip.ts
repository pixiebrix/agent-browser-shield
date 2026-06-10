// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Scrub HTML comments that carry prompt-injection text. Comments aren't
// rendered to humans but are present in the DOM, so a browser-use agent
// walking the tree will read them — including any prompt-injection payloads
// hidden as <!-- ignore prior instructions and ... -->.
//
// Comments inside <script>, <style>, and <noscript> are preserved because
// they may carry functional markup (e.g., SSR hydration markers, conditional
// CSS, or noscript fallbacks).
//
// On a match we clear the comment's `data` rather than detach the Comment
// node. React 18+ uses Comment nodes as Suspense / hydration / streaming
// boundary markers (`<!--$-->`, `<!--/$-->`, `<!--$?-->`, etc.) — detaching
// what looks like an ordinary comment can strand a Suspense boundary or
// break a hydration step. We also limit scrubbing to comments that match
// the injection pattern set: framework markers don't match (they're short
// syntactic strings, not prose), so they're left alone naturally.
//
// This rule does not produce placeholders — comments have no visual surface
// to replace. The scrub is not reversible within a single page load;
// toggling the rule off requires a page reload to recover the original
// comment text.

import { createScanRule } from "../lib/scan-rule";
import { traceMutation } from "../lib/trace-mutation";
import { INJECTION_PATTERNS } from "./injection-patterns.generated";

const RULE_ID = "html-comment-strip" as const;
const EXCLUDED_PARENT_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

function isExcludedParent(parent: Node | null): boolean {
  if (parent?.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  return EXCLUDED_PARENT_TAGS.has((parent as Element).tagName);
}

function containsInjection(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function stripComments(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let current = walker.nextNode();
  while (current) {
    const comment = current as Comment;
    // Advance before any mutation. `comment.data = ""` does not change tree
    // structure, but the explicit step keeps the loop trivially safe under
    // future refactors.
    current = walker.nextNode();
    if (isExcludedParent(comment.parentNode)) {
      continue;
    }
    const { data } = comment;
    if (data.length === 0) {
      continue;
    }
    if (containsInjection(data)) {
      // Comments don't have outerHTML, but the parent's outerHTML does
      // include the comment markup (`<!-- … -->`) so before/after on the
      // parent shows the scrub.
      const parent = comment.parentElement;
      if (parent === null) {
        comment.data = "";
      } else {
        traceMutation(
          { ruleId: RULE_ID, kind: "strip", target: parent },
          () => {
            comment.data = "";
          },
        );
      }
    }
  }
}

export const htmlCommentStripRule = createScanRule({
  id: RULE_ID,
  scan: stripComments,
  label: "Strip HTML Comments",
  description:
    "Blank HTML comments that carry prompt-injection text. Invisible to humans but readable by agents.",
});
