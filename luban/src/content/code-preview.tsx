import {render} from 'preact';
import {useState} from 'preact/hooks';
import {CodeArtifactDialog} from '../sidepanel/components/CodeArtifactDialog';
import type {CodePreviewMessage,CodePreviewSnapshot} from '../shared/code-preview-types';
import type {LubanResponse} from '../shared/messages';
import panelStyles from '../sidepanel/styles/panel.css?inline';
let active:{sessionId:string;host:HTMLElement;mount:HTMLElement;dirty:boolean}|null=null;
async function action(snapshot:CodePreviewSnapshot,extra:Omit<Extract<CodePreviewMessage,{type:'CODE_PREVIEW_ACTION'}>,'type'|'requestId'|'sessionId'>){
 const response=await chrome.runtime.sendMessage({type:'CODE_PREVIEW_ACTION',requestId:crypto.randomUUID(),sessionId:snapshot.sessionId,...extra}) as LubanResponse<CodePreviewSnapshot>;
 if(!response?.ok)throw Error(response?.error.message??'代码浮层连接中断，请关闭后重新打开。');return response.data;
}
function remove(){if(active){render(null,active.mount);active.host.remove();active=null;}}
export function dismissCodePreview(sessionId:string){if(!active||active.sessionId!==sessionId)return{ok:true};if(active.dirty)return{ok:false,error:'网页代码有未保留的编辑，请先保留或放弃。'};remove();return{ok:true};}
export async function showCodePreview(snapshot:CodePreviewSnapshot){
 if(active?.dirty)return{ok:false,error:'请先保留或放弃网页浮层中的代码编辑。'};
 if(active){const id=active.sessionId;remove();void chrome.runtime.sendMessage({type:'CODE_PREVIEW_ACTION',requestId:crypto.randomUUID(),sessionId:id,action:'close'}).catch(()=>{});}
 const host=document.createElement('div');host.dataset.lubanUi='code-preview';const shadow=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=panelStyles+`\n:host{all:initial}.page-code-root{font-family:system-ui,-apple-system,sans-serif;color:#24352e}.page-code-root .chat-code-dialog{position:fixed;inset:3vh 3vw;margin:auto;width:min(1100px,94vw);height:94vh;max-height:94vh;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto}.page-code-root .chat-code-lines{flex:1;min-height:0;max-height:none}.page-code-root .chat-code-dialog>footer{flex-shrink:0;max-height:24vh;overflow:auto}.page-code-root .chat-edit{flex:1;min-height:0;display:flex;flex-wrap:wrap;gap:8px}.page-code-root .chat-edit textarea{height:calc(100% - 40px)}.page-code-root .chat-code-dialog>header{position:static;flex-shrink:0}.page-code-root button{cursor:pointer}`;
 try{const sheet=new CSSStyleSheet();sheet.replaceSync(style.textContent??'');shadow.adoptedStyleSheets=[sheet];}catch{shadow.append(style);}
 const mount=document.createElement('div');mount.className='page-code-root';shadow.append(mount);document.documentElement.append(host);active={sessionId:snapshot.sessionId,host,mount,dirty:false};
 function Preview(){const [value,setValue]=useState(snapshot),[dirty,setDirty]=useState(false);
  async function close(more=false){remove();await action(value,{action:more?'more':'close'}).catch(()=>{});}
  return <><CodeArtifactDialog open current={value.current} saved={value.saved} previous={value.previous} name={value.name} onName={()=>{}} nameReadOnly onClose={()=>void close()} onDirtyChange={v=>{if(active?.sessionId===value.sessionId)active.dirty=v;setDirty(v);}} hasReference={value.hasReference} busy={false} onReference={async(v,lines)=>{setValue(await action(value,{action:'reference',versionId:v.versionId,lines}));}} onEdit={async code=>{setValue(await action(value,{action:'edit',code}));}}><p>更多操作、权限与诊断在右侧工作区中。</p><button disabled={dirty} onClick={()=>void close(true)}>在侧栏打开更多操作</button></CodeArtifactDialog></>;
 }
 try{render(<Preview/>,mount);return{ok:true};}catch(e){remove();return{ok:false,error:String(e)};}
}
