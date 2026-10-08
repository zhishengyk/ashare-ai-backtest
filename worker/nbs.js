/** NBS release metadata only. No news prose, authentication, proxies, or denial retry. */
const ROOT='https://www.stats.gov.cn/sj/zxfb/';
export const NBS_TERMS='https://www.stats.gov.cn/wzgl/202302/t20230217_1912857.html';
const clean=s=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').trim();
const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d).toISOString().slice(0,10)===d;
export function parseNbsIndex(html,url=ROOT){
 const items=new Map();
 for(const match of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)){
  const b=match[1], a=b.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i),d=b.match(/<span\b[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/span>/i);
  if(!a||!d)continue;
  const link=new URL(a[1],url);
  if(link.origin!=='https://www.stats.gov.cn'||!/^\/sj\/zxfb\/\d{6}\/t\d{8}_\d+\.html$/.test(link.pathname))continue;
  if(!valid(d[1]))throw Error('Invalid source date');
  const title=clean(a[2]);if(!title)throw Error('Missing source title');
  // Never infer publication date from the URL: URL and visible dates can differ.
  items.set(link.href,{title,url:link.href,publicationDate:d[1]});
 }
 if(!items.size)throw Error('NBS index format changed or no dated records; not an empty-success result');
 const pages=html.match(/createPageHTML\(\s*(\d+)\s*,\s*(\d+)\s*,\s*["']index["']/);
 return {items:[...items.values()],pageCount:pages?+pages[1]:null,pageIndex:pages?+pages[2]:null};
}
export function parseNbsArticleMeta(html){
 const attrs={};for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
  const n=m[0].match(/\bname=["']([^"']+)["']/i),c=m[0].match(/\bcontent=["']([^"']*)["']/i);if(n&&c)attrs[n[1]]=clean(c[1]);
 }
 const raw=attrs.PubDate;if(!/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(raw||''))throw Error('Missing explicit publication timestamp');
 return {title:attrs.ArticleTitle,sourcePublishedAt:raw.replaceAll('/','-').replace(' ','T')+':00+08:00',timestampBasis:'publisher_displayed_not_verified_first_publication',timezoneBasis:'assumed_Asia_Shanghai',revisionHistory:'unavailable'};
}
export async function collectNbs({start,end,pageStart=0,maxPages=3,fetchImpl=fetch,cache=new Map(),delay=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>new Date(),mode='observed_only'}){
 if(!valid(start)||!valid(end)||end<start||(Date.parse(end)-Date.parse(start))/86400000>90)throw Error('Window must be <=90 calendar days');
 if(!Number.isInteger(pageStart)||pageStart<0||pageStart>1000||!Number.isInteger(maxPages)||maxPages<1||maxPages>3)throw Error('At most three archive pages per bounded job');
 if(!['historical_reported','observed_only'].includes(mode))throw Error('Unknown availability mode');
 let count=0;const provenance=[];
 async function read(url,robots=false){
  const cached=cache.get(url);if(cached&&now().getTime()-Date.parse(cached.fetchedAt)<86400000)return cached;
  if(count++)await delay(2000);
  const r=await fetchImpl(url,{headers:{'User-Agent':'AshareReplayResearch/1.0','Accept':'text/html,text/plain'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(robots&&[404,410].includes(r.status))return {raw:'',fetchedAt:now().toISOString(),status:r.status};
  if(!r.ok)throw Error('NBS HTTP '+r.status+'; stopped without retry');
  // Bound bytes while streaming; avoid reading an unlimited upstream response.
  const reader=r.body.getReader(),chunks=[];let bytes=0;
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1500000){await reader.cancel();throw Error('Source response too large');}chunks.push(value);}
  const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
  const raw=new TextDecoder().decode(all),fetchedAt=now().toISOString();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',all))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const result={raw,fetchedAt,sha256:hash,status:r.status};cache.set(url,result);return result;
 }
 const robots=await read('https://www.stats.gov.cn/robots.txt',true);
 // Fail closed if a robots file appears. Review its rules rather than invent a parser.
 if(robots.status===200&&robots.raw.trim())throw Error('NBS robots.txt changed; review access rules before collection');
 const documents=new Map();let nextPage=pageStart,pagesRead=0,reachedStart=false;
 for(let p=pageStart;p<pageStart+maxPages;p++){
  const url=ROOT+(p?'index_'+p+'.html':'index.html'),r=await read(url),parsed=parseNbsIndex(r.raw,url);
  provenance.push({url,fetchedAt:r.fetchedAt,sha256:r.sha256,status:r.status});pagesRead++;nextPage=p+1;
  for(const item of parsed.items){if(item.publicationDate<start){reachedStart=true;continue;}if(item.publicationDate>end)continue;
   const following=new Date(Date.parse(item.publicationDate)+86400000).toISOString().slice(0,10)+'T00:00:00+08:00';
   documents.set(item.url,{id:'nbs-'+item.url.match(/_(\d+)\.html$/)[1],...item,source:'国家统计局',scope:'macro',kind:'官方宏观发布索引',availableAt:mode==='observed_only'?r.fetchedAt:following,timestampPrecision:mode==='observed_only'?'retrieval_timestamp_not_historical_publication':'date_only_conservative_next_day',availabilityBasis:mode,firstObservedAt:r.fetchedAt,revisionHistory:'unavailable',firstPublicationVerified:false,textStatus:'仅标题、日期和来源链接，无新闻正文',attribution:'引自国家统计局网站 https://www.stats.gov.cn',termsUrl:NBS_TERMS});
  }
  if(reachedStart||parsed.pageCount!==null&&nextPage>=parsed.pageCount)break;
 }
 return {source:'nbs',documents:[...documents.values()],provenance,coverage:{type:'bounded_historical_archive',complete:false,pagesRead,nextPage,reachedStart,requestedStart:start,requestedEnd:end},warnings:['全国宏观信息，不是个股新闻覆盖','档案可修订；历史日期不证明当时版本可得',mode==='observed_only'?'实际采集时间作为可用门槛，今天发现的历史资料不回填至过去': '次日门槛避免把日期精度误当盘前可用，但不能消除修订偏差','仅扫描有界页数；没有记录不代表没有发布','原文/署名作品/转载内容不自动采集或再分发']};
}
