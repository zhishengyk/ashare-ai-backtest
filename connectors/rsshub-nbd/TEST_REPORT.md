# Verification, 2026-10-08

- `npm test`: 10/10 synthetic tests passed
- Pinned upstream original and LICENSE SHA-256 verified against UPSTREAM.json
- Official npm registry installation used --ignore-scripts; lockfile included
- Live metadata smoke completed at approximately 08:06:13 UTC using category 3 and limit 2
- Bounded requests: robots.txt, one category page, two article metadata pages
- Result: two original-publisher records with author attribution; source hashes and observed timestamps retained
- Both records had conflicting publisher timestamp fields; publicationDate remained null with conflict flags, and availableAt remained firstObservedAt
- No body, snippet, image, raw HTML or fetched news fixture in this distributable
- Live JSON is intentionally kept outside this source package and must not be committed or redistributed
- No server needed; smoke output is compatible with ashare-news-metadata/v1

Tests cover actual upstream selector traversal, output schema, body exclusion, unknown dates, invalid dates, conflicting timestamps, URL host restrictions, credentials/query/hash rejection, robots-excluded article ID, empty-selector failure, HTTP403 no retry, bounded inputs, and unknown publisher exclusion.
