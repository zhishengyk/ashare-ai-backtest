# Full-market upgrade verification — 2026-10-08

- Catalogue: 5,920 org-deduplicated A-share disclosure index entries, Shanghai 2,467 / Shenzhen 3,100 / Beijing 353. Includes historical/delisted records; not an active-stock count. Code/name/pinyin/legacy-code search and market/board filters tested.
- Real on-demand collection: 000001, 300750, 688981 and 920982, window 2026-09-21–24. All four returned real bars; Beijing Sohu prices independently matched Sina for Sep23/24. Tencent empty Beijing response was not mistaken for coverage.
- Existing news source returned HTTP406: explicitly reported unavailable, no retries around denial or invented news. Announcements remain bounded and incomplete.
- Unit/API regression covers price/lot rule dates, ST evidence, IPO/unknown-status rejection, exclusion of B/funds, T+1, point-in-time cutoff, persisted legacy state, concurrent step idempotency, failed-symbol isolation, dividend isolation and bounded large orders.
- Build/ESM and inline JavaScript syntax validation run. Browser visual/UI automation not completed: installed Chromium failed before navigation with socket Operation not permitted. No claim of visual QA.
- No real model API call, new key, paid request, broker action or full-market historical download was performed.

## Soft-limit revision

10 stocks /120 calendar days are now advisories, not validation ceilings. New persistent collection jobs request one stock and90 calendar days per source batch, with pause/resume and explicit failed intervals. New tests cover11 selected stocks over365 days, nonoverlapping date slicing, overlap deduplication, repeated/concurrent step versions and restored task parameters. No real model calls were made. Existing private deployment migration only adds job/part tables; no saved datasets/runs are rewritten.
