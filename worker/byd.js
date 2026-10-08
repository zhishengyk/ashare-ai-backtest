/** Bounded official BYD article metadata reader. No body, images, or search API. */
const BYD_ROOT='https://www.byd.com';
export function validateBydUrl(value){const u=new URL(value);if(u.origin!==BYD_ROOT||u.username||u.password||u.search||u.hash||!/^\/cn\/news\/\d{4}\/detail\d+$/.test(u.pathname))throw new Error('Only canonical BYD China news article URLs are allowed');return u.href;}
const cleanByd=s=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').trim();
export function parseBydArticle(html,{url,observedAt,mode='observed_only'}={}){
 url=validateBydUrl(url);if(!['observed_only','reported_publication'].includes(mode))throw new Error('Unsupported availability mode');if(!Number.isFinite(Date.parse(observedAt)))throw new Error('Missing valid observation time');
 const title=html.match(/<[^>]+class="[^"]*cmp-news__detail-title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/)?.[1];
 const raw=html.match(/<[^>]+class="[^"]*cmp-news__detail-date[^"]*"[^>]*>\s*发布于\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*<\//)?.[1];
 if(!title||!raw)throw new Error('BYD article title/publication fields missing; parser stopped');
 const date=raw.slice(0,10);const t=Date.parse(raw.replace(' ','T')+'+08:00');if(!Number.isFinite(t)||new Date(t+8*3600000).toISOString().slice(0,19)!==raw.replace(' ','T')||t>Date.parse(observedAt))throw new Error('Invalid or future reported publication');
 // Date-only conservative gate: next calendar day in Shanghai. Time zone of source timestamp is not documented.
 const nextDay=new Date(Date.parse(date+'T00:00:00+08:00')+86400000).toISOString();
 return {id:'byd:'+url.split('/').pop(),code:'002594',scope:'issuer',source:'比亚迪官方网站',sourceUrl:url,url,title:cleanByd(title),publicationDate:date,reportedPublishedAt:raw,reportedAvailableAt:nextDay,reportedPublishedTimezone:'not_explicit; Asia/Shanghai assumed only for date gate',firstPublicationVerified:false,revisionHistory:'unavailable',firstObservedAt:observedAt,availableAt:mode==='observed_only'?observedAt:nextDay,availabilityBasis:mode,kind:'公司官方新闻元数据',textStatus:'仅标题、来源标注时间和原文链接；未保存正文',body:null,snippet:null};
}
export async function collectByd({urls,mode='observed_only',cache=new Map(),fetchImpl=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>new Date().toISOString()}={}){
 if(!Array.isArray(urls)||urls.length<1||urls.length>3)throw new Error('Supply 1–3 source-discovered article URLs');const unique=[...new Set(urls.map(validateBydUrl))];if(!['observed_only','reported_publication'].includes(mode))throw new Error('Unsupported availability mode');
 let lastRequest=0;const provenance=[];
 async function get(url,robots=false){const prior=cache.get(url);if(prior&&Date.parse(now())-Date.parse(prior.observedAt)<86400000){provenance.push({url,observedAt:prior.observedAt,cached:true,status:prior.status,sha256:prior.sha256,fetchedAt:prior.observedAt});return prior;}
  if(lastRequest)await delay(2000);lastRequest++;const r=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'AShareMetadataResearch/1.0'}});if(!(robots&&r.status===404)&&!r.ok)throw new Error('Source stopped HTTP '+r.status+' at '+url);const html=await r.text();if(html.length>1000000)throw new Error('Source response too large');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html)))].map(x=>x.toString(16).padStart(2,'0')).join('');const item={html,status:r.status,observedAt:now(),sha256:hash};cache.set(url,item);provenance.push({url,observedAt:item.observedAt,cached:false,status:r.status,sha256:hash,fetchedAt:item.observedAt});return item;}
 const robots=await get(BYD_ROOT+'/robots.txt',true);if(robots.status!==404&&robots.html.trim())throw new Error('Changed robots requires review; no articles requested');
 const documents=[];for(const url of unique){const item=await get(url);documents.push(parseBydArticle(item.html,{url,observedAt:item.observedAt,mode}));}
 return{source:'byd_official_metadata',documents,provenance,coverage:{complete:false,requested:unique.length,collected:documents.length,archiveCrawler:false},warnings:['仅比亚迪官方公司新闻，不代表全市场新闻覆盖；仅保存标题、日期和原文链接。',mode==='reported_publication'?'使用当前页面标注的历史发布日期；按下一日上海时间零点进入。修订记录未知，并非严格点时数据。':'严格使用首次观察时间；今天读取的旧文章不进入过去的决策。']};
}
