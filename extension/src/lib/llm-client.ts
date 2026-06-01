// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Content-script-side wrapper for LLM calls that must run from the background
// worker to bypass page CSP. Uses a long-lived port (not sendMessage) so an
// abort on the caller's signal disconnects the port, which the background
// observes and forwards to fetch via its own AbortController. Without this,
// the fetch would run to completion and burn tokens after teardown.

import { onAbort } from "abort-utils";

export const CLASSIFY_PORT_NAME = "classify-irrelevant-sections";

export interface ClassifyRequest {
  url: string;
  // Serialized compressed page tree (from `getPageTree`) with `data-ref`
  // attributes stamped on container and interactive nodes. The LLM picks refs
  // to hide and returns them by `ref`.
  pageTree: string;
}

export interface IrrelevantElement {
  ref: string;
  summary: string;
}

export interface ClassifyResponse {
  irrelevant: IrrelevantElement[];
}

// Wire-format messages from the background. Discriminated so the content side
// can distinguish success from a propagated error without sniffing for keys.
export type ClassifyPortMessage =
  | { kind: "response"; response: ClassifyResponse }
  | { kind: "error"; error: string };

export async function classifyIrrelevantSections(
  request: ClassifyRequest,
  signal?: AbortSignal,
): Promise<ClassifyResponse> {
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }

  const port = chrome.runtime.connect({ name: CLASSIFY_PORT_NAME });
  return new Promise<ClassifyResponse>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup?.[Symbol.dispose]();
      port.disconnect();
      action();
    };

    // onAbort attaches the abort handler with `{ once: true, signal: cleanup }`
    // so it auto-detaches when either the input signal fires or we dispose —
    // no manual removeEventListener needed on either path.
    const cleanup = onAbort(signal, () => {
      finish(() => reject(new DOMException("aborted", "AbortError")));
    });

    port.onMessage.addListener((raw: unknown) => {
      const message = raw as ClassifyPortMessage;
      if (message.kind === "response") {
        finish(() => resolve(message.response));
      } else {
        finish(() => reject(new Error(message.error)));
      }
    });

    port.onDisconnect.addListener(() => {
      const lastError = chrome.runtime.lastError?.message;
      finish(() =>
        reject(
          new Error(lastError ?? "Background disconnected before responding"),
        ),
      );
    });

    port.postMessage(request);
  });
}
