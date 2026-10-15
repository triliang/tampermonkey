const output=document.querySelector('#output'),status=document.querySelector('#status');
async function send(command){status.textContent='执行中：'+command;try{const result=await chrome.runtime.sendMessage({command});output.textContent=JSON.stringify(result,null,2);status.textContent=result.ok?'完成：'+command:'失败：'+(result.error||command);return result;}catch(e){status.textContent='失败：'+e.message;output.textContent=e.stack;}}
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>send(b.dataset.command));
document.querySelector('#grant').onclick=()=>{const request=chrome.permissions.request({origins:['http://localhost/*']});request.then(async granted=>{status.textContent=granted?'本地网站已授权':'授权已拒绝';await send('status');}).catch(e=>status.textContent=e.message);};
document.querySelector('#fixture').onclick=()=>chrome.tabs.create({url:'http://localhost:18888/fixture.html?visit='+Date.now()});
document.querySelector('#other').onclick=()=>chrome.tabs.create({url:'http://127.0.0.1:18888/fixture.html?other='+Date.now()});
document.querySelector('#download').onclick=async()=>{const result=await send('status');if(!result?.ok)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='luban-v2-p0-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
send('status');
