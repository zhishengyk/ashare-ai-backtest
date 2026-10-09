import {sha256} from './collector.js';

export const READING_PROTOCOL='excerpt_receipt_v1';
export const READING_REFERENCE_PROTOCOL='reference_quote_v2';
export function isNewsDocument(doc){return /新闻/.test(doc.kind||'');}
export function relatedStockCodes(doc,stocks){return stocks.filter(stock=>doc.code===stock.code||isNewsDocument(doc)&&stock.name?.replace(/^\*?ST/,'').length>=2&&String(doc.title).includes(stock.name.replace(/^\*?ST/,''))).map(stock=>stock.code);}
export function documentForStock(doc,stock){return isNewsDocument(doc)?relatedStockCodes(doc,[stock]).includes(stock.code):doc.code===stock.code||doc.association?.requestedCompanyCode===stock.code;}
export function financialFactChallenge(text){
 const labels=['营业收入','营业总收入','营业净收入','利息净收入','归属于上市公司股东的净利润','归母净利润','净利润','总资产','基本每股收益'];
 for(const label of labels){const match=String(text).match(new RegExp('^[ \\t]*'+label+'(?:[（(][^）)\\n]{0,30}[）)])?[ \\t]*[:：]?[ \\t]+([+-]?\\d[\\d,]*(?:\\.\\d+)?)','m'));if(match)return {label,value:match[1],offset:match.index};}return null;
}
const READING_PLACEHOLDERS=new Set(['正文未解析，只提供标题','仅提供元数据，正文未解析']);

// A PDF link or a search hit is not article/report text. This describes only
// the bounded excerpt actually supplied to the provider, never the whole file.
export function evidenceDocument(doc,maxChars=2000){
 const source=typeof doc.text==='string'&&!READING_PLACEHOLDERS.has(doc.text.trim())?doc.text:'';
 const financial=/((季度|半年度|中期|年度).*报告|financial report)/i.test(doc.title||'')?financialFactChallenge(source):null;
 const excerptSourceOffset=financial?Math.max(0,financial.offset-200):0;
 const excerpt=source.slice(excerptSourceOffset,excerptSourceOffset+maxChars);
 // Normalize PDF table padding before delivery, never after receiving a quote.
 // Audit offsets and hashes always describe this exact transmitted text.
 const text=excerpt.replace(/[ \t]+/g,' ');
 const contentLevel=!text.trim()?'metadata_only':/摘要/.test(doc.textStatus||'')?'summary_excerpt':/PDF|正文|文本已提取/.test(doc.textStatus||'')?'body_excerpt':'provided_text_excerpt';
 const financialFactExpected=financial?financialFactChallenge(text):null;
 return {id:doc.id,code:doc.code||null,association:doc.association||null,...(doc.relatedStockCodes?{relatedStockCodes:doc.relatedStockCodes}:{}),title:doc.title,url:doc.url||null,kind:doc.kind||null,publicationDate:doc.publicationDate||null,availableAt:doc.availableAt||null,availabilityBasis:doc.replayAvailabilityBasis||doc.availabilityBasis||'importer_reported',textStatus:doc.textStatus||'文本来源未标注',publisherGeneratedFlash:!!doc.publisherGeneratedFlash,text,contentLevel,sourceTextChars:source.length,excerptSourceOffset,excerptSourceChars:excerpt.length,excerptChars:text.length,textTruncated:source.length>excerpt.length||!!doc.sourceTextPartial,textTransform:'collapse_horizontal_whitespace_v1',sourcePdfHash:doc.pdfHash||null,sourcePdfPages:doc.sourcePdfPages||null,parsedPdfPages:doc.parsedPdfPages||null,sourceTextPartial:!!doc.sourceTextPartial,financialFactExpected,financialFactQuestion:financialFactExpected?.label||null};
}

