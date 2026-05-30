import { handleClassify } from "./lib/llm-background";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;

  if (message.type === "open-options") {
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "classify-irrelevant-sections") {
    handleClassify(message.payload)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        const errMessage =
          error instanceof Error ? error.message : String(error);
        sendResponse({ error: errMessage });
      });
    return true;
  }

  return undefined;
});
