import {useState} from 'preact/hooks';
interface ChannelState{state:string;bound:boolean;target:{pageRef:string;workspaceId:string;executor:string}|null;inbox:Array<{id:string;state:string;task_id:string}>;deliveries:Array<{id:string;body:string;state:string;message_id?:string}>;}
export function ChannelSettings(){
 const [state,setState]=useState<ChannelState>();const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [text,setText]=useState('');const [page,setPage]=useState('');const [preview,setPreview]=useState<{id:string;body:string}>();const [agent,setAgent]=useState('');
 async function call(method:string,params:Record<string,unknown>={}){setBusy(true);setError('');try{const response=await chrome.runtime.sendMessage({type:'V3_BRIDGE_ADMIN',action:'channel',method,params});if(!response?.ok)throw Error(response.error??'飞书操作失败');if(method==='preview')setPreview(response.data.delivery);else{setState(response.data);if(method==='confirm'||method==='cancelPreview')setPreview(undefined);}}catch(e){setError(e instanceof Error?e.message:'飞书操作失败');}finally{setBusy(false);}}
 async function bind(){try{const reply=await chrome.runtime.sendMessage({type:'V3_PAGE_GRANT',action:'list'});if(!reply.ok)throw Error(reply.error);const grants=(reply.data.grants as Array<{id:string;workspaceId?:string;title:string}>).filter(g=>g.workspaceId);if(!page||!grants.some(g=>g.id===page))throw Error('请先在目标网页侧栏勾选工具权限授权，再刷新并选择页面。');await call('bind',{pageRef:page});}catch(e){setError(String(e));}}
 const [pages,setPages]=useState<Array<{id:string;title:string}>>([]);
 async function refreshPages(){const reply=await chrome.runtime.sendMessage({type:'V3_PAGE_GRANT',action:'list'});if(reply.ok)setPages(reply.data.grants.filter((g:{workspaceId?:string})=>g.workspaceId));}
 return <section><h3>本地 Codex</h3><p>仅支持已验证固定 CLI 版本。每轮以最新基线及有限历史建立专用线程；不接管桌面聊天，不自动批准额外权限。</p><button disabled={busy} onClick={()=>{void chrome.runtime.sendMessage({type:'V3_BRIDGE_ADMIN',action:'agentStatus'}).then(reply=>setAgent(reply.ok?JSON.stringify(reply.data):reply.error));}}>检查本地 Codex</button><p role="status">{agent}</p>
 <h3>飞书单用户单聊</h3><p>先按交付指南配置本机 feishu.json，并停止 S0 探针或其他监听端；同一应用只由一台电脑监听。机器人只接受已绑定用户的文本任务，收发状态不等于对方已读。</p>
 <p>状态：{state?.state??'尚未检查'}；目标：{state?.target?'已绑定当前授权工具 / Codex':'未绑定，收到任务将等待用户操作'}</p>
 <button disabled={busy} onClick={()=>void call('status')}>刷新飞书状态</button>{' '}<button disabled={busy||state?.state==='connected'} onClick={()=>void call('connect')}>启动飞书监听</button>{' '}<button disabled={busy||state?.state!=='connected'} onClick={()=>void call('disconnect')}>停止飞书监听</button>
 <p><button disabled={busy} onClick={()=>void refreshPages()}>刷新已授权工具</button><select aria-label="飞书任务目标" value={page} onChange={e=>setPage(e.currentTarget.value)}><option value="">请选择页面</option>{pages.map(g=><option value={g.id}>{g.title}</option>)}</select><button disabled={busy||!page} onClick={()=>void bind()}>绑定飞书任务目标</button></p>
 <p>飞书命令：<code>任务 你的需求</code>、<code>查询 任务编号</code>、<code>取消 任务编号</code>。授权失效后必须重新绑定；不会自动选择活动页或第三方模型。</p>
 <h4>主动发送预览</h4><p>目标固定为配置中绑定的本人单聊。可在下方粘贴并编辑需要发送的结果摘要；不会自动附带代码或页面正文。</p><textarea aria-label="飞书发送正文" maxLength={3000} value={text} onInput={e=>{setText(e.currentTarget.value);setPreview(undefined);}}/>
 <button disabled={busy||!text.trim()||!!preview} onClick={()=>void call('preview',{text})}>预览发送</button>
 {preview&&<article><strong>确认发送给已绑定的本人</strong><pre>{preview.body}</pre><button disabled={busy} onClick={()=>void call('cancelPreview',{deliveryId:preview.id})}>取消发送</button><button disabled={busy} onClick={()=>void call('confirm',{deliveryId:preview.id})}>确认发送</button></article>}
 {error&&<p role="alert">{error}</p>}
 <h4>接收任务</h4>{state?.inbox.map(row=><p>{row.id} · {row.state} · {row.task_id??'尚无网页任务'}</p>)}
 <h4>消息回传</h4>{state?.deliveries.map(row=><article><p>{row.state} {row.message_id?`· 平台消息 ${row.message_id}`:''}</p><pre>{row.body}</pre>{row.state==='failed'&&<button disabled={busy} onClick={()=>void call('retry',{deliveryId:row.id})}>仅重试发送</button>}{row.state==='unknown'&&<p>发送结果未知，请先在飞书核对；不自动重发。</p>}</article>)}
 </section>;
}
