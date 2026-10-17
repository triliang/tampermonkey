let port;const status=document.querySelector('#status');
document.querySelector('#connect').onclick=()=>{port?.disconnect();port=chrome.runtime.connectNative('com.luban.s0_probe');status.textContent='连接中';port.onMessage.addListener(m=>{status.textContent=JSON.stringify(m,null,2);});port.onDisconnect.addListener(()=>{status.textContent=chrome.runtime.lastError?.message||'已断开';port=null;});port.postMessage({protocolVersion:1,requestId:crypto.randomUUID(),method:'health.ping'});};
document.querySelector('#disconnect').onclick=()=>{port?.disconnect();};
