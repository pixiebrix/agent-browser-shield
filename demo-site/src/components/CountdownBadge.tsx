// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useEffect, useState } from "react";

interface CountdownBadgeProps {
  initialSeconds?: number;
  label?: string;
}

function format(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function CountdownBadge({
  initialSeconds = 4 * 3600 + 32 * 60 + 18,
  label = "Lightning deal ends in",
}: CountdownBadgeProps) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="inline-flex items-center gap-2 rounded bg-red-50 px-3 py-1.5 text-sm text-red-700 ring-1 ring-red-200">
      <span aria-hidden="true">⚡</span>
      <span>
        {label}{" "}
        <span className="font-mono font-semibold">{format(remaining)}</span>
      </span>
    </div>
  );
}
