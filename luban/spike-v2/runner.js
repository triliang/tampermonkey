// 仅在扩展后台编译为 userScripts 注册正文；不在页面 eval/new Function。
export function runnerSource(version){return `(${runner.toString()})(${JSON.stringify(version)});`;}
function runner(version){
 const visible=detail=>window.dispatchEvent(new CustomEvent('luban-p0-visible',{detail}));
 let seq=0;
 function request(kind,extra={}){return new Promise(resolve=>{const requestId=crypto.randomUUID();let done=false;const finish=r=>{if(done)return;done=true;clearInterval(retry);clearTimeout(timeout);window.removeEventListener('message',receive);resolve(r);};const receive=e=>{if(e.source===window&&e.data?.channel==='luban-p0-response'&&e.data.requestId===requestId)finish(e.data.response);};window.addEventListener('message',receive);const send=()=>window.postMessage({channel:'luban-p0-request',kind,requestId,version,...extra},location.origin);const retry=setInterval(send,250);const timeout=setTimeout(()=>finish({ok:false,error:'BRIDGE_TIMEOUT: 3 秒无内容桥回执，正文未执行'}),3000);send();});}
 (async()=>{const start=await request('start');if(!start.ok){visible({status:'BLOCKED · 用户正文未执行',version,error:start.error});return;}const store=start.gm;const before={...store};const leaseId=start.leaseId;let queue=Promise.resolve();const acknowledgements=[];function write(op,key,value){const deltaId=leaseId+':'+(++seq);queue=queue.then(()=>request('delta',{leaseId,deltaId,op,key,value})).then(r=>{acknowledgements.push(r);if(!r.ok)throw Error(r.error);});}
 const GM_getValue=(key,def)=>Object.hasOwn(store,key)?store[key]:def;
 const GM_setValue=(key,value)=>{store[key]=value;write('set',key,value);};
 const GM_deleteValue=key=>{delete store[key];write('delete',key);};
 const GM_info={script:{name:'P0 probe',version},version:'0.0.1'};
 document.documentElement.dataset.p0Version=version;
 GM_setValue('visits',GM_getValue('visits',0)+1);GM_setValue('nullable',null);GM_setValue('removeMe','temporary');GM_deleteValue('removeMe');
 await Promise.resolve();GM_setValue('promiseWrites',GM_getValue('promiseWrites',0)+1);
 await new Promise(resolve=>setTimeout(()=>{GM_setValue('timerWrites',GM_getValue('timerWrites',0)+1);resolve();},300));
 try{await queue;const result={status:'PASS · 用户正文 '+version+' 已执行，GM 写入已确认',version,before,after:store,GM_info,acknowledgements:acknowledgements.length};await request('result',{leaseId,result});visible(result);}catch(e){visible({status:'FAIL · GM 写入未确认',version,error:e.message});}
 })();
}
