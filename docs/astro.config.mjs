// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://pixiebrix.github.io",
  base: "/agent-browser-shield/",
  integrations: [
    starlight({
      title: "agent-browser-shield",
      description:
        "Browser extension with 30+ rules for keeping your AI agent safe while browsing.",
      components: {
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/pixiebrix/agent-browser-shield",
        },
      ],
      sidebar: [
        { label: "Install", slug: "install" },
        { label: "Rules reference", slug: "rules" },
        { label: "Use with browser-use", slug: "browser-use" },
        { label: "Use with Browserbase (Python)", slug: "browserbase-python" },
        { label: "Use with OpenClaw", slug: "openclaw" },
        { label: "Use with Hermes Agent", slug: "hermes-agent" },
      ],
    }),
  ],
});