// A 64-bit random receipt binds one response to one local request. It is not
// an authentication credential. Keep exact equality; never repair a typo.
const createReadingChallenge=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),byte=>byte.toString(16).padStart(2,'0')).join('');
export async function prepareReadingPacket(packet,{challenge=createReadingChallenge(),protocol=READING_PROTOCOL}={}){
 const references=protocol===READING_REFERENCE_PROTOCOL;
 const documents=await Promise.all(packet.documents.map(async(doc,index)=>({...doc,...(references?{titleReference:'D'+String(index+1).padStart(2,'0')+'T',textReference:doc.text?.trim()?'D'+String(index+1).padStart(2,'0')+'B':null}:{}),titleHash:await sha256(doc.title),textHash:await sha256(doc.text||'')})));
 const requirements=packet.readingRequirements||{requireNewsQuote:false};
 const sentFields=['titleReference','textReference','code','association','relatedStockCodes','title','text','kind','availableAt','availabilityBasis','publisherGeneratedFlash','contentLevel','financialFactQuestion'];
 packet.documents=references?documents.map(doc=>Object.fromEntries(sentFields.map(field=>[field,doc[field]??null]))):documents;
 if(references){
  const freshIds=new Set(requirements.newNewsDocumentIds||[]),news=documents.find(doc=>isNewsDocument(doc)&&freshIds.has(doc.id))||documents.find(isNewsDocument),body=documents.find(doc=>doc.textReference);
  const requiredReferences=[...(requirements.requireNewsQuote&&news?[news.titleReference]:[]),...(body?[body.textReference]:[])];
  if(!requiredReferences.length&&documents.length)requiredReferences.push(documents[0].titleReference);
  const {newNewsDocumentIds,...publicRequirements}=requirements;
  packet.readingRequirements={...publicRequirements,newNewsReferences:documents.filter(doc=>freshIds.has(doc.id)).map(doc=>doc.titleReference),requiredReferences,financialQuestions:requirements.requireFinancialFact&&body?.financialFactExpected?[{reference:body.textReference,label:body.financialFactExpected.label}]:[]};
 }
 packet.readingChallenge=challenge;
 packet.readingInstructions={protocol,...(references?{allowedReferences:documents.flatMap(doc=>[doc.titleReference,...(doc.textReference?[doc.textReference]:[])]),expectedChecks:packet.readingRequirements.requiredReferences.length}:{allowedEvidenceIds:documents.map(doc=>doc.id)}),noDocuments:!documents.length,...(!documents.length?{emptyDocumentRule:'evidenceIds和readingChecks都必须为[]；价格不是新闻文档'}:{}),maxChecks:4,duplicateQuotesCountOnce:true,quoteFields:['title','text'],quoteMaxChars:180,quoteMinNonWhitespaceChars:8,fullDocumentReadingVerified:false};
 return {protocol,asOf:packet.asOf,requirements,challenge,delivery:'not_attempted',requestHash:null,providerRequestId:null,documents:documents.map(doc=>({...doc,...(references?{sentFields}: {})})),checks:[],errors:[],status:'not_verified',understandingVerified:false,limits:['校验只能证明返回了与本次输入匹配的原文片段，不能证明完整阅读或正确理解','只提供标题时不能标记为正文阅读；正文窗口之外的内容未送入模型','结论与调仓影响是模型自述，语义正确性及因果关系未自动证明']};
}

