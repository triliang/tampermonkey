import type { ScriptRecord, ScriptVersion } from '../../shared/v2-types';
export function autoSource(record:ScriptRecord,version:ScriptVersion=record.current):string{
  const identity={scriptId:record.id,versionId:version.versionId,hash:version.hash,generation:record.autoRun.generation};
  return `(async()=>{const identity=${JSON.stringify(identity)};
  function request(kind,extra={}){return new Promise(resolve=>{const requestId=crypto.randomUUID();let done=false;
  const finish=r=>{if(done)return;done=true;clearInterval(retry);clearTimeout(timeout);window.removeEventListener('message',receive);resolve(r);};
  const receive=e=>{if(e.source===window&&e.origin===location.origin&&e.data?.channel==='luban-v2-response'&&e.data.requestId===requestId)finish(e.data.response);};
  window.addEventListener('message',receive);const send=()=>window.postMessage({channel:'luban-v2-request',payload:{...identity,kind,requestId,...extra}},location.origin);
  const retry=setInterval(send,250),timeout=setTimeout(()=>finish({ok:false,error:'内容桥回执超时，正文未获准或 GM 写入未确认。'}),3000);send();});}
  const start=await request('start');if(!start.ok){console.warn('[鲁班]',start.error);return;}
  const {leaseId,gm}=start.data;const marker='luban-auto:'+identity.scriptId;
  if(globalThis[marker])return;globalThis[marker]=true;
  const grants=new Set(${JSON.stringify(version.grants)}),store=Object.assign(Object.create(null),gm);let seq=0,pending=0,queue=Promise.resolve(),warned=false;
  const report=error=>{console.warn('[鲁班]',error);if(!warned){warned=true;void request('result',{leaseId,error:String(error).slice(0,1000)});}};
  const write=(op,key,value)=>{if(typeof key!=='string')throw Error('GM key 必须是字符串');
  if(pending>=128){report('GM 待确认写入过多，已拒绝新增写入');return;}pending++;const n=++seq;queue=queue.then(async()=>{const r=await request('delta',{leaseId,seq:n,op,key,value});if(!r.ok)report(r.error);}).catch(report).finally(()=>{pending--;});};
  const GM_getValue=grants.has('GM_getValue')?((k,d)=>Object.hasOwn(store,k)?store[k]:d):undefined;
  const GM_setValue=grants.has('GM_setValue')?((k,v)=>{if(JSON.stringify(v)===undefined)throw Error('GM 值无法序列化');store[k]=v;write('set',k,v);}):undefined;
  const GM_deleteValue=grants.has('GM_deleteValue')?((k)=>{delete store[k];write('delete',k);}):undefined;
  const GM_addStyle=grants.has('GM_addStyle')?((css)=>{const s=document.createElement('style');s.dataset.lubanScript=identity.scriptId;s.textContent=css;document.documentElement.append(s);}):undefined;
  const info={script:{name:${JSON.stringify(record.name)},version:identity.versionId},version:'0.2.0'};const GM_info=grants.has('GM_info')?(${/\bGM_info\s*\(/.test(version.code)}?Object.assign(()=>info,info):info):undefined;
  const unsafeWindow=grants.has('unsafeWindow')?window:undefined;
  try{await(async()=>{\n${version.code}\n})();await queue;await request('result',{leaseId});}catch(e){await queue;report(String(e));}
  })();`;
}
