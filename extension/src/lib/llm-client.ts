// Content-script-side wrapper for LLM calls that must run from the background
// worker to bypass page CSP.

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

export async function classifyIrrelevantSections(
  request: ClassifyRequest,
  signal?: AbortSignal,
): Promise<ClassifyResponse> {
  return await new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("aborted", "AbortError"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort);

    chrome.runtime.sendMessage(
      { type: "classify-irrelevant-sections", payload: request },
      (response: ClassifyResponse | { error: string } | undefined) => {
        signal?.removeEventListener("abort", onAbort);
        if (signal?.aborted) return;
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error("Empty response from background worker"));
          return;
        }
        if ("error" in response) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      },
    );
  });
}
