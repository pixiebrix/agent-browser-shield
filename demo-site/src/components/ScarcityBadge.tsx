// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

interface ScarcityBadgeProps {
  text: string;
  tone?: "warning" | "info";
}

export default function ScarcityBadge({ text, tone = "warning" }: ScarcityBadgeProps) {
  const cls =
    tone === "warning"
      ? "bg-red-50 text-red-700 ring-red-200"
      : "bg-amber-50 text-amber-800 ring-amber-200";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      {text}
    </span>
  );
}
