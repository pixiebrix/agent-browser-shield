// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Leveled console logger. `info` / `warn` / `error` always emit; `debug`
// is gated on the same `debugTraceStorage` toggle that controls the
// structured trace buffer (see `lib/debug-trace.ts`) so one switch
// silences both surfaces. Verbose `debug` calls in the ~10ms before the
// toggle's in-memory cache hydrates may be missed — that's acceptable,
// since `debug` is advisory.
//
// `createRuleLogger(ruleId)` returns the same shape but auto-prefixes
// `[abs:rule-id]` so devtools console filters can pick out one rule's
// output.
//
// For DOM-mutation events, use `traceMutation` (`lib/trace-mutation.ts`)
// instead — it captures before/after HTML lazily and routes through the
// debug-trace store for offline analysis.

import { isDebugTraceEnabled } from "./debug-trace";

const DEFAULT_PREFIX = "[abs]";

type Level = "debug" | "info" | "warn" | "error";

function emit(
  level: Level,
  prefix: string,
  message: string,
  details?: unknown,
): void {
  if (level === "debug" && !isDebugTraceEnabled()) {
    return;
  }
  const sink =
    level === "warn"
      ? console.warn
      : level === "error"
        ? console.error
        : console.log;
  if (details === undefined) {
    sink(prefix, message);
  } else {
    sink(prefix, message, details);
  }
}

export interface Logger {
  debug: (message: string, details?: unknown) => void;
  info: (message: string, details?: unknown) => void;
  warn: (message: string, details?: unknown) => void;
  error: (message: string, details?: unknown) => void;
}

function build(prefix: string): Logger {
  return {
    debug: (m, d) => {
      emit("debug", prefix, m, d);
    },
    info: (m, d) => {
      emit("info", prefix, m, d);
    },
    warn: (m, d) => {
      emit("warn", prefix, m, d);
    },
    error: (m, d) => {
      emit("error", prefix, m, d);
    },
  };
}

export const log: Logger = build(DEFAULT_PREFIX);

export function createRuleLogger(ruleId: string): Logger {
  return build(`[abs:${ruleId}]`);
}
