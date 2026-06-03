// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// URL gating for rules that should only run on cart / checkout pages
// (`checkout-checkbox-sanitize`, `cart-addon-annotate`). Lives in `lib/` instead of a
// rule file so consumers don't import sibling rules.

import { URLPattern } from "urlpattern-polyfill";

// `{/*}?` matches the base segment and any sub-paths
// ("/checkout", "/checkout/", "/checkout/shipping"). URLPattern treats
// segments as literals, so "/order{/*}?" matches "/order" and
// "/order/confirmation" but NOT "/orders" (history).
const CHECKOUT_PATTERNS: URLPattern[] = [
  "/cart{/*}?",
  "/checkout{/*}?",
  "/basket{/*}?",
  "/bag{/*}?",
  "/payment{/*}?",
  "/order{/*}?",
].map((pathname) => new URLPattern({ pathname }));

export function isCheckoutUrl(url: string): boolean {
  return CHECKOUT_PATTERNS.some((pattern) => pattern.test(url));
}
