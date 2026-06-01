// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import { getUserApiKey } from "./api-key-storage";
import {
  CLASSIFY_PORT_NAME,
  type ClassifyPortMessage,
  type ClassifyRequest,
  type ClassifyResponse,
} from "./llm-client";

// Injected at build time via Bun `define` (see `src/globals.d.ts`). Empty
// string when unset so the extension still loads; classification calls then
// fail with a clear error.
const BUILT_IN_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-5-nano";
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = `You decide which elements on a web page are irrelevant to a browser-use agent trying to complete a user's task.

Input: a page URL and a compressed HTML tree of the visible page. Scripts, styles, and most attributes have been stripped. Two categories of nodes carry a stable identifier in a \`data-ref\` attribute:

- **Container refs** sit on landmark elements (section, aside, nav, article, header, footer, main, figure, dialog) and on block elements that have a heading child — these are the candidates you may flag for hiding.
- **Interactive refs** sit on buttons, links, inputs, and ARIA-role widgets. They are labeled so you can see them but you MUST NOT flag them and you MUST NOT flag any container whose value depends on those controls (search boxes, filter/sort widgets, account menus, cart/checkout controls, login, pagination).

You may flag refs at any level of granularity. If both a wrapper and an inner element are reasonable, prefer the smallest container that still captures the entire irrelevant section; the consumer of your response will dedupe overlapping selections to the outermost. Do not flag an element that you cannot describe precisely — silence is safer than a guess.

FLAG elements that are engagement / exploration / promotion rather than task content. A page typically has several of these — it's expected to flag multiple refs, not just one. Categories include:

- Engagement rails: "related products", "you might also like", "recommended for you", "frequently bought together", "customers also viewed", "more from this site/author".
- Editorial recirculation: "trending now", "most popular", "in case you missed it", "read next", "more stories", "top of the hour".
- Recently-viewed / personalized history rails.
- Sponsored or paid placements that survived ad blocking: "promoted", "sponsored content", "partner content", native advertorial cards.
- Financial product offers: credit cards, loans, store cards, BNPL pitches, "apply now and save 10%", branded co-card upsells.
- Subscription / upgrade upsells: "try premium free", "join Prime", "subscribe for $X/mo", paywall teasers.
- App-download or platform-install promos ("get the app", QR-code download blocks).
- Loyalty / rewards / referral pitches ("earn points", "refer a friend", "join our rewards program").
- Inline newsletter / mailing-list signup blocks (the modal variant is already stripped — these are the in-body ones).
- Survey / feedback / NPS prompts ("how are we doing?", "take our 1-minute survey").
- Donation, fundraising, or membership-drive banners.
- Brand storytelling panels on product pages ("From the manufacturer", brand-story blocks below the fold).
- Social-share rails and "follow us on…" blocks.
- Generic site-wide navigation rails that aren't the primary nav (footer-style link farms, "explore more categories").

Do NOT flag:
- The primary content the user is reading or interacting with: product detail, article body, search results, forms, checkout, account info, the page's main heading area.
- Any element that contains an interactive ref the user might reasonably need (search input, filter, sort, login, cart line, checkout step, pagination).
- Page-dominating hero/banner sections at the top of the page (large promotional carousels, full-bleed feature panels). Even when these are promotional, hiding them collapses page layout. Skip them.

For each flagged ref, write a single concise sentence (under 20 words) describing what the element contains — specific enough that a downstream agent can decide whether to reveal it (e.g. "Carousel of 6 related kitchen knives with prices and star ratings", "Chase Amazon Visa credit-card offer with $200 sign-up bonus", "Inline newsletter signup with email input", not "Related products section" or "Promotional content"). Use the element's actual content, not generic labels.

Respond with a JSON object: {"irrelevant": [{"ref": string, "summary": string}, ...]}. Include only refs that appear in the input. If nothing qualifies, return {"irrelevant": []}.`;

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function handleClassify(
  payload: ClassifyRequest,
  signal?: AbortSignal,
): Promise<ClassifyResponse> {
  const userKey = await getUserApiKey();
  const apiKey = userKey || BUILT_IN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No OpenAI API key configured. Set one in the extension options page, or rebuild with OPENAI_API_KEY in .env.",
    );
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response missing message content");
  }

  const parsed = JSON.parse(content) as { irrelevant?: unknown };
  const irrelevant = Array.isArray(parsed.irrelevant)
    ? parsed.irrelevant.flatMap((entry): { ref: string; summary: string }[] => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const { ref, summary } = entry as Record<string, unknown>;
        if (typeof ref !== "string") {
          return [];
        }
        return [
          {
            ref,
            summary: typeof summary === "string" ? summary.trim() : "",
          },
        ];
      })
    : [];
  return { irrelevant };
}

// Wire up the port handler for content-script classify requests. Each port
// owns one AbortController: the content side disconnecting before fetch
// completes aborts the in-flight HTTP request so we don't keep burning tokens
// for a response no one is listening for.
export function startClassifyPortListener(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== CLASSIFY_PORT_NAME) {
      return;
    }
    const controller = new AbortController();
    // Content-side disconnect (rule torn down, page navigated, frame gone)
    // aborts the in-flight fetch via the signal forwarded into handleClassify.
    // Calling abort after handleClassify has resolved is a no-op, so this is
    // safe regardless of who wins the race.
    port.onDisconnect.addListener(() => controller.abort());

    const send = (message: ClassifyPortMessage) => {
      try {
        port.postMessage(message);
      } catch {
        // Port already disconnected — caller has gone away. Nothing to do.
      }
    };

    port.onMessage.addListener((raw: unknown) => {
      const payload = raw as ClassifyRequest;
      handleClassify(payload, controller.signal)
        .then((response) => {
          send({ kind: "response", response });
          port.disconnect();
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          const message =
            error instanceof Error ? error.message : String(error);
          send({ kind: "error", error: message });
          port.disconnect();
        });
    });
  });
}
