// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import path from "node:path";

const RULE_FILE_REGEX = /[/\\]src[/\\]rules[/\\][^/\\]+\.tsx?$/;

function isRuleFile(filename) {
  if (!RULE_FILE_REGEX.test(filename)) {
    return false;
  }
  const base = path.basename(filename);
  if (base === "index.ts" || base === "types.ts") {
    return false;
  }
  if (base.endsWith(".generated.ts") || base.endsWith(".generated.tsx")) {
    return false;
  }
  return true;
}

function expectedId(filename) {
  const base = path.basename(filename);
  return base.replace(/\.tsx?$/, "");
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Rule files in src/rules/ must declare an id matching their filename.",
    },
    schema: [],
    messages: {
      mismatch: 'Rule id "{{actual}}" does not match filename "{{expected}}".',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isRuleFile(filename)) {
      return {};
    }
    const expected = expectedId(filename);

    function check(node, value) {
      if (typeof value !== "string") {
        return;
      }
      if (value !== expected) {
        context.report({
          node,
          messageId: "mismatch",
          data: { actual: value, expected },
        });
      }
    }

    return {
      // const RULE_ID = "...";
      'VariableDeclarator[id.name="RULE_ID"]'(node) {
        if (node.init && node.init.type === "Literal") {
          check(node.init, node.init.value);
        } else if (
          node.init &&
          node.init.type === "TSAsExpression" &&
          node.init.expression.type === "Literal"
        ) {
          check(node.init.expression, node.init.expression.value);
        }
      },
      // { id: "...", ... } — object property in a rule factory call or
      // exported rule object literal.
      'Property[key.name="id"][value.type="Literal"]'(node) {
        check(node.value, node.value.value);
      },
    };
  },
};

export default rule;
