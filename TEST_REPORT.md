# Full-market upgrade verification — 2026-10-08

- Catalogue: 5,920 org-deduplicated A-share disclosure index entries, Shanghai 2,467 / Shenzhen 3,100 / Beijing 353. Includes historical/delisted records; not an active-stock count. Code/name/pinyin/legacy-code search and market/board filters tested.
- Real on-demand collection: 000001, 300750, 688981 and 920982, window 2026-09-21–24. All four returned real bars; Beijing Sohu prices independently matched Sina for Sep23/24. Tencent empty Beijing response was not mistaken for coverage.
- Existing news source returned HTTP406: explicitly reported unavailable, no retries around denial or invented news. Announcements remain bounded and incomplete.
- Unit/API regression covers price/lot rule dates, ST evidence, IPO/unknown-status rejection, exclusion of B/funds, T+1, point-in-time cutoff, persisted legacy state, concurrent step idempotency, failed-symbol isolation, dividend isolation and bounded large orders.
- Build/ESM and inline JavaScript syntax validation run. Browser visual/UI automation not completed: installed Chromium failed before navigation with socket Operation not permitted. No claim of visual QA.
- No real model API call, new key, paid request, broker action or full-market historical download was performed.

## Soft-limit revision

10 stocks /120 calendar days are now advisories, not validation ceilings. New persistent collection jobs request one stock and90 calendar days per source batch, with pause/resume and explicit failed intervals. New tests cover11 selected stocks over365 days, nonoverlapping date slicing, overlap deduplication, repeated/concurrent step versions and restored task parameters. No real model calls were made. Existing private deployment migration only adds job/part tables; no saved datasets/runs are rewritten.

## Daily support revision

Real source parser/live pilot:60131841 factor records,41 dividend/bonus records; CSI30063 bars for2026-07-01–09-28. Dividend9.8 per10 becomes0.98 per share; provider announcement date remains separate from unknown historical availability/payment date. Calendar2026 has242 announced SSE/SZSE sessions; holiday09-25 and reopening10-08 checked. Tests verify unknown-year/BSE scope, no future benchmark values, missing-session preservation, diagnostic-event blocking instead of unverified cash credit. Daily support is not complete institutional/PIT coverage.

The job finalization race is closed using a persisted merging lease and version-guarded dataset finalization; expired final merge resumes without collecting a nonexistent slice. A one-trading-day trailing chunk is now retained instead of rejected. Regression tests cover both cases.

## NBS metadata revision

国家统计局静态宏观发布索引适配器使用元数据而非正文；按最多3页的小批次读取并留覆盖范围。生产固定observed_only，今天检索的记录不提前放入历史AI信息。测试覆盖重复/外部链接过滤、来源格式变化、默认观察时间门槛、拒绝访问不重试、robots规则变化停止和有界页数。原东方财富406不被绕过，宏观来源不被计作个股新闻补全。

## Suspension and news timing revision

New runs keep effective-dated, source-linked suspension evidence separate from missing and zero-volume bars. Tests preserve held quantities/last valid prices, flag stale valuation, skip suspended constituents without blocking other verified names, restore eligibility at resumption, and prevent future evidence from affecting earlier masks. Model packets contain identical masks and frozen weights; output validation rejects fictitious liquidation. Persisted older runs remain untouched.

BYD official article metadata adapter is bounded to three verified canonical source URLs per enrichment, with two-second spacing, timeout, robots/access-denial stops, URL restrictions, schema checks and SHA-256 provenance. Researcher live-checked article548 HTTP200: displayed publication2024-09-27 differs from in-body event date2024-09-25. Tests use minimal metadata fixtures, not article prose. Default observation cutoff and explicit reported-publication sensitivity mode are distinct; reported dates do not establish archival point-in-time fidelity. News enrichment writes a new dataset copy and deduplicates URLs. No model calls or paid services were invoked.

Final regression total:66 tests pass (including late retrospective status preserving historical marks, strict mode rejecting forged/derived replay metadata, and reported-time gate never preceding publication). Worker ESM export and inline UI JavaScript syntax pass. Independent targeted review reproduced the two edge cases before fixes and checks their corrected behavior; no paid model calls were used. Browser visual verification remains unperformed for this revision.

