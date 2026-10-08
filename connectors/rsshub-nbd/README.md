# RSSHub NBD metadata connector

A separately licensed, one-shot AGPL-3.0 connector with actual RSSHub NBD route code reuse. It requires no server. The original pinned route is in upstream/index.ts; connector.mjs directly retains its Cheerio selection/traversal/title-link mapping and adapts the transport and output. See NOTICE for the changes and UPSTREAM.json for integrity checks.

Node 22+:

    npm ci --ignore-scripts
    npm test
    node cli.mjs --private-research --category 3 --limit 3 > news.private.json

Import the resulting `ashare-news-metadata/v1` JSON using the application's news-metadata import. Keep news.private.json outside public source/distribution. This program itself does not write files; shell redirection is explicit. Never commit actual news output. Dependencies are pinned in package-lock.json.

Reads one NBD category page and at most 1–10 original-domain article pages with sequential requests, timeouts, and a request budget. Stops on access errors; no proxy, copied cookies, authentication, paywall, CAPTCHA, or blocking avoidance. Review current publisher terms before running. Only title, publication metadata, URL, observation time and provenance hashes are emitted; article body is never extracted or exported. Publication metadata may be absent. Source URL dates are not promoted to publication metadata. Ticker mapping is not supplied.

This is a recent category feed, not a historical archive or complete corpus. Strict backtests must use availableAt/firstObservedAt, not reportedAvailableAt. Publisher datePublished/pubDate can be revised and does not certify original historical availability. Persist earliest observed times in your application across imports.

## License and delivery

This whole connector package is AGPL-3.0. Its complete modified source, original upstream source, LICENSE, NOTICE, checksums and lockfile must accompany distribution. Do not assume placing copied AGPL code in a subfolder exempts a combined application. It is supplied as an independent JSON-file producer; license implications of further integration should be reviewed. The code license grants no rights to publisher news. Cheerio and its transitive dependencies retain their respective licenses. Tests contain only invented synthetic fixtures.

## Source and timestamp safeguards

A production run first checks NBD robots.txt against the reviewed SHA-256 a74b3d24fa84ed5cc1ffab7457eb8d877bcae8b81e033a0517201d04aaf9665e. Any change requires manual review; the connector does not silently override it. Article URLs with credentials, query strings, fragments, or the explicitly excluded ID 3005502 are rejected. Only records with an explicit NBD source label or a narrowly matched NBD reporter byline are retained; third-party/unknown-source records are excluded. Byline extraction is limited to the first author paragraph; no prose body is emitted. The observation time is captured after successful detail retrieval.

Conflicting datePublished/pubDate values result in publicationDate:null plus publicationMetadataConflict:true, not selection of the first value. Do not replace null dates with URL dates. Empty selectors fail visibly. No guarantee is made about article completeness, classification or point-in-time history.

Reviewed source policies: https://www.nbd.com.cn/copyright/ and https://www.nbd.com.cn/privacy, within private owner-only noncommercial research scope. No public redistribution of news metadata is authorized by the connector.
