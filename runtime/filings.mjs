import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const runFile=promisify(execFile);

export async function extractFiling(url,{fetchImpl=fetch,maxPages=30}={}) {
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>50)throw Error('PDF解析页数须为1至50');
  const source=new URL(url);
  if(source.origin!=='https://static.cninfo.com.cn'||!/^\/finalpage\/\d{4}-\d{2}-\d{2}\/\d+\.PDF$/i.test(source.pathname)||source.search||source.hash)throw Error('仅解析当前数据集中巨潮公告的原始PDF链接');
  const response=await fetchImpl(source.href,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'AshareReplayResearch/1.0'}});
  if(!response.ok)throw Error('公告PDF来源HTTP '+response.status+'，未绕过或重试');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>33554432)throw Error('PDF超过32MiB单文件读取预算');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('来源没有返回PDF文件');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ashare-filing-'));
  try {
    const filename=path.join(dir,'source.pdf');await fs.writeFile(filename,bytes,{mode:0o600});
    let stdout,pagesTotal;try {const info=await runFile('pdfinfo',[filename],{timeout:5000,maxBuffer:20000,encoding:'utf8'});pagesTotal=Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);if(!Number.isInteger(pagesTotal)||pagesTotal<1)throw Error('unknown pages');({stdout}=await runFile('pdftotext',['-f','1','-l',String(Math.min(maxPages,pagesTotal)),'-layout','-enc','UTF-8',filename,'-'],{timeout:20000,maxBuffer:2000000,encoding:'utf8'}));}catch{throw Error('PDF文本提取失败；请安装poppler-utils，扫描件需另外OCR，未伪造正文');}
    const text=stdout.replace(/\u0000/g,'').trim();if(text.length<30)throw Error('PDF没有足够可提取文本，可能为扫描件，需要OCR');
    const pagesExtracted=Math.min(maxPages,pagesTotal),truncated=text.length>500000||pagesExtracted<pagesTotal;
    return {text:text.slice(0,500000),sha256:createHash('sha256').update(bytes).digest('hex'),fetchedAt:new Date().toISOString(),bytes:size,parser:'pdftotext',pagesTotal,pagesExtracted,truncated,textStatus:'PDF文本已提取（'+pagesExtracted+'/'+pagesTotal+'页），未结构化财务表格；当前下载版本，不保证不可变历史版本'};
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}
