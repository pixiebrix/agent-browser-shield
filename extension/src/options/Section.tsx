// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { ReactNode } from "react";

// One options-page section wrapped in a self-anchoring heading. The anchor
// matches the table-of-contents entry at the top of the page.
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section">
      <h2>
        <a href={`#${id}`} className="anchor" aria-label={`Link to ${title}`}>
          #
        </a>
        {title}
      </h2>
      {children}
    </section>
  );
}
