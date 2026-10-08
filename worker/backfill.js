import {collectCompanyNews} from './news.js';
import {validateDataset} from './engine.js';
import {sha256} from './collector.js';

export function newsMonths(start,end){const result=[];let cursor=start;while(cursor<=end){const next=new Date(Date.UTC(+cursor.slice(0,4),+cursor.slice(5,7),1)).toISOString().slice(0,10),last=new Date(Date.parse(next)-86400000).toISOString().slice(0,10);result.push({start:cursor,end:last<end?last:end});cursor=next;}return result;}

export async function advanceNewsBackfill(db,row,state,version){
 const baseRow=await db.prepare('SELECT payload FROM datasets WHERE id=?').bind(state.baseDatasetId).first();
 if(!baseRow)throw Error('补充新闻的数据集不存在');
 const original=JSON.parse(baseRow.payload),code=state.plan.codes[Math.floor(state.cursor/state.plan.months.length)],range=state.plan.months[state.cursor%state.plan.months.length];
 if(range){
  const stock=original.stocks.find(s=>s.code===code),part={stocks:[stock],start:range.start,end:range.end,documents:[],sources:[],warnings:[],coverage:[]};
  await collectCompanyNews(db,part,{maxPages:state.plan.newsPages});
  delete part.stocks;
  const latest=await db.prepare('SELECT payload FROM collection_jobs WHERE id=?').bind(row.id).first();
  state.background=JSON.parse(latest.payload).background;
  state.lastSlice={codes:[code],...range};state.cursor++;state.completedBatches++;
  if(part.coverage.some(c=>c.status==='unavailable'))state.failedBatches++;
  state.lastUnavailable=part.coverage.filter(c=>c.error).map(c=>({code,reason:c.error}));
  state.status='paused';state.inflightUntil=null;
  await db.batch([db.prepare('INSERT OR REPLACE INTO collection_parts(id,job_id,payload) VALUES(?,?,?)').bind(row.id+':'+(state.cursor-1),row.id,JSON.stringify(part)),db.prepare('UPDATE collection_jobs SET version=version+1,updated=?,payload=? WHERE id=? AND version=?').bind(new Date().toISOString(),JSON.stringify(state),row.id,version)]);
  version++;
 }
 if(state.cursor>=state.total){
  const parts=(await db.prepare('SELECT payload FROM collection_parts WHERE job_id=?').bind(row.id).all()).results.map(r=>JSON.parse(r.payload)),d=structuredClone(original),docs=new Map(d.documents.map(doc=>[doc.url||doc.id,doc]));
  for(const part of parts){for(const doc of part.documents)if(!docs.has(doc.url))docs.set(doc.url,doc);d.sources.push(...part.sources);d.coverage.push(...part.coverage);d.warnings.push(...part.warnings);}
  d.documents=[...docs.values()];d.sources=[...new Map(d.sources.map(x=>[x.url+':'+x.sha256,x])).values()];d.warnings=[...new Set([...d.warnings,'公司新闻按月补充，仍仅覆盖所扫描来源页数；索引修订和历史版本未验证'])];d.parentDatasetId=state.baseDatasetId;d.digest=await sha256(JSON.stringify(d));validateDataset(d);
  const did=crypto.randomUUID(),now=new Date().toISOString();state.status='completed';state.datasetId=did;state.inflightUntil=null;
  await db.batch([db.prepare('INSERT INTO datasets(id,created,payload) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM collection_jobs WHERE id=? AND version=?)').bind(did,now,JSON.stringify(d),row.id,version),db.prepare('UPDATE collection_jobs SET version=version+1,updated=?,payload=? WHERE id=? AND version=?').bind(now,JSON.stringify(state),row.id,version)]);
 }
 const current=await db.prepare('SELECT * FROM collection_jobs WHERE id=?').bind(row.id).first();return {id:current.id,version:current.version,...JSON.parse(current.payload)};
}