## Broad finance-press metadata revision

73 tests pass:66 previous regressions plus NBD metadata-only normalization, original-source filtering, duplicate/invalid links, strict and opt-in date cutoffs, eight-result pagination, exact public date request format, robots/denial/oversize failure stops, cache-backed immutable dataset enrichment and repeated-page idempotence. Inline UI syntax and Worker ESM validation pass. Source researcher live-tested BYD and 贵州茅台 queries, plus date-filtered offset8 with distinct results. Our JS parser checked the private actual responses: first sample5 retained originals/8, second page2/8; excluded unknown/third-party sources, did not include raw results in source repository. The source reports day precision only; no verified first-publication timestamp, full historical archive or paid AI search is claimed. Independent QA follows before publication; browser visual QA remains unperformed.

### Actual upstream reuse and import

RSSHub connector ships as a separate complete AGPL source package with pinned original, license, NOTICE, SHA manifest and lockfile; actual selector/traversal/mapping code is reused. Connector tests10/10 pass, including timestamp conflicts, forbidden URLs, robots mismatch and source filtering. A bounded real-source smoke read robots, category and two original-source article metadata records; both contradictory timestamp sets remain publicationDate:null. Real output remains private and is excluded from public source. Application metadata import forces observed-only availability, strips raw/body fields, preserves timestamp-conflict flags and creates immutable copies. Final app suite now74 tests before the additional real-import smoke; no live model calls.

Real import smoke: the actual RSSHub connector JSON (two records) imported through the same API used by the file UI into an existing real three-stock/195-bar dataset. HTTP200, new dataset copy, original payload unchanged. Both conflicting publication dates stayed null; zero documents leaked into historical strict or reported-date modes. Actual news output and market dataset were outside the repository and are not distributed. This was API-level validation, not browser visual automation.

## Standalone Node / SQLite runtime — 2026-10-08

Environment: assistant cloud workspace, Node v24.19.0. No user computer was accessed. No existing private database or historical API key was read. No model provider call was made.

- `npm run build`: passed; build requires no Sites manifest or cloud binding
- `npm run validate`: passed; generated ESM exports the reusable Fetch API handler
- `npm test`: 77/77 passed (74 existing business tests, 2 standalone integration tests, and 1 key-precedence regression)
- Real HTTP server child processes: HTML UI, SQLite status, catalogue search, import, baseline create/advance/export passed
- The explicitly labeled synthetic fixture is test-only, stored in a temporary directory and deleted after the test. Four-day baseline completed with one trade and finite equity; model call records: 0
- Two concurrent same-version requests committed one step. SIGTERM and a fresh process restored dataset/run/version, then completed the baseline
- Host/DNS-rebinding protection, Origin and Sec-Fetch-Site rejection, JSON content-type enforcement and 1,500,000-byte limit passed
- A dummy noncredential session marker was not persisted; no real credentials were used
- Atomic SQLite batch rollback and migration re-open/idempotence passed
- Docker executable unavailable: Docker image build, Compose startup and volume behavior NOT executed. Configuration is supplied for review; do not describe Docker as runtime-tested
- External data sources and real model inference were not revalidated in this runtime migration. Existing collector/PIT/suspension suites use controlled fixtures; source availability remains dependent on third parties
- No public endpoint, authentication service, perpetual hosting or 24×7 availability is provided. Default access is loopback only on the machine running this process

Live-session observation: a fresh empty standalone database was started in a persistent PTY session and returned HTTP 200 for `/healthz`, `/api/status`, and `/api/datasets` across multiple checks. This executor isolates each command's network namespace; other command sessions cannot reach that loopback listener. The running PTY is not a public deployment and does not establish user-browser access or long-term service availability.

Independent review additionally verified clean build without node_modules, failed migration transaction rollback/recovery, and non-loopback startup refusal before database creation. Its key-precedence and IPv6 startup-message findings were fixed, followed by a fresh 77/77 test pass and artifact validation. All model responses in tests were mocked, with dummy noncredential markers.
