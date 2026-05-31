// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Local ESLint plugin for project-specific rules. New rules go in this
// directory as one file each, then are exported below.

import ruleIdMatchesFilename from "./rule-id-matches-filename.js";

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "agent-browser-shield" },
  rules: {
    "rule-id-matches-filename": ruleIdMatchesFilename,
  },
};

export default plugin;
