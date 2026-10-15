// ISOLATED 世界仅转发受限协议；不转发管理指令、Key 或通用网络请求。
(()=>{
  const root=globalThis as typeof globalThis & {__lubanV2Bridge?:boolean};
  if(root.__lubanV2Bridge)return;root.__lubanV2Bridge=true;
  let inFlight=0,count=0,windowAt=Date.now();
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='luban-v2-request')return;
    const payload=event.data.payload;
    if(!payload||!['start','delta','result'].includes(payload.kind)||typeof payload.requestId!=='string'||payload.requestId.length>100)return;
    if(Date.now()-windowAt>1000){windowAt=Date.now();count=0;}
    const reply=(response:unknown)=>window.postMessage({channel:'luban-v2-response',requestId:payload.requestId,response},location.origin);
    if(++count>80||inFlight>=8||JSON.stringify(payload).length>32768){reply({ok:false,error:'运行消息过多或过大。'});return;}
    inFlight++;
    void chrome.runtime.sendMessage({type:'AUTO_BRIDGE',requestId:payload.requestId,payload})
      .then(reply,e=>reply({ok:false,error:String(e)})).finally(()=>{inFlight--;});
  });
})();
