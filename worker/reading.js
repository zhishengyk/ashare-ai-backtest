import {sha256} from './collector.js';

export const READING_PROTOCOL='excerpt_receipt_v1';
const READING_PLACEHOLDERS=new Set(['正文未解析，只提供标题','仅提供元数据，正文未解析']);

// A PDF link or a search hit is not article/report text. This describes only
// the bounded excerpt actually supplied to the provider, never the whole file.
export function evidenceDocument(doc,maxChars=2000){
 const source=typeof doc.text==='string'&&!READING_PLACEHOLDERS.has(doc.text.trim())?doc.text:'';
 const excerpt=source.slice(0,maxChars);
 // Normalize PDF table padding before delivery, never after receiving a quote.
 // Audit offsets and hashes always describe this exact transmitted text.
 const text=excerpt.replace(/[ \t]+/g,' ');
 const contentLevel=!text.trim()?'metadata_only':/摘要/.test(doc.textStatus||'')?'summary_excerpt':/PDF|正文|文本已提取/.test(doc.textStatus||'')?'body_excerpt':'provided_text_excerpt';
 return {id:doc.id,code:doc.code||null,association:doc.association||null,title:doc.title,url:doc.url||null,kind:doc.kind||null,publicationDate:doc.publicationDate||null,availableAt:doc.availableAt||null,availabilityBasis:doc.replayAvailabilityBasis||doc.availabilityBasis||'importer_reported',textStatus:doc.textStatus||'文本来源未标注',publisherGeneratedFlash:!!doc.publisherGeneratedFlash,text,contentLevel,sourceTextChars:source.length,excerptSourceChars:excerpt.length,excerptChars:text.length,textTruncated:source.length>excerpt.length,textTransform:'collapse_horizontal_whitespace_v1',sourcePdfHash:doc.pdfHash||null};
}

export async function prepareReadingPacket(packet,{challenge=crypto.randomUUID()}={}){
 const documents=await Promise.all(packet.documents.map(async doc=>({...doc,titleHash:await sha256(doc.title),textHash:await sha256(doc.text||'')})));
 packet.documents=documents;
 packet.readingChallenge=challenge;
 packet.readingInstructions={protocol:READING_PROTOCOL,maxChecks:4,duplicateQuotesCountOnce:true,quoteFields:['title','text'],quoteMaxChars:180,quoteMinNonWhitespaceChars:8,fullDocumentReadingVerified:false};
 return {protocol:READING_PROTOCOL,asOf:packet.asOf,challenge,delivery:'not_attempted',requestHash:null,providerRequestId:null,documents:documents.map(doc=>({...doc})),checks:[],errors:[],status:'not_verified',understandingVerified:false,limits:['校验只能证明返回了与本次输入匹配的原文片段，不能证明完整阅读或正确理解','只提供标题时不能标记为正文阅读；正文窗口之外的内容未送入模型','结论与调仓影响是模型自述，语义正确性及因果关系未自动证明']};
}

function readingError(code,evidenceId=null){return {code,evidenceId};}
export function verifyReadingOutput(value,audit,codes){
 const result={...audit,checks:[],errors:[],understandingVerified:false};
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
  if(!doc){fail('DOCUMENT_NOT_SENT');result.checks.push({evidenceId:typeof id==='string'?id:null,valid:false,errors:issues});continue;}
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
  if(!['increase','decrease','neutral'].includes(check.impact))fail('INVALID_IMPACT');
  if(check.fact!==undefined){
   const fact=check.fact,quote=typeof check.quote==='string'?check.quote:'';
   if(!fact||typeof fact.label!=='string'||fact.label.length<2||fact.label.length>40||typeof fact.value!=='string'||fact.value.length>40||!/[0-9]/.test(fact.value)||typeof fact.unit!=='string'||fact.unit.length>20||!quote.includes(fact.label)||!quote.includes(fact.value)||fact.unit&&!quote.includes(fact.unit))fail('FACT_NOT_IN_QUOTE');
  }
  const quoteKey=JSON.stringify([id,field,check.quote]),redundantQuote=!issues.length&&seen.has(quoteKey);
  if(!issues.length)seen.add(quoteKey);
  result.checks.push({evidenceId:id,field,contentLevel:doc.contentLevel,contentHash:expectedHash,quote:typeof check.quote==='string'?check.quote.slice(0,180):'',offset,claim:typeof check.claim==='string'?check.claim.slice(0,200):'',codes:Array.isArray(check.codes)?check.codes.filter(c=>codes.includes(c)):[],impact:check.impact,...(check.fact?{fact:check.fact}:{}),valid:!issues.length,redundantQuote,errors:issues,semanticClaimVerified:false,portfolioImpactVerified:false});
 }
 for(const id of new Set(cited))if(!result.checks.some(check=>check.evidenceId===id&&check.valid))errors.push(readingError('CITATION_WITHOUT_VERIFIED_QUOTE',id));
 const valid=result.checks.filter(check=>check.valid&&!check.redundantQuote);
 const textChecks=valid.filter(check=>check.field==='text');
 const bodies=audit.documents.filter(doc=>doc.contentLevel!=='metadata_only');
 if(audit.documents.length&&!valid.length)errors.push(readingError('NO_VERIFIED_EXCERPT'));
 if(bodies.length&&!textChecks.length)errors.push(readingError('AVAILABLE_TEXT_NOT_VERIFIED'));
 result.counts={sentDocuments:audit.documents.length,metadataOnlySent:audit.documents.filter(doc=>doc.contentLevel==='metadata_only').length,textExcerptsSent:bodies.length,verifiedTitles:valid.filter(check=>check.field==='title').length,verifiedTextExcerpts:textChecks.length,verifiedFacts:new Set(result.checks.filter(check=>check.valid&&check.fact).map(check=>JSON.stringify([check.evidenceId,check.fact.label,check.fact.value,check.fact.unit]))).size,citedDocuments:new Set(cited).size,verifiedCitations:new Set(valid.map(check=>check.evidenceId)).size};
 result.status=errors.length?'failed':!audit.documents.length?'no_visible_documents':textChecks.length?'text_excerpt_verified':'title_only_verified';
 result.gatePassed=!errors.length;
 return result;
}

export function summarizeRunReading(state){
 const decisions=(state.decisions||[]).filter(decision=>decision.provider||state.config?.mode==='ai');
 const rows=decisions.map(decision=>({date:decision.date,citedDocuments:decision.evidenceIds?.length||0,status:decision.readingAudit?.status||'legacy_unverified',gatePassed:decision.readingAudit?.gatePassed??null,delivery:decision.readingAudit?.delivery||'not_recorded',counts:decision.readingAudit?.counts||null,understandingVerified:false}));
 return {protocol:READING_PROTOCOL,decisions:rows,totalDecisions:rows.length,legacyUnverified:rows.filter(row=>row.status==='legacy_unverified').length,verifiedTitleDecisions:rows.filter(row=>row.status==='title_only_verified').length,verifiedTextDecisions:rows.filter(row=>row.status==='text_excerpt_verified').length,noVisibleDocumentDecisions:rows.filter(row=>row.status==='no_visible_documents').length,failedDecisions:rows.filter(row=>row.status==='failed').length,understandingVerified:false,note:'旧日志只有文档ID引用时，不追溯认定已阅读。原文匹配不等于完整阅读、正确理解或真实的调仓因果。'};
}
