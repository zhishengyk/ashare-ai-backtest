import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';

// Real API testing against a configured local platform. No key is read or saved here.
const {values:args}=parseArgs({options:{dataset:{type:'string'},base:{type:'string',default:'http://127.0.0.1:4317'},out:{type:'string',default:'.data/long-test'},frequency:{type:'string',default:'5'},delay:{type:'string',default:'12000'},'price-window':{type:'string',default:'30'},'financial-facts':{type:'boolean'},'reference-quotes':{type:'boolean'},'compact-prices':{type:'boolean'},'model-timeout':{type:'string',default:'90'},'daily-news':{type:'boolean'},'read-final-close':{type:'boolean'},resume:{type:'string'},'research-assumptions':{type:'boolean'},'reported-publication':{type:'boolean'}}});
if(!args.dataset||!args['research-assumptions'])throw Error('Usage: node scripts/long-test.mjs --dataset ID --research-assumptions [--reported-publication]. Historical trading rules are unverified; this test explicitly uses price-only research assumptions.');
const base=new URL(args.base);
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.protocol!=='http:'||base.username||base.password)throw Error('Use the private local HTTP platform URL');
const delay=Number(args.delay),frequency=Number(args.frequency);
if(!Number.isFinite(delay)||delay<0||delay>60000||!Number.isInteger(frequency)||frequency<1||frequency>30)throw Error('Invalid delay or frequency');
process.umask(0o077);
const out=path.resolve(args.out);fs.mkdirSync(out,{recursive:true,mode:0o700});
const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(url,body){const response=await fetch(new URL(url,base),{signal:AbortSignal.timeout(420000),...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Origin:base.origin},body:JSON.stringify(body)})});const value=await response.json();if(!response.ok)throw Error(value.error||'HTTP '+response.status);return value;}
const dataset=await call('/api/datasets/'+encodeURIComponent(args.dataset));
const newsMode=args['reported-publication']?'reported_publication':'strict_observed';
const quality=await call('/api/data-quality?'+new URLSearchParams({datasetId:args.dataset,newsMode}));
assert.equal(quality.pricesCovered,true,'Repair missing stocks/bars before the long test');
const status=await call('/api/model-config');assert.equal(status.configured,true,'Configure the server API key, model and budget first');
const config={priceWindowDays:Number(args['price-window']),requireFinancialFacts:args['financial-facts']===true,readingProtocol:args['reference-quotes']?'reference_quote_v2':'excerpt_receipt_v1',compactPrices:args['compact-prices']===true,modelTimeoutSeconds:Number(args['model-timeout']),requireNewsReading:args['daily-news']===true,readAtFinalClose:args['read-final-close']===true,readingVerification:'enforce',initial:10000000,frequency,ruleMode:'research_assumptions',acknowledgeUnverifiedRules:true,corporateActionMode:'price_only',newsMode,retrievalMode:'ai_search'};
const summary={config,startedAt:new Date().toISOString(),datasetId:args.dataset,window:{start:dataset.start,end:dataset.end},stocks:dataset.stocks.map(s=>({code:s.code,name:s.name})),quality,documents:{total:dataset.documents.length,announcements:dataset.documents.filter(d=>d.kind==='公司公告').length,companyNews:dataset.documents.filter(d=>String(d.kind).includes('新闻')).length},limitations:['Price-only research assumptions; historical trading status and total returns are not verified',newsMode==='reported_publication'?'Publisher dates allow a historical experiment; immutable article revisions are not verified':'First-observed cutoff; newly collected news is unavailable in a past simulation','News archives are partial; source failures, page limits and missing bodies are retained']};
let run,baseline;const diary=[];
try{
 if(args.resume){
  const prior=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8'));
  fs.copyFileSync(path.join(out,'summary.json'),path.join(out,'summary-before-resume-'+prior.runId+'.json'));
  Object.assign(summary,prior);summary.config=config;delete summary.error;delete summary.lastState;
  run=await call('/api/runs/'+encodeURIComponent(args.resume));
  assert.equal(run.datasetId,args.dataset);for(const [key,value]of Object.entries(config))assert.equal(run.state.config[key],value,'Resume config mismatch: '+key);
  diary.push(...JSON.parse(fs.readFileSync(path.join(out,'retrieval-diary.private.json'),'utf8')));assert.equal(diary.length,run.state.decisions.length,'Diary/checkpoint mismatch');
  baseline=await call('/api/runs/'+summary.baseline.id);
  summary.recoveries=[...(summary.recoveries||[]),{fromRunId:summary.runId,runId:run.id,at:new Date().toISOString(),method:'explicit_saved_checkpoint_resume'}];summary.runId=run.id;
 }else{
 baseline=await call('/api/runs',{datasetId:args.dataset,acknowledgeLimitations:true,config:{...config,strategy:'equal'}});
 while(baseline.state.status!=='completed'){baseline=await call(`/api/runs/${baseline.id}/step`,{expectedVersion:baseline.version});assert.notEqual(baseline.state.status,'blocked','Baseline blocked: '+JSON.stringify(baseline.state.logs.slice(-3)));}
 summary.baseline={id:baseline.id,metrics:baseline.metrics,trades:baseline.state.trades.length};
 run=await call('/api/runs',{datasetId:args.dataset,acknowledgeLimitations:true,config:{...config,strategy:'ai'}});summary.runId=run.id;save('retrieval-diary.private.json',diary);save('progress.json',summary);
 }
 let decisions=run.state.decisions.length;
 while(run.state.status!=='completed'){
  const version=run.version;run=await call(`/api/runs/${run.id}/step`,{expectedVersion:version});
  assert.notEqual(run.state.status,'blocked','AI simulation blocked: '+JSON.stringify(run.state.logs.slice(-3)));
  assert.ok(run.state.cash>=-1e-6);
  if(run.state.decisions.length>decisions){
   const d=run.state.decisions.at(-1),snapshot=await call(`/api/runs/${run.id}/snapshot`);
   assert.ok(d.retrieval,'AI did not use the local retrieval tool');
   assert.equal(d.readingAudit?.gatePassed,true,'Original-quote reading verification did not pass');
   assert.ok(d.retrieval.documents.every(doc=>Date.parse(doc.availableAt)<=Date.parse(d.cutoff)),'Future document leaked');
   assert.ok(snapshot.bars.every(s=>s.bars.every(b=>b.date<=snapshot.date)),'Future price leaked');
   assert.ok(d.evidenceIds.every(id=>d.retrieval.documents.some(doc=>doc.id===id)),'Citation is absent from retrieved evidence');
   assert.ok(Object.values(d.weights).reduce((sum,w)=>sum+w,0)<=1.000001,'Over-allocated portfolio');
   const previousCutoff=run.state.index>0?run.state.days[run.state.index-1]+'T15:00:00+08:00':null,newsDocuments=d.readingAudit.documents.filter(doc=>/新闻/.test(doc.kind||'')),newsChecks=d.readingAudit.checks.filter(check=>check.valid&&newsDocuments.some(doc=>doc.id===check.evidenceId));
   const record={date:d.date,executionEligible:d.executionEligible!==false,previousCutoff,sentNews:newsDocuments.length,newNewsSent:newsDocuments.filter(doc=>!previousCutoff||Date.parse(doc.availableAt)>Date.parse(previousCutoff)).length,verifiedNewsDocuments:new Set(newsChecks.map(check=>check.evidenceId)).size,verifiedNewNewsDocuments:new Set(newsChecks.filter(check=>newsDocuments.some(doc=>doc.id===check.evidenceId&&(!previousCutoff||Date.parse(doc.availableAt)>Date.parse(previousCutoff)))).map(check=>check.evidenceId)).size,verifiedFinancialFacts:d.readingAudit.counts.verifiedFinancialFacts,queries:d.retrieval.queries,returnedDocuments:d.retrieval.returnedDocuments,perStock:d.retrieval.perStock,citedDocuments:d.evidenceIds.length,citedNews:d.evidenceIds.filter(id=>String(dataset.documents.find(doc=>doc.id===id)?.kind).includes('新闻')).length,allocationPlan:d.allocationPlan,readingAudit:d.readingAudit,usage:d.usage,requests:d.requests,reason:d.reason};diary.push(record);decisions=run.state.decisions.length;
   save('retrieval-diary.private.json',diary);summary.progress={runId:run.id,date:d.date,version:run.version,days:run.metrics.days,decisions,trades:run.state.trades.length};save('progress.json',summary);console.log(JSON.stringify({date:d.date,decisions,returnedDocuments:record.returnedDocuments,citedNews:record.citedNews,verifiedNews:record.verifiedNewsDocuments,verifiedNewNews:record.verifiedNewNewsDocuments,reading:d.readingAudit.status}));
   if(decisions===1){const replay=await call(`/api/runs/${run.id}/step`,{expectedVersion:version});assert.equal(replay.version,run.version);assert.equal(replay.replayed,true);}
   await wait(delay);
  }
 }
 const exported=await call(`/api/runs/${run.id}/export`);assert.equal(run.metrics.days,run.state.days.length);assert.ok(run.state.trades.every(t=>t.date>t.signalDate));
 summary.ok=true;summary.ai={id:run.id,status:run.state.status,metrics:run.metrics,decisions:diary.length,trades:run.state.trades.length,requests:diary.reduce((sum,d)=>sum+d.requests,0),totalTokens:diary.reduce((sum,d)=>sum+(d.usage.total_tokens||0),0),decisionsWithNewsCitations:diary.filter(d=>d.citedNews).length,verifiedTextDecisions:diary.filter(d=>d.readingAudit?.status==='text_excerpt_verified').length,verifiedTitleDecisions:diary.filter(d=>d.readingAudit?.status==='title_only_verified').length,verifiedNewsDecisions:diary.filter(d=>d.verifiedNewsDocuments>0).length,verifiedNewsTextDecisions:diary.filter(d=>d.readingAudit?.counts.verifiedNewsTextExcerpts>0).length,verifiedNewNewsDecisions:diary.filter(d=>d.verifiedNewNewsDocuments>0).length,finalCloseReading:run.state.decisions.at(-1)?.executionEligible===false,readingChecksPassed:true,cutoffChecksPassed:true,versionReplayPassed:true};save('ai-export.private.json',exported);save('baseline-export.private.json',baseline);
}catch(error){summary.ok=false;summary.error=error.message;summary.lastState=run?{runId:run.id,status:run.state.status,version:run.version,days:run.metrics.days,decisions:run.state.decisions.length}:null;process.exitCode=1;}
summary.finishedAt=new Date().toISOString();save('summary.json',summary);console.log(JSON.stringify({ok:summary.ok,runId:summary.runId,ai:summary.ai,error:summary.error}));
