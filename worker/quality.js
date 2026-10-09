import {evidenceDocument,isNewsDocument,relatedStockCodes,documentForStock} from './reading.js';
import {classifyAshare} from './catalogue.js';
import {tradingRule,visibleDocuments,validDate} from './engine.js';

// Coverage is measured against a dated calendar, never against the bars themselves.
export function auditDataset(d,{asOf=d.end,newsMode='strict_observed'}={}) {
  if(!validDate(asOf)||asOf<d.start||asOf>d.end)throw Error('审计截止日期须在数据集范围内');
  const days=(d.dailySupport?.calendar||[]).filter(x=>x.date>=d.start&&x.date<=asOf);
  const visible=visibleDocuments(d.documents||[],asOf,newsMode);
  const rows=d.stocks.map(stock=>{
    const exchange=classifyAshare(stock.code)?.exchange;
    const calendar=days.filter(x=>x.exchanges?.includes(exchange));
    const expected=calendar.filter(x=>x.isOpen).map(x=>x.date);
    const bars=stock.bars.filter(b=>b.date>=d.start&&b.date<=asOf);
    const missing=expected.filter(date=>!bars.some(b=>b.date===date));
    const unknownYears=[];for(let year=+d.start.slice(0,4);year<=+asOf.slice(0,4);year++)if(!calendar.some(c=>c.date.startsWith(String(year))))unknownYears.push(year);
    const hits=(d.documents||[]).filter(x=>x.code===stock.code||x.association?.requestedCompanyCode===stock.code);const docs=(d.documents||[]).filter(x=>documentForStock(x,stock));
    const news=docs.filter(x=>!String(x.kind).includes('公告'));
    const rules=bars.filter(b=>tradingRule(stock,b.date).supported).length;
    return {code:stock.code,name:stock.name,exchange,bars:bars.length,expectedTradingDays:unknownYears.length?null:expected.length,calendarUnknownYears:unknownYears,missingDates:missing,zeroVolumeDates:bars.filter(b=>b.volume===0).map(b=>b.date),first:bars[0]?.date||null,last:bars.at(-1)?.date||null,priceCoverage:unknownYears.length?null:(expected.length?(expected.length-missing.length)/expected.length:null),verifiedRuleDays:rules,unverifiedRuleDays:bars.length-rules,announcements:docs.length-news.length,news:news.length,newsSearchHits:hits.filter(isNewsDocument).length,unverifiedNewsHits:hits.filter(x=>isNewsDocument(x)&&!documentForStock(x,stock)).length,visibleDocuments:visible.filter(x=>documentForStock(x,stock)).length,textDocuments:docs.filter(x=>x.text).length,newsComplete:false,status:missing.length?'gaps':unknownYears.length?'calendar_unknown':'prices_covered'};
  });
  const requested=d.requestedCodes||d.stocks.map(s=>s.code),missingStocks=requested.filter(c=>!d.stocks.some(s=>s.code===c));
  const findings=[];
  if(missingStocks.length)findings.push({severity:'error',kind:'missing_stocks',codes:missingStocks,message:'所选股票未全部采集成功'});
  for(const s of rows){if(s.missingDates.length)findings.push({severity:'error',kind:'missing_bars',code:s.code,message:s.missingDates.length+'个预计交易日缺少行情，不能自动当作停牌'});if(s.calendarUnknownYears.length)findings.push({severity:'warning',kind:'calendar_unknown',code:s.code,message:'缺少该市场/年份的核验交易日历'});if(s.unverifiedRuleDays)findings.push({severity:'warning',kind:'unverified_rules',code:s.code,message:'严格回测需要该期间交易状态证据；研究假设模式会单独标注'});if(!s.news)findings.push({severity:'warning',kind:'no_news_returned',code:s.code,message:'未检索到新闻不代表没有新闻'});}
  const newsDatePathMismatches=(d.documents||[]).filter(isNewsDocument).map(doc=>({id:doc.id,publicationDate:doc.publicationDate,urlDate:String(doc.url||'').match(/^https?:\/\/www\.nbd\.com\.cn\/articles\/(\d{4}-\d{2}-\d{2})\//)?.[1]})).filter(doc=>validDate(doc.publicationDate)&&validDate(doc.urlDate)&&doc.publicationDate!==doc.urlDate);if(newsDatePathMismatches.length)findings.push({severity:'warning',kind:'news_date_path_difference',message:newsDatePathMismatches.length+'条新闻的搜索发布日期与链接日期不同；应复查可见时点，链接日期不能证明首次发表时间'});
  const errors=(d.coverage||[]).filter(x=>!x.resolved&&(x.status==='unavailable'||x.error||x.complete===false&&x.note?.includes('HTTP')));
  for(const error of errors)findings.push({severity:'warning',kind:'source_unavailable',code:error.code,message:error.error||error.note});
  return {asOf,newsMode,stocks:rows,requestedStocks:requested.length,loadedStocks:rows.length,missingStocks,newsDatePathMismatches,visibleDocuments:visible.length,totalDocuments:(d.documents||[]).length,newsArchiveComplete:false,corporateActionsComplete:false,pricesCovered:!missingStocks.length&&rows.every(s=>s.priceCoverage===1),strictReady:!missingStocks.length&&rows.every(s=>s.priceCoverage===1&&!s.unverifiedRuleDays&&!s.missingDates.length),findings,limitations:['搜索命中不能自动认定公司新闻；公司关联仅使用来源证券代码或标题提及，仍不能证明事件主体和因果','新闻检索覆盖已扫描来源和页数，不等于全网完整档案','来源发布日期实验允许历史索引进入回测，但无法证明历史网页版本未修订','未复权价格与不完整企业行动不能代表含分红总收益']};
}

export function searchEvidence(d,date,{query='',codes=d.stocks.map(s=>s.code),limit=24,newsMode='strict_observed'}={}) {
  if(!validDate(date)||date<d.start||date>d.end)throw Error('检索日期超出数据集范围');
  if(!Array.isArray(codes)||codes.some(c=>!d.stocks.some(s=>s.code===c)))throw Error('检索只能使用当前股票池');
  limit=Math.min(40,Math.max(1,Number(limit)||24));
  const terms=String(query).slice(0,300).toLowerCase().split(/[\s,，;；]+/).filter(Boolean);
  const visible=visibleDocuments(d.documents||[],date,newsMode);
  const selected=new Map();
  const rank=doc=>terms.reduce((n,t)=>n+(String(doc.title).toLowerCase().includes(t)?3:0),0);
  const order=docs=>docs.sort((a,b)=>rank(b)-rank(a)||Date.parse(b.availableAt)-Date.parse(a.availableAt));
  // Round-robin avoids one heavily covered company consuming the entire context.
  const groups=codes.map(code=>order(visible.filter(x=>documentForStock(x,d.stocks.find(stock=>stock.code===code)))));
  for(let i=0;i<limit&&selected.size<limit;i++)for(const group of groups){if(group[i]&&selected.size<limit)selected.set(group[i].id,group[i]);}
  for(const doc of order(visible.filter(x=>x.scope==='macro')))if(selected.size<limit)selected.set(doc.id,doc);
  const docs=[...selected.values()].map(x=>evidenceDocument({...x,relatedStockCodes:relatedStockCodes(x,d.stocks)},2000));
  return {query:String(query).slice(0,300),asOf:date+'T15:00:00+08:00',newsMode,codes,documents:docs,prices:d.stocks.filter(s=>codes.includes(s.code)).map(s=>({code:s.code,bars:s.bars.filter(b=>b.date<=date).slice(-30)})),availableDocuments:visible.length,returnedDocuments:docs.length,excludedFutureDocuments:(d.documents||[]).length-visible.length,perStock:codes.map(code=>({code,returnedDocuments:docs.filter(x=>documentForStock(x,d.stocks.find(stock=>stock.code===code))).length})),archiveComplete:false};
}
