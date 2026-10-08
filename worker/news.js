import {collectNbs} from './nbs.js';
import {cachedSupport} from './daily.js';
import {collectNbd} from './nbd.js';
export async function collectCompanyNews(db,d,{maxPages=2}={}){
 for(const stock of d.stocks){
  let offset=0,pages=0,added=0,exhausted=false,error=null,last=null;
  const byUrl=new Map(d.documents.map(x=>[x.url||x.id,x]));
  try{
   while(pages<maxPages){
    const query={keyword:stock.name.replace(/\*?ST|退市|退/g,''),companyCode:stock.code,start:d.start,end:d.end,offset};
    const result=await cachedSupport(db,'company-news:'+JSON.stringify(query)+':'+new Date().toISOString().slice(0,10),()=>collectNbd(query));
    if(result.unavailable)throw Error(result.unavailable);
    for(const doc of result.documents)if(!byUrl.has(doc.url)){byUrl.set(doc.url,doc);added++;}
    d.sources.push(...result.provenance);last=result.coverage;pages++;
    if(last.nextOffset===null){exhausted=true;break;}offset=last.nextOffset;
   }
  }catch(e){error=String(e.message);d.warnings.push(stock.name+' 每经新闻检索未完成：'+error);}
  d.documents=[...byUrl.values()];
  d.coverage.push({code:stock.code,kind:'公司财经新闻',provider:'nbd',start:d.start,end:d.end,status:error?'unavailable':added?'available':'no_results',query:stock.name,pagesRead:pages,documentCount:added,sourceReportedTotal:last?.sourceReportedTotal??null,queryExhausted:exhausted,nextOffset:exhausted?null:offset,complete:false,error,note:'仅已扫描每经公开搜索的原创元数据；不是全网或不可变历史档案。严格模式使用首次观察时间。'});
 }
}
export async function collectAdditionalNews(db,d){let n=await cachedSupport(db,'nbs:'+d.start+':'+d.end+':'+new Date().toISOString().slice(0,10),()=>collectNbs({start:d.start,end:d.end,maxPages:3,mode:'observed_only'}));if(n.unavailable){d.warnings.push('国家统计局宏观发布索引不可用：'+n.unavailable);return;}d.documents.push(...n.documents);d.sources.push(...n.provenance.map(x=>({...x,kind:'国家统计局宏观发布索引',fields:'仅标题、日期、链接；按首次采集时间作为可用门槛，不回填当时已知信息'})));d.warnings.push(...n.warnings,'国家统计局新增来源使用实际采集时间门槛；历史日期/修订记录无法验证，故今天采集的材料不进入过去的AI决策');d.coverage.push({code:'宏观',announcements:0,documentCount:n.documents.length,kind:'国家统计局发布索引',complete:false,note:'读取'+n.coverage.pagesRead+'页；扫描非完整档案，下一页'+n.coverage.nextPage+'。仅宏观，非个股新闻覆盖；历史回测按首次观察时间过滤。'});}
