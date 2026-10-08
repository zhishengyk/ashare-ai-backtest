import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openDatabase } from '../runtime/database.mjs';
const root = path.resolve('.');
async function freePort() { const s = net.createServer(); s.listen(0,'127.0.0.1'); await once(s,'listening'); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
async function launch(dataDir,port) {
 const child=spawn(process.execPath,['runtime/server.mjs'],{cwd:root,env:{PATH:process.env.PATH,DATA_DIR:dataDir,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let logs=''; child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok)return child;}catch{} await new Promise(r=>setTimeout(r,50));}
 child.kill();throw Error('Startup timeout '+logs);
}
async function stop(child) { const done=once(child,'exit');child.kill('SIGTERM');await done; }
function raw(port,headers){return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path:'/api/datasets',headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);});}
const fixture={start:'2026-09-01',end:'2026-09-04',sources:[],stocks:[{code:'600519',ruleEvidence:[{start:'2026-08-01',end:'2026-10-01',ordinaryTrading:true,st:false,sourceUrl:'https://example.com/test-only-evidence'}],bars:['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04'].map(date=>({date,open:10,high:10,low:10,close:10,volume:100}))}],documents:[],corporateActions:[],warnings:['TEST ONLY SYNTHETIC FIXTURE, not production data'],coverage:[]};
test('standalone HTTP: baseline, restart persistence, safe local boundary and no key persistence',async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'ashare-runtime-')),port=await freePort();let child;
 try{
 child=await launch(data,port);const base=`http://127.0.0.1:${port}`;
 const call=async(url,body)=>{const r=await fetch(base+url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 assert.match(await (await fetch(base)).text(),/本地研究空间/);
 assert.equal((await call('/api/status')).storage,'SQLite');
 assert.ok((await call('/api/stocks?q=600519')).stocks.length);
 assert.equal(await raw(port,{Host:'evil.example'}),403);
 assert.equal(await raw(port,{Origin:'https://evil.example'}),403);
 assert.equal(await raw(port,{'Sec-Fetch-Site':'cross-site'}),403);
 assert.equal((await fetch(base+'/api/import',{method:'POST',body:'{}'})).status,415);
 assert.equal((await fetch(base+'/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(1500001)})).status,413);
 const imported=await call('/api/import',fixture);
 let run=await call('/api/runs',{datasetId:imported.id,acknowledgeLimitations:true,sessionKey:'TEST_ONLY_NOT_A_REAL_SECRET',config:{strategy:'equal'}});
 const stepped=await Promise.all([call(`/api/runs/${run.id}/step`,{expectedVersion:0}),call(`/api/runs/${run.id}/step`,{expectedVersion:0})]);assert.equal(stepped[0].version,1);assert.equal(stepped[1].version,1);
 run=stepped[0];
 await stop(child);child=null;
 child=await launch(data,port);run=await call('/api/runs/'+run.id);assert.equal(run.version,1);assert.equal((await call('/api/datasets')).length,1);
 while(run.state.status!=='completed'){run=await call(`/api/runs/${run.id}/step`,{expectedVersion:run.version});assert.notEqual(run.state.status,'blocked');}
 assert.equal(run.state.curve.length,4);assert.equal(run.state.trades.length,1);assert.equal(run.state.config.mode,'baseline');assert.ok(Number.isFinite(run.metrics.equity));
 assert.equal((await call(`/api/runs/${run.id}/export`)).run.state.status,'completed');
 await stop(child);child=null;
 assert.ok(!fs.readFileSync(path.join(data,'ashare.sqlite')).includes(Buffer.from('TEST_ONLY_NOT_A_REAL_SECRET')));
 const db=openDatabase(data,path.join(root,'drizzle'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM model_attempts').first().n,0);db.close();
 }finally{if(child)await stop(child);fs.rmSync(data,{recursive:true,force:true});}
});
test('SQLite batches roll back atomically and migrations survive reopen',()=>{const data=fs.mkdtempSync(path.join(os.tmpdir(),'ashare-db-'));let db;try{db=openDatabase(data,path.join(root,'drizzle'));assert.throws(()=>db.batch([db.prepare("INSERT INTO settings VALUES('rollback','{}')"),db.prepare("INSERT INTO nonexistent VALUES(1)")]));assert.equal(db.prepare("SELECT * FROM settings WHERE id='rollback'").first(),null);db.close();db=openDatabase(data,path.join(root,'drizzle'));assert.ok(db.prepare('SELECT COUNT(*) AS n FROM _local_migrations').first().n>=3);}finally{db?.close();fs.rmSync(data,{recursive:true,force:true});}});
