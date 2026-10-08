# Verification report — 2026-10-08

## Automated checks

18 tests pass under Node.js 24. Covered: cutoff boundaries, future-bar isolation, explicit document timezones, duplicate securities/events, next-session fills, whole lots, cash affordability, suspension, limit-up, bounded slippage, T+1, gross cash dividend entitlement, completed-run idempotency, insufficient-sample metrics, API persistence, concurrent same-version steps, snapshot/export, cross-origin rejection, invalid AI weights/evidence, upstream secret-reflection redaction, and terminal AI-step avoidance of fabricated baseline decisions. Build artifact exports valid Worker Fetch API. Inline browser JavaScript syntax checked.

An independent read-only code review also passed the accounting, cutoff, model adapter and transient-secret flow. A mocked provider test verified that replaying one run/version issues only one mocked request; no real model call was made by the authoring session.

## Real-source integration

A privately imported dataset contained 195 actual daily bars across the three selected stocks for July–September 2026, 33 document records (28 news excerpts and 5 announcement records), 8 source records, actual extracted report/dividend text, and one verified gross cash dividend event. Source data is excluded from this public repository because redistribution rights are unverified.

The same dataset completed 65 trading days and 22 simulated fills locally and on the deployed private platform. Snapshot/export read-back succeeded and the actual report text was visible after its cutoff. Gross cash dividend credit was 6,370 CNY; this is an integration-test result, not investment validation. Other corporate actions and personal dividend taxation remain incomplete.

Hosted D1 and status/dataset/run endpoints verified. Hosted live collection successfully fetched Tencent bars and a CNINFO index. Eastmoney returned HTTP 406 from the hosted runtime: the collector stopped and displayed a warning, with no access-control bypass. Previously collected legitimate news excerpts remain in the private sample dataset. Future live news availability is not guaranteed.

## UI / model QA limits

Desktop and Android-sized responsive rules are implemented, but visual rendering and full browser interaction were not verified: the cloud browser could not reach the executor-local preview, the executor could not start headless Chromium under its sandbox, and the browser rejected a standalone data-URL render. No bypass was attempted. Do not equate API tests with mobile usability verification.

No user key was read or entered by the author. SiliconFlow integration uses an exact free-model allowlist verified against the official China catalogue on 2026-10-08; live authenticated inference remains a user-controlled test. No paid fallback exists. Pricing and rate limits can change.

## Deliberate first-version limits

Only 600519, 600036 and 601318 are selectable (any subset); arbitrary A-share tickers are not supported. Single collection windows are limited to 120 calendar days. Each source query is bounded to 30 announcements/news results per stock; news search filtering does not produce a complete historical archive. This is a prototype, not a brokerage or complete historical data terminal.