function readingError(code,evidenceId=null){return {code,evidenceId};}
function resolveReadingReferences(value,audit){
 const refs=new Map();
 for(const doc of audit.documents){if(doc.titleReference)refs.set(doc.titleReference,{doc,field:'title',hash:doc.titleHash});if(doc.textReference)refs.set(doc.textReference,{doc,field:'text',hash:doc.textHash});}
 const errors=[];
 const checks=Array.isArray(value?.readingChecks)?value.readingChecks.map(check=>{
  const resolved=refs.get(check?.reference);
  if(!resolved){errors.push(readingError('REFERENCE_NOT_SENT'));return {...check,evidenceId:null,_receivedHash:check?.contentHash||null};}
  const {doc,field,hash}=resolved;
  if(check.evidenceId!==undefined&&check.evidenceId!==doc.id)errors.push(readingError('REFERENCE_ID_CONFLICT',doc.id));
  if(check.field!==undefined&&check.field!==field)errors.push(readingError('REFERENCE_FIELD_CONFLICT',doc.id));
  if(check.contentHash!==undefined&&check.contentHash!==hash)errors.push(readingError('CONTENT_HASH_MISMATCH',doc.id));
  return {...check,evidenceId:doc.id,field,contentHash:hash,_receivedHash:check.contentHash||null};
 }):value?.readingChecks;
 const cited=[...new Set((Array.isArray(checks)?checks:[]).filter(check=>check.evidenceId!==null).map(check=>check.evidenceId))];
 if(value?.evidenceIds!==undefined&&(!Array.isArray(value.evidenceIds)||value.evidenceIds.some(id=>!cited.includes(id))||cited.some(id=>!value.evidenceIds.includes(id))))errors.push(readingError('CITATION_REFERENCE_CONFLICT'));
 return {value:{...value,readingChecks:checks,evidenceIds:cited},errors};
}
export function verifyReadingOutput(value,audit,codes){
 const returnedReading=JSON.parse(JSON.stringify({readingReceipt:value?.readingReceipt,evidenceIds:value?.evidenceIds,readingChecks:value?.readingChecks}));
 const result={...audit,returnedReading,checks:[],errors:[],understandingVerified:false};
 const references=audit.protocol===READING_REFERENCE_PROTOCOL;
 if(references){const resolved=resolveReadingReferences(value,audit);value=resolved.value;result.errors.push(...resolved.errors);}
 const errors=result.errors;
 const docs=new Map(audit.documents.map(doc=>[doc.id,doc]));
 const cited=Array.isArray(value?.evidenceIds)?value.evidenceIds:[];
 const checks=Array.isArray(value?.readingChecks)?value.readingChecks:[];
 for(const doc of audit.documents)if(!Number.isFinite(Date.parse(doc.availableAt))||Date.parse(doc.availableAt)>Date.parse(audit.asOf))errors.push(readingError('FUTURE_OR_UNDATED_DOCUMENT_SENT',doc.id));
 if(audit.documents.length&&value?.readingReceipt!==audit.challenge)errors.push(readingError('RECEIPT_MISMATCH'));
 if(value?.readingChecks!==undefined&&!Array.isArray(value.readingChecks)||checks.length>4)errors.push(readingError('INVALID_CHECKS'));
 const seen=new Set();
 for(const check of checks.slice(0,4)){
  const id=check?.evidenceId,doc=docs.get(id),issues=[];
  const fail=code=>{issues.push(code);errors.push(readingError(code,typeof id==='string'?id:null));};
  if(!doc){fail('DOCUMENT_NOT_SENT');result.checks.push({evidenceId:typeof id==='string'?id:null,reference:typeof check?.reference==='string'?check.reference.slice(0,30):null,field:check?.field,receivedContentHash:typeof check?.contentHash==='string'?check.contentHash.slice(0,80):null,quote:typeof check?.quote==='string'?check.quote.slice(0,180):'',claim:typeof check?.claim==='string'?check.claim.slice(0,200):'',codes:Array.isArray(check?.codes)?check.codes.filter(code=>codes.includes(code)):[],impact:check?.impact,valid:false,errors:issues,semanticClaimVerified:false,portfolioImpactVerified:false});continue;}
  if(!cited.includes(id))fail('CHECK_NOT_CITED');
  const field=check.field;
  if(!['title','text'].includes(field))fail('INVALID_QUOTE_FIELD');
  const sent=field==='title'?doc.title:field==='text'?doc.text:'';
  const expectedHash=field==='title'?doc.titleHash:field==='text'?doc.textHash:null;
  if(check.contentHash!==expectedHash)fail('CONTENT_HASH_MISMATCH');
  if(field==='text'&&(doc.contentLevel==='metadata_only'||!doc.text.trim()))fail('BODY_NOT_SENT');
  if(typeof check.quote!=='string'||check.quote.length>180||check.quote.replace(/\s/g,'').length<8)fail('INVALID_QUOTE');
  const offset=typeof check.quote==='string'?sent.indexOf(check.quote):-1;
  if(offset<0)fail('QUOTE_NOT_IN_SENT_CONTENT');
  if(typeof check.claim!=='string'||!check.claim.trim()||check.claim.length>200)fail('INVALID_CLAIM');
  if(!Array.isArray(check.codes)||!check.codes.length||check.codes.some(c=>!codes.includes(c)))fail('STOCK_OUTSIDE_POOL');
  if(Array.isArray(doc.relatedStockCodes)&&doc.relatedStockCodes.length&&Array.isArray(check.codes)&&check.codes.some(code=>!doc.relatedStockCodes.includes(code)))fail('STOCK_NOT_SUPPORTED_BY_DOCUMENT');
  if(!['increase','decrease','neutral'].includes(check.impact))fail('INVALID_IMPACT');
  if(check.fact!==undefined){
   const fact=check.fact,quote=typeof check.quote==='string'?check.quote:'';
   if(!fact||typeof fact.label!=='string'||fact.label.length<2||fact.label.length>40||typeof fact.value!=='string'||fact.value.length>40||!/[0-9]/.test(fact.value)||typeof fact.unit!=='string'||fact.unit.length>20||!quote.includes(fact.label)||!quote.includes(fact.value)||fact.unit&&!quote.includes(fact.unit))fail('FACT_NOT_IN_QUOTE');
   if(audit.requirements?.requireFinancialFact&&doc.financialFactExpected&&(fact?.label!==doc.financialFactExpected.label||fact?.value!==doc.financialFactExpected.value))fail('FINANCIAL_VALUE_MISMATCH');
  }
  const quoteKey=JSON.stringify([id,field,check.quote]),redundantQuote=!issues.length&&seen.has(quoteKey);
  const quoteFact=field==='text'&&typeof check.quote==='string'?financialFactChallenge(check.quote):null,expectedFact=doc.financialFactExpected;
  const verifiedFinancialFact=!issues.length&&quoteFact&&expectedFact&&quoteFact.label===expectedFact.label&&quoteFact.value===expectedFact.value?{label:quoteFact.label,value:quoteFact.value,unit:check.fact?.unit||null,method:check.fact?'model_structured_fact':'server_extract_from_verified_quote',periodVerified:false,unitVerified:!!check.fact?.unit}:null;
  if(!issues.length)seen.add(quoteKey);
  const receivedHash=references?check._receivedHash:check.contentHash;
  result.checks.push({evidenceId:id,reference:typeof check.reference==='string'?check.reference.slice(0,30):null,field,contentLevel:doc.contentLevel,contentHash:expectedHash,hashEchoRequired:!references,receivedContentHash:typeof receivedHash==='string'?receivedHash.slice(0,80):null,quote:typeof check.quote==='string'?check.quote.slice(0,180):'',offset,claim:typeof check.claim==='string'?check.claim.slice(0,200):'',codes:Array.isArray(check.codes)?check.codes.filter(c=>codes.includes(c)):[],impact:check.impact,...(check.fact?{fact:check.fact}:{}),verifiedFinancialFact,valid:!issues.length,redundantQuote,errors:issues,semanticClaimVerified:false,portfolioImpactVerified:false});
 }
 for(const id of new Set(cited))if(!result.checks.some(check=>check.evidenceId===id&&check.valid))errors.push(readingError('CITATION_WITHOUT_VERIFIED_QUOTE',id));
 const valid=result.checks.filter(check=>check.valid&&!check.redundantQuote);
 const textChecks=valid.filter(check=>check.field==='text');
 const bodies=audit.documents.filter(doc=>doc.contentLevel!=='metadata_only');
 const news=audit.documents.filter(isNewsDocument),newsChecks=valid.filter(check=>isNewsDocument(docs.get(check.evidenceId)));
 if(audit.documents.length&&!valid.length)errors.push(readingError('NO_VERIFIED_EXCERPT'));
 if(bodies.length&&!textChecks.length)errors.push(readingError('AVAILABLE_TEXT_NOT_VERIFIED'));
 const financials=audit.documents.filter(doc=>doc.financialFactExpected);
 if(audit.requirements?.requireFinancialFact&&financials.length&&!valid.some(check=>check.verifiedFinancialFact))errors.push(readingError('AVAILABLE_FINANCIAL_FACT_NOT_VERIFIED'));
 if(audit.requirements?.requireNewsQuote&&news.length&&!newsChecks.length)errors.push(readingError('AVAILABLE_NEWS_NOT_VERIFIED'));
 const previousCutoff=audit.requirements?.previousCutoff,newNews=news.filter(doc=>!previousCutoff||Date.parse(doc.availableAt)>Date.parse(previousCutoff)),newNewsChecks=newsChecks.filter(check=>newNews.some(doc=>doc.id===check.evidenceId));
 if(audit.requirements?.requireNewNewsQuote&&newNews.length&&!newNewsChecks.length)errors.push(readingError('AVAILABLE_NEW_NEWS_NOT_VERIFIED'));
 result.counts={sentDocuments:audit.documents.length,metadataOnlySent:audit.documents.filter(doc=>doc.contentLevel==='metadata_only').length,textExcerptsSent:bodies.length,sentNewsDocuments:news.length,sentNewNewsDocuments:newNews.length,verifiedNewsDocuments:new Set(newsChecks.map(check=>check.evidenceId)).size,verifiedNewNewsDocuments:new Set(newNewsChecks.map(check=>check.evidenceId)).size,verifiedNewsTitles:newsChecks.filter(check=>check.field==='title').length,verifiedNewsTextExcerpts:newsChecks.filter(check=>check.field==='text').length,verifiedTitles:valid.filter(check=>check.field==='title').length,verifiedTextExcerpts:textChecks.length,verifiedFinancialFacts:valid.filter(check=>check.verifiedFinancialFact).length,verifiedFacts:new Set(result.checks.filter(check=>check.valid&&check.fact).map(check=>JSON.stringify([check.evidenceId,check.fact.label,check.fact.value,check.fact.unit]))).size,citedDocuments:new Set(cited).size,verifiedCitations:new Set(valid.map(check=>check.evidenceId)).size};
 result.status=errors.length?'failed':!audit.documents.length?'no_visible_documents':textChecks.length?'text_excerpt_verified':'title_only_verified';
 result.gatePassed=!errors.length;
 result.citedEvidenceIds=[...new Set(cited)];
 return result;
}

