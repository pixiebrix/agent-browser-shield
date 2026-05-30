// Global on/off switch for the extension's enforcement. When disabled, the
// rule engine reveals all placeholders and tears down rules without mutating
// any per-rule state — so flipping it back on restores the previous selection.
//
// Stored separately from rule states so toggling enforcement doesn't churn the
// rule-state listener path and so the per-rule preferences survive across
// disable/enable cycles.

const STORAGE_KEY = "agent-browser-shield.enforcement-enabled";

export const ENFORCEMENT_ENABLED_DEFAULT = true;

function normalize(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : ENFORCEMENT_ENABLED_DEFAULT;
}

export async function getEnforcementEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalize(stored[STORAGE_KEY]);
}

export async function setEnforcementEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: enabled });
}

export function subscribeEnforcementEnabled(
  listener: (enabled: boolean) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    listener(normalize(change.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
