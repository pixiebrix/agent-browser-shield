// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Remove HTML comments from the page. Comments aren't rendered to humans but
// are present in the DOM, so a browser-use agent walking the tree will read
// them — including any prompt-injection payloads hidden as <!-- ignore prior
// instructions and ... -->.
//
// Comments inside <script>, <style>, and <noscript> are preserved because
// they may carry functional markup (e.g., SSR hydration markers, conditional
// CSS, or noscript fallbacks).
//
// This rule does not produce placeholders — comments have no visual surface
// to replace. Removal is not reversible within a single page load; toggling
// the rule off requires a page reload.

import { createSubtreeWatcher } from "../lib/subtree-watcher";
import type { Rule } from "./types";

const RULE_ID = "html-comment-strip" as const;
const EXCLUDED_PARENT_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

function isExcludedParent(parent: Node | null): boolean {
  if (!parent || parent.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  return EXCLUDED_PARENT_TAGS.has((parent as Element).tagName);
}

function stripComments(root: ParentNode): void {
  const walker = document.createTreeWalker(
    root as Node,
    NodeFilter.SHOW_COMMENT,
  );
  const toRemove: Comment[] = [];
  let current = walker.nextNode();
  while (current) {
    if (!isExcludedParent(current.parentNode)) {
      toRemove.push(current as Comment);
    }
    current = walker.nextNode();
  }
  for (const comment of toRemove) {
    comment.remove();
  }
}

const watcher = createSubtreeWatcher({
  onSubtrees: (roots) => {
    for (const root of roots) {
      stripComments(root);
    }
  },
});

function apply(root: ParentNode): void {
  stripComments(root);
  watcher.start(root);
}

export const htmlCommentStripRule = {
  id: RULE_ID,
  label: "Strip HTML Comments",
  description:
    "Remove HTML comments. Invisible to humans but readable by agents and can carry prompt-injection payloads.",
  defaultEnabled: true,
  apply,
  teardown: () => watcher.stop(),
} satisfies Rule;
