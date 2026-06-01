// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

const LINKS = [
  { href: "https://pixiebrix.github.io/agent-browser-shield/", label: "Docs" },
  {
    href: "https://github.com/pixiebrix/agent-browser-shield",
    label: "GitHub",
  },
  {
    href: "https://github.com/pixiebrix/agent-browser-shield/issues",
    label: "Report a bug",
  },
] as const;

export function HelpLinks({ className }: { className?: string }) {
  return (
    <nav className={className} aria-label="Help and project links">
      {LINKS.map((link, index) => (
        <span key={link.href}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <a href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        </span>
      ))}
    </nav>
  );
}
