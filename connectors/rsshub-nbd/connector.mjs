// SPDX-License-Identifier: AGPL-3.0-only
// Derived from DIYgod/RSSHub lib/routes/nbd/index.ts, revision in UPSTREAM.json.
// Modifications 2026-10-08: standalone bounded CLI; metadata only; strict provenance.
import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export const ROOT = 'https://www.nbd.com.cn';
export function articleUrl(value) {
    try {
        const u = new URL(value, ROOT);
        if (u.username || u.password || u.search || u.hash || value.includes('3005502') || u.origin !== ROOT || !/^\/articles\/\d{4}-\d{2}-\d{2}\/\d+\.html$/.test(u.pathname)) return null;
        return u.href;
    } catch { return null; }
}
export function publicationMetadata(html) {
    const $ = load(html);
    const candidates = [];
    // Read only publication metadata, never the article body.
    for (const script of $('script[type="application/ld+json"]').toArray()) {
        try {
            const doc = JSON.parse($(script).text());
            const walk = (x) => {
                if (!x || typeof x !== 'object') return;
                if (typeof x.datePublished === 'string') candidates.push(x.datePublished);
                if (typeof x.pubDate === 'string') candidates.push(x.pubDate);
                for (const v of Object.values(x)) if (typeof v === 'object') Array.isArray(v) ? v.forEach(walk) : walk(v);
            };
            walk(doc);
        } catch {}
    }
    candidates.push($('meta[property="article:published_time"]').attr('content'));
    // Original RSSHub route extracts the publisher's embedded pubDate field.
    candidates.push(html.match(/"pubDate"\s*:\s*"([^"\n]+)"/)?.[1]);
    const parsed = [];
    for (const raw of candidates.filter(Boolean)) {
        const s = raw.trim();
        if (!/^\d{4}-\d{2}-\d{2}(?:$|[T ])/u.test(s)) continue;
        const date = s.slice(0, 10);
        const check = new Date(date + 'T00:00:00Z');
        if (!Number.isFinite(+check) || check.toISOString().slice(0,10) !== date) continue;
        // Date alone is legitimate metadata, not a tradable intraday timestamp.
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { parsed.push({ publicationDate: date }); continue; }
        const local = s.replace(' ', 'T');
        const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(local) ? local : local + '+08:00';
        const d = new Date(zoned);
        if (Number.isFinite(+d)) parsed.push({ publicationDate: date, reportedAvailableAt: d.toISOString() });
    }
    const unique = [...new Map(parsed.map(x => [JSON.stringify(x),x])).values()];
    if (unique.length > 1) return { publicationDate: null, publicationMetadataConflict: true };
    return unique[0] ?? { publicationDate: null };
}
export function attribution(html) {
 const $=load(html); const source=$('.u-time .source').text().trim();
 const byline=$('.g-articl-text > p').first().text().trim();
 const author=byline.match(/^每经记者[｜|：:]\s*([^\s]+)/)?.[1] ?? null;
 if (source && !['每日经济新闻','每经网','每经'].includes(source)) return null;
 if (!source && !author) return null;
 return {publisher: source || '每日经济新闻', author};
}

export function createHttpGet({ fetchImpl = fetch, maxRequests = 4, timeoutMs = 15000, delayMs = 1000, sources = [] } = {}) {
    let count = 0;
    return async ({ url, method = 'get' }) => {
        const u = new URL(url);
        if (u.origin !== ROOT || !(/^\/columns\/\d+\/$/.test(u.pathname) || articleUrl(url))) throw new Error('Only allowlisted NBD category/article URLs are supported');
        if (++count > maxRequests) throw new Error('Request budget exceeded');
        if (count > 1 && delayMs) await new Promise(r => setTimeout(r, delayMs));
        const response = await fetchImpl(url, { method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'ashare-private-research-metadata/1.0' } });
        if (!response.ok) throw new Error(`NBD HTTP ${response.status}; stop without bypass/retry`);
        const data = await response.text();
        if (data.length > 4000000) throw new Error('Unexpectedly large response');
        sources.push({ url, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(data).digest('hex') });
        return { data, url };
    };
}

// The selector, Cheerio traversal, title/link mapping and feed shape below are
// preserved from the upstream route; changes bound requests and remove full text.
export async function collect({ category = '3', limit = 3, get, now = () => new Date().toISOString() } = {}) {
    if (!/^\d+$/.test(category)) throw new Error('Category must be numeric');
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Limit must be 1–10');
    const sources = [], warnings = [];
    if (!get) {
      const r=await fetch(ROOT+'/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(15000)});
      if(!r.ok) throw new Error('Robots unavailable; manual review required');
      const robots=await r.text(); const hash=createHash('sha256').update(robots).digest('hex');
      if(hash!=='a74b3d24fa84ed5cc1ffab7457eb8d877bcae8b81e033a0517201d04aaf9665e') throw new Error('Robots changed; manual review required before crawling');
      sources.push({url:ROOT+'/robots.txt',fetchedAt:now(),sha256:hash});
    }
    const got = get ?? createHttpGet({ sources, maxRequests: limit + 1 });
    const currentUrl = `${ROOT}/columns/${category}/`;
    const response = await got({ method: 'get', url: currentUrl });
    const $ = load(response.data);
    const seen = new Set();
    const list = $('.u-news-title a')
        .toArray()
        .map((item) => {
            const $item = $(item);
            return { title: $item.text(), link: $item.attr('href') };
        })
        .map(item => ({ ...item, title: item.title.trim(), link: articleUrl(item.link) }))
        .filter(item => {
            if (!item.link || !item.title || seen.has(item.link)) return false;
            seen.add(item.link); return true;
        }).slice(0, limit);
    if (!list.length) throw new Error('RSSHub NBD selector returned no eligible articles; source/layout requires review');
    const documents = [];
    // Sequential bounded requests replace upstream's unbounded Promise.all/cache.
    for (const item of list) {
        let publication = { publicationDate: null }, credit = null;
        try {
            const detailResponse = await got({ method: 'get', url: item.link });
            publication = publicationMetadata(detailResponse.data);
            credit = attribution(detailResponse.data);
            if (!credit) { warnings.push('Excluded third-party or unknown-source record'); continue; }
        } catch (e) {
            // Stop network access after an access failure, preserving only the
            // already observed category metadata; do not switch routes or retry.
            warnings.push(String(e.message));
            break;
        }
        const observedAt = now();
        documents.push({
            id: 'rsshub-nbd-' + item.link.match(/\/(\d+)\.html$/)[1],
            code: null, title: item.title, url: item.link, ...publication, ...credit,
            availableAt: observedAt, firstObservedAt: observedAt,
            availabilityBasis: 'observed_only', firstPublicationVerified: false,
            kind: '财经报刊新闻元数据', textStatus: '仅标题、日期、原文链接，未保存正文',
            association: { basis: 'feed_category_not_verified_ticker', category }
        });
    }
    return {
        format: 'ashare-news-metadata/v1', source: 'rsshub-nbd', documents, sources,
        coverage: [{ kind: 'RSSHub NBD', complete: false, category, feedUrl: currentUrl, requestedLimit: limit, returned: documents.length, historicalArchive: false }],
        warnings: [...warnings, 'Recent category feed only; not complete history; no verified ticker association', 'Publication metadata is not proof of historical availability; strict use begins at firstObservedAt', 'Metadata only for private research; upstream code license does not license publisher content']
    };
}
