import test from 'node:test';import assert from 'node:assert/strict';import {parseNbsIndex,parseNbsArticleMeta,collectNbs} from '../worker/nbs.js';
const html=`<li><a href="./202609/t20260903_123.html">Example release</a><a href="./202609/t20260903_123.html">Example release</a><span>2026-09-04</span></li><script>createPageHTML(67, 0, "index", "html")</script>`;
const fetcher=async url=>url.endsWith('robots.txt')?new Response('',{status:404}):new Response(html);
const args={start:'2026-09-01',end:'2026-09-30',maxPages:1,fetchImpl:fetcher,delay:async()=>{}};
test('deduplicates index, uses displayed date not URL',()=>{const r=parseNbsIndex(html);assert.equal(r.items.length,1);assert.equal(r.items[0].publicationDate,'2026-09-04');assert.equal(r.pageCount,67);});
test('rejects changed HTML instead of claiming no releases',()=>assert.throws(()=>parseNbsIndex('<html>challenge</html>')));
test('explicit metadata is not certified first publication',()=>{const r=parseNbsArticleMeta('<meta name="PubDate" content="2026/09/30 09:30"><meta name="ArticleTitle" content="Test">');assert.equal(r.sourcePublishedAt,'2026-09-30T09:30:00+08:00');assert.equal(r.revisionHistory,'unavailable');});
test('bounds and conservative next day',async()=>{const r=await collectNbs({...args,mode:'historical_reported'});assert.equal(r.documents[0].availableAt,'2026-09-05T00:00:00+08:00');assert.equal(r.coverage.complete,false);assert.equal(r.documents[0].scope,'macro');});
test('observed mode prevents assumed historical availability',async()=>{const r=await collectNbs({...args,mode:'observed_only'});assert.equal(r.documents[0].availableAt,r.documents[0].firstObservedAt);});
test('403 stops no retry',async()=>{let n=0;await assert.rejects(collectNbs({...args,fetchImpl:async()=>{n++;return new Response('',{status:403});}}),/HTTP 403/);assert.equal(n,1);});
test('new robots rules fail closed',async()=>{let n=0;await assert.rejects(collectNbs({...args,fetchImpl:async()=>{n++;return new Response('User-agent: *\nDisallow: /');}}),/robots.txt changed/);assert.equal(n,1);});
test('max page cap enforced',async()=>assert.rejects(collectNbs({...args,maxPages:4}),/three/));
test('foreign article link ignored',()=>assert.throws(()=>parseNbsIndex(html.replaceAll('./202609/','https://example.com/sj/zxfb/202609/'))));

test('default mode never retroactively releases observed content',async()=>{let r=await collectNbs(args);assert.equal(r.documents[0].availableAt,r.documents[0].firstObservedAt);assert.equal(r.documents[0].availabilityBasis,'observed_only');});
