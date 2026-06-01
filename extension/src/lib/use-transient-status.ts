// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { useCallback, useEffect, useRef, useState } from "react";

// Brief "saved" / "applied" status messages that disappear after a delay.
// Replaces the inline `setTimeout(setStatus(null), 1500)` pattern, which leaks
// the timeout if the component unmounts before it fires.
export function useTransientStatus(
  durationMs = 1500,
): [string | null, (message: string) => void] {
  const [value, setValue] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const show = useCallback(
    (message: string) => {
      setValue(message);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setValue(null);
        timeoutRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  return [value, show];
}
