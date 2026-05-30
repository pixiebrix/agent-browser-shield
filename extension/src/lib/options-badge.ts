const BADGE_SELECTOR = "data-abs";
const BADGE_VALUE = "open-options";

export function injectOptionsBadge(): void {
  if (document.querySelector(`[${BADGE_SELECTOR}="${BADGE_VALUE}"]`)) return;
  const host = document.body ?? document.documentElement;
  if (!host) return;

  const badge = document.createElement("button");
  badge.type = "button";
  badge.setAttribute(BADGE_SELECTOR, BADGE_VALUE);
  badge.setAttribute("aria-label", "Open Agent Browser Shield options");
  badge.title = "Open Agent Browser Shield options";
  badge.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

  Object.assign(badge.style, {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: "2147483647",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "0",
    background: "#18181b",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
    opacity: "0.65",
    transition: "opacity 120ms ease",
    padding: "0",
    margin: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies Partial<CSSStyleDeclaration>);

  badge.addEventListener("mouseenter", () => {
    badge.style.opacity = "1";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.opacity = "0.65";
  });
  badge.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "open-options" }).catch((error) => {
      console.error("[abs] failed to open options page", error);
    });
  });

  host.appendChild(badge);
}