export function summarizeRunReading(state){
 const decisions=(state.decisions||[]).filter(decision=>decision.provider||state.config?.mode==='ai');
 const rows=decisions.map(decision=>({date:decision.date,protocol:decision.readingAudit?.protocol||null,citedDocuments:decision.evidenceIds?.length||0,status:decision.readingAudit?.status||'legacy_unverified',gatePassed:decision.readingAudit?.gatePassed??null,delivery:decision.readingAudit?.delivery||'not_recorded',counts:decision.readingAudit?.counts||null,understandingVerified:false}));
 const protocols=[...new Set(rows.map(row=>row.protocol).filter(Boolean))];
 return {protocol:protocols.length>1?'mixed':protocols[0]||null,protocols,decisions:rows,totalDecisions:rows.length,legacyUnverified:rows.filter(row=>row.status==='legacy_unverified').length,verifiedTitleDecisions:rows.filter(row=>row.status==='title_only_verified').length,verifiedTextDecisions:rows.filter(row=>row.status==='text_excerpt_verified').length,noVisibleDocumentDecisions:rows.filter(row=>row.status==='no_visible_documents').length,failedDecisions:rows.filter(row=>row.status==='failed').length,understandingVerified:false,note:'旧日志只有文档ID引用时，不追溯认定已阅读。原文匹配不等于完整阅读、正确理解或真实的调仓因果。'};
}
