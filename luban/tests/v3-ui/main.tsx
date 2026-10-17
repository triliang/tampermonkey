import {render} from 'preact';
import {useState} from 'preact/hooks';
import {installHarness} from '../p2/harness';
import App from '../../src/sidepanel/App';
import {ExternalApprovals} from '../../src/shared/ExternalApprovals';
import {SendToFeishu} from '../../src/shared/SendToFeishu';
import {showCodePreview,dismissCodePreview} from '../../src/content/code-preview';
import '../../src/sidepanel/styles/panel.css';
const harness=await installHarness('luban-v3-ui-isolated',true);
const original=chrome.runtime.sendMessage;

chrome.runtime.sendMessage=(async(m:any)=>{
 if(m.type==='V3_EXTERNAL_APPROVAL')return{ok:true,data:{approvals:[{id:'fixture-approval',task:{source:'mcp',clientId:'fixture-client'},profileId:'fixture-profile',binding:{host:'fixture.invalid'},workspaceId:'fixture-workspace',draftRevision:1,codeHash:'a'.repeat(64),expiresAt:Date.now()+600000,state:'pending',code:('// keyboard-layout-fixture-only\n').repeat(100)}],conflicts:[]}};
 if(m.type==='V3_CHANNEL_SEND'){document.querySelector('#send-state')!.textContent=m.method==='confirm'?'错误：不应确认发送':m.method;return{ok:true,data:{delivery:{id:'fixture-delivery',body:m.params.text??'仅用于隔离页面的测试摘要'}}};}
 if(m.type==='OPEN_CODE_PREVIEW'){const r:any=await original(m);if(r.ok){await showCodePreview(harness.preview()!);}return r;}
 if(m.type==='CLOSE_CODE_PREVIEW'){const r=dismissCodePreview(m.sessionId);if(!r.ok)return{ok:false,error:{message:r.error}};return original(m);}
 if(m.type==='CODE_PREVIEW_ACTION'){await harness.previewAction(m);return{ok:true,data:harness.preview()};}
 return original(m);
}) as typeof chrome.runtime.sendMessage;
function Fixture(){const [width,setWidth]=useState(320);return <><header><h1>V3 窄栏键盘验收</h1><p>实际产品组件；模拟模型与传输。不会连接真实扩展、账号、Bridge 或飞书。</p><button onClick={()=>setWidth(320)}>320 像素</button><button onClick={()=>setWidth(360)}>360 像素</button><button onClick={()=>harness.setGenerationDelay(10000)}>慢速生成（10秒）</button><button onClick={()=>void cleanup()}>清理隔离验收数据</button><output id="send-state">未发送</output><p id="layout-state"/><p id="focus-state"/></header><main style={{display:'flex',gap:'24px',alignItems:'flex-start'}}><div id="fixture-panel" style={{width:width+'px',flexShrink:0,height:'760px',border:'1px solid #ccc'}}><App initialView="home" embedded={false}/></div><div class="chat-app" id="fixture-external" style={{width:width+'px',flexShrink:0,height:'760px',overflow:'auto',padding:'12px',boxSizing:'border-box',border:'1px solid #ccc'}}><ExternalApprovals/><SendToFeishu summary={'仅用于隔离页面的测试摘要。'.repeat(30)}/></div></main></>;}
render(<Fixture/>,document.querySelector('#root')!);

const resizeObserver=new ResizeObserver(()=>{const nodes=['fixture-panel','fixture-external'].map(id=>document.getElementById(id));const output=document.querySelector('#layout-state');if(output&&nodes.every(Boolean))output.textContent=nodes.map(e=>`${e!.id}: client=${e!.clientWidth}, scroll=${e!.scrollWidth}`).join(' / ');});resizeObserver.observe(document.getElementById('fixture-panel')!);
const trackFocus=(e:FocusEvent)=>{const el=e.target as HTMLElement;const output=document.querySelector('#focus-state');if(output)output.textContent='焦点：'+(el.getAttribute('aria-label')??el.textContent?.slice(0,40)??el.tagName);};document.addEventListener('focusin',trackFocus);

async function cleanup(){resizeObserver.disconnect();document.removeEventListener('focusin',trackFocus);render(null,document.querySelector('#root')!);await harness.close();await new Promise<void>((resolve,reject)=>{const request=indexedDB.deleteDatabase('luban-v3-ui-isolated');request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});document.querySelector('#root')!.textContent='隔离验收数据已清理；未改动真实扩展、账号或工具。';}
