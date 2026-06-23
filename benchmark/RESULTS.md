# Benchmark results — clean set (n=3)

Run `run_20260622_205455_c5fc`. 19 login-free, real-web tasks, each run **3
times** with the extension off (baseline) and on (guarded). Agent:
`gpt-5-mini` via the Browserbase Model Gateway. Judge: `claude-sonnet-4-6`.
Reproduce with the [harness](./README.md).

## Headline

| Metric       | Baseline (off) | Shielded (on)    |
| ------------ | -------------- | ---------------- |
| Total tokens | 2.33M          | 2.07M (**−11%**) |
| Task success | 81% (46/57)    | **91%** (52/57)  |

## Per-task

Sorted by token change. **Negative = fewer tokens with the shield on (good)**,
positive = more. "Runs passed" is out of 3, off → on.

| Task                           | Runs passed (off → on) | Tokens off | Tokens on | Tokens vs baseline |
| ------------------------------ | ---------------------- | ---------- | --------- | ------------------ |
| `github-trending`              | 1/3 → 3/3              | 43,979     | 12,702    | −71%               |
| `weather-nyc`                  | 3/3 → 3/3              | 121,057    | 45,587    | −62%               |
| `weather-nyc-week-coldest`     | 3/3 → 2/3              | 112,678    | 47,747    | −58%               |
| `target-air-fryer`             | 1/3 → 3/3              | 86,024     | 42,270    | −51%               |
| `github-react-bug-newest`      | 3/3 → 3/3              | 78,760     | 45,640    | −42%               |
| `etsy-wallet-shop-sales`       | 2/3 → 3/3              | 322,010    | 204,605   | −37%               |
| `mdn-array-map`                | 3/3 → 3/3              | 56,786     | 41,883    | −26%               |
| `python-docs-len`              | 3/3 → 3/3              | 120,707    | 89,846    | −26%               |
| `amazon-headphones`            | 3/3 → 3/3              | 150,996    | 122,002   | −19%               |
| `google-shopping-keyboard`     | 2/3 → 3/3              | 27,655     | 23,014    | −17%               |
| `linkedin-dev-jobs`            | 2/3 → 3/3              | 26,167     | 23,145    | −12%               |
| `mdn-includes-vs-flat-firefox` | 1/3 → 2/3              | 510,153    | 473,456   | −7%                |
| `arxiv-recent-cs-ai`           | 3/3 → 3/3              | 28,155     | 27,924    | −1%                |
| `wikipedia-einstein-advisor`   | 3/3 → 3/3              | 246,699    | 256,646   | +4%                |
| `craigslist-nyc-bikes`         | 2/3 → 3/3              | 61,391     | 68,893    | +12%               |
| `hn-top-title`                 | 3/3 → 3/3              | 15,392     | 17,494    | +14%               |
| `ikea-billy-cheapest-white`    | 2/3 → 2/3              | 158,220    | 208,214   | +32%               |
| `wiki-claude`                  | 3/3 → 3/3              | 104,139    | 173,514   | +67%               |
| `company-about-stripe`         | 3/3 → 1/3              | 60,305     | 147,626   | +145%              |

## Takeaways

- **The aggregate is the trustworthy claim.** As you can see from the table it varies wildly across sites and across runs, but 11% savings is a safe bet. As with everything, your mileage may vary so we encourage you to run the harness on scraping taks you're doing today.
- **Rows where either side didn't pass all 3 runs are a softer comparison** — a
  failed run can burn very different token counts, so the percentage isn't
  strictly like-for-like. The cleanest wins are the `3/3 → 3/3` rows (weather,
  GitHub issues, MDN, Python docs, Amazon).
- **We leave the regressions in on purpose.** `company-about-stripe` got worse
  and used 145% more tokens; we kept it rather than quietly dropping it. A
  benchmark that only shows wins isn't a benchmark.
- This is `gpt-5-mini` only, on the non-blocked slice of sites. A directional
  signal, not a published paper.
