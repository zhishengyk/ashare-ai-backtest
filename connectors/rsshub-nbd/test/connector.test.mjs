import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, publicationMetadata, articleUrl, createHttpGet, ROOT } from '../connector.mjs';
const url = ROOT + '/articles/2026-10-07/1234567.html';
const category = `<h1>Synthetic fixture</h1><div class="u-news-title"><a href="${url}">Synthetic Company announces fixture event</a><a href="${url}">Duplicate</a><a href="https://example.com/articles/2026-10-07/9.html">External</a></div>`;
test('real upstream selector and metadata schema, no article body', async () => {
 const calls=[]; const out=await collect({now:()=> '2026-10-08T08:00:00Z',get:async ({url:u})=>{calls.push(u);return {data:u===url?'<p class="u-time"><span class="source">每日经济新闻</span></p><script type="application/ld+json">{"datePublished":"2026-10-07 09:30:00"}</script><div class="g-articl-text">SECRET BODY MUST NOT EXPORT</div>':category,url:u};}});
 assert.equal(out.documents.length,1); assert.equal(calls.length,2); assert.equal(out.documents[0].reportedAvailableAt,'2026-10-07T01:30:00.000Z'); assert.equal(out.documents[0].availableAt,'2026-10-08T08:00:00Z');assert.equal(out.documents[0].code,null);assert.equal(out.coverage[0].complete,false);assert.ok(!JSON.stringify(out).includes('SECRET BODY'));
});
test('never derive publication date from URL or observation', async()=>{
 const out=await collect({get:async ({url:u})=>({data:u===url?'<p class="u-time"><span class="source">每日经济新闻</span></p><p>No date</p>':category,url:u})});assert.equal(out.documents[0].publicationDate,null);assert.ok(!('reportedAvailableAt' in out.documents[0]));
});
test('preserves publisher pubDate and rejects invalid dates',()=>{assert.equal(publicationMetadata('"pubDate": "2026-10-07 10:15:00"').reportedAvailableAt,'2026-10-07T02:15:00.000Z');assert.equal(publicationMetadata('"pubDate":"2026-02-30"').publicationDate,null);});
test('rejects unsafe and offsite article URLs',()=>{for(const u of ['https://evil.test/x','javascript:alert(1)','https://www.nbd.com.cn.evil.test/articles/2026-10-07/1.html'])assert.equal(articleUrl(u),null);});
test('empty selector fails loudly',async()=>{await assert.rejects(collect({get:async()=>({data:'<html></html>'})}),/no eligible/);});
test('403 stops with no retry or fallback',async()=>{let n=0; const get=createHttpGet({fetchImpl:async()=>{n++;return {ok:false,status:403}},delayMs:0});await assert.rejects(get({url}),/403/);assert.equal(n,1);});
test('invalid category and oversized limit rejected before network',async()=>{await assert.rejects(collect({category:'../private'}),/numeric/);await assert.rejects(collect({limit:11}),/1–10/);});

test('conflicting source timestamps are not silently selected',()=>{assert.deepEqual(publicationMetadata('<script type="application/ld+json">{"pubDate":"2026-10-07T10:00:00"}</script><script type="application/ld+json">{"pubDate":"2026-10-07T11:00:00"}</script>'),{publicationDate:null,publicationMetadataConflict:true});});
test('query/hash/credentials/robots-excluded URLs rejected',()=>{for(const u of [url+'?x=1',url+'#x',url.replace('https://','https://x:y@'),ROOT+'/articles/2026-10-07/3005502.html'])assert.equal(articleUrl(u),null);});
test('unknown publisher excluded',async()=>{const out=await collect({get:async({url:u})=>({data:u===url?'<p>No attribution</p>':category,url:u})});assert.equal(out.documents.length,0);assert.ok(out.warnings.some(x=>x.includes('unknown-source')));});
