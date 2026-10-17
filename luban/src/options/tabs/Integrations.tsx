import {useEffect, useState} from 'preact/hooks';
import {ExternalApprovals} from '../../shared/ExternalApprovals';
import {ChannelSettings} from './ChannelSettings';
import type {BridgeAction, BridgeReply, BridgeSnapshot, LocalTask,LocalTasksReply,PageGrant,PageGrantsReply,UnknownOperation} from '../../shared/bridge-types';

export function Integrations() {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tasks,setTasks]=useState<LocalTask[]>([]);
  const [unknownOperations,setUnknownOperations]=useState<UnknownOperation[]>([]);
  const [taskMessage,setTaskMessage]=useState('');
  const [grants,setGrants]=useState<PageGrant[]>([]);
  const [clientName,setClientName]=useState('本地 Agent');
  const [clients,setClients]=useState<Array<{id:string;name:string;revoked:number}>>([]);
  const [enrollment,setEnrollment]=useState('');
  const [maintenance,setMaintenance]=useState('');
  const [bridgeTasks,setBridgeTasks]=useState<Array<{id:string;workspace_id:string;source:string;kind:string;state:string;recoveryRequired:boolean}>>([]);
  async function admin(action:string,params:Record<string,unknown>={}){
    setBusy(true);setError('');
    try{const reply=await chrome.runtime.sendMessage({type:'V3_BRIDGE_ADMIN',action,...params});if(!reply?.ok)throw Error(reply?.error??'Bridge 管理操作失败。');
      if(action==='enroll')setEnrollment(reply.data.enrollmentCode);
      if(action==='clients')setClients(reply.data.clients);
      if(action==='maintenance')setMaintenance(JSON.stringify(reply.data,null,2));
      if(action==='bridgeTasks'||action==='reviewBridgeTask')setBridgeTasks(reply.data.tasks);
      if(action==='diagnostics'){const blob=new Blob([JSON.stringify(reply.data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='luban-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      if(action==='revokeClient'){setEnrollment('');setClients(clients.map(row=>row.id===params.clientId?{...row,revoked:1}:row));}
    }catch(e){setError(e instanceof Error?e.message:'管理操作失败。');}finally{setBusy(false);}
  }
  async function refreshGrants(action='list',id?:string){setBusy(true);setError('');try{const reply=await chrome.runtime.sendMessage({type:'V3_PAGE_GRANT',action,...(id?{id}:{})}) as PageGrantsReply;if(!reply.ok)throw Error(reply.error);setGrants(reply.data.grants);const status=await chrome.runtime.sendMessage({type:'V3_BRIDGE',action:'status'}) as BridgeReply;if(status.ok)setSnapshot(status.data);}catch(e){setError(e instanceof Error?e.message:'读取授权失败。');}finally{setBusy(false);}}
  async function refreshTasks(action='list',id?:string) {
    setBusy(true);setError('');
    try{const reply=await chrome.runtime.sendMessage({type:'V3_LOCAL_TASKS',action,...(id?{id,reviewed:true}:{})}) as LocalTasksReply;if(!reply?.ok)throw new Error(reply?.error??'任务记录暂不可用。');setTasks(reply.data.tasks);setUnknownOperations(reply.data.unknownOperations);if(reply.data.pruned!==undefined)setTaskMessage(`已清理 ${reply.data.pruned} 条过期任务。`);}
    catch(e){setError(e instanceof Error?e.message:'读取任务失败。');}finally{setBusy(false);}
  }
  async function run(action: BridgeAction) {
    setBusy(true); setError('');
    try {
      if (action === 'connect' && !await chrome.permissions.request({permissions: ['nativeMessaging']})) throw new Error('尚未允许连接本机应用。');
      const reply = await chrome.runtime.sendMessage({type: 'V3_BRIDGE', action}) as BridgeReply;
      if (!reply?.ok) throw new Error(reply?.error ?? '连接服务暂不可用。');
      setSnapshot(reply.data);
    } catch (e) { setError(e instanceof Error ? e.message : '连接失败。');try{const status=await chrome.runtime.sendMessage({type:'V3_BRIDGE',action:'status'}) as BridgeReply;if(status.ok)setSnapshot(status.data);}catch{/* original connection error remains visible */} }
    finally { setBusy(false); }
  }
  useEffect(() => { void run('status').then(()=>refreshTasks()).then(()=>refreshGrants()); }, []);
  const labels = {disconnected: '未连接', connecting: '正在连接', connected: '已连接', error: '连接异常'};
  return <article class="privacy-page">
    <h2>连接与集成</h2>
    <p>将鲁班连接到本机 Bridge。首次连接只配对当前 Chrome 配置档，不会自动开放网页。</p>
    <p>扩展 ID：<code>{chrome.runtime.id}</code></p>
    <p>连接状态：<strong>{snapshot ? labels[snapshot.status] : '正在读取'}</strong></p>
    <p>配对状态：{snapshot?.paired ? '已配对' : '未配对'}</p>
    {snapshot?.profileId && <p>配置档标识：<code>{snapshot.profileId}</code></p>}
    {snapshot?.version && <p>Bridge {snapshot.version} · {snapshot.node} · {snapshot.platform}</p>}
    <p>已授权页面：{snapshot?.pageCount ?? 0}</p>
    <p>可连接本机 Bridge，选择本地 Codex 会话，并向 MCP 与飞书开放明确授权的网页及工具。</p>
    <ChannelSettings/>
    <p><button type="button" disabled={busy} onClick={() => void run('connect')}>连接 / 检查连接</button>{' '}
      <button type="button" disabled={busy || snapshot?.status !== 'connected'} onClick={() => void run('disconnect')}>断开连接</button>{' '}
      <button type="button" disabled={busy || !snapshot?.paired} onClick={() => void run('revoke')}>撤销配对</button></p>
    <p><button type="button" disabled={busy || snapshot?.status !== 'connected'} onClick={() => void run('check-page-access')}>验证未授权页面不可访问</button>{' '}
      <button type="button" disabled={busy} onClick={() => void run('status')}>刷新状态</button></p>
    {snapshot?.message && <p role="status">{snapshot.message}</p>}
    {error && <p role="alert">{error}</p>}
    <p>先加载正式扩展并记录上方 ID，再使用本机包的安装命令注册。断开连接保留配对，撤销配对会使现有凭据失效。</p>
    <h3>授权页面</h3><p>请在目标网页侧栏的快捷设置中明确授权。授权仅绑定当前文档；导航、连接断开及服务重启后需重新授权。</p>
    <button type="button" disabled={busy} onClick={()=>void refreshGrants()}>刷新授权列表</button>{' '}<button type="button" disabled={busy||!grants.length} onClick={()=>void refreshGrants('revoke')}>撤销全部页面授权</button>
    {!grants.length?<p>尚未授权任何网页。</p>:<ul>{grants.map(grant=><li key={grant.id}>{grant.title} · {grant.binding.host}{' '}<button type="button" disabled={busy} onClick={()=>void refreshGrants('revoke',grant.id)}>撤销</button></li>)}</ul>}
    <h3>本地任务记录</h3>
    <ExternalApprovals/>
    <h3>MCP 客户端连接</h3>
    <p>使用本机包中的 <code>luban-mcp-enroll --connection-config /绝对路径/client.json</code>，在标准输入中提供下方一次性配对码。凭据文件仅限本人读取，请勿发到聊天或加入代码仓库。Codex、Cursor 各使用一个独立客户端。</p>
    <p>MCP 启动命令为包内 <code>luban-mcp</code>，参数为 <code>--connection-config /绝对路径/client.json</code>。配置示例及操作步骤见项目文档 <code>docs/v3/verification/v3-s2-mcp-setup.md</code>。</p>
    <p>默认没有页面权限。请在目标网页侧栏授权；勾选工具权限后，只开放当前工具基线和候选提交。外部申请试运行仍需在鲁班本地确认，不能直接保存、删除或执行任意脚本。</p>
    <h3>本地客户端配对</h3><p>配对码 5 分钟有效且仅能使用一次。客户端只访问当前配置档明确授权的页面。</p>
    <label>客户端名称 <input value={clientName} maxLength={80} onInput={e=>setClientName(e.currentTarget.value)}/></label>{' '}
    <button disabled={busy||snapshot?.status!=='connected'} onClick={()=>void admin('enroll',{name:clientName})}>生成一次性配对码</button>{' '}
    <button disabled={busy||snapshot?.status!=='connected'} onClick={()=>void admin('clients')}>刷新客户端</button>
    {enrollment&&<p>一次性配对码：<code>{enrollment}</code>{' '}<button onClick={()=>setEnrollment('')}>隐藏</button></p>}
    <ul>{clients.map(client=><li key={client.id}>{client.name} · {client.revoked?'已撤销':'已配对'}{' '}<button disabled={busy||!!client.revoked} onClick={()=>void admin('revokeClient',{clientId:client.id})}>撤销客户端</button></li>)}</ul>
    <h3>存储与诊断</h3><p>清理仅删除已解决的过期记录。诊断导出仅含固定事件代码与存储统计。</p>
    <button disabled={busy||snapshot?.status!=='connected'} onClick={()=>void admin('maintenance')}>清理过期记录并压缩存储</button>{' '}<button disabled={busy||snapshot?.status!=='connected'} onClick={()=>void admin('diagnostics')}>导出诊断</button>
    {maintenance&&<pre>{maintenance}</pre>}
    <h3>Bridge 外部任务</h3><p>结果未知时先核对页面与草稿；归档不会重跑，也不认定任务成功。</p>
    <button disabled={busy||snapshot?.status!=='connected'} onClick={()=>void admin('bridgeTasks')}>刷新外部任务</button>
    <ul>{bridgeTasks.map(task=><li key={task.id}>{task.source} · {task.kind} · 工作区 {task.workspace_id.slice(0,8)} · {task.state}{' '}{task.recoveryRequired&&<button disabled={busy} onClick={()=>void admin('reviewBridgeTask',{taskId:task.id,reviewed:true})}>已核对，归档为中断</button>}</li>)}</ul>
    {!!unknownOperations.length&&<section><strong>有网页操作结果未知</strong><p>先检查对应网页的实际效果，必要时刷新页面。确认核对只解除后续操作阻塞，不会重跑网页或认定上次执行成功。</p><ul>{unknownOperations.map(op=><li key={op.id}>工作区 {op.workspaceId.slice(0,8)} · 草稿版本 {op.draftRevision}{' '}<button type="button" disabled={busy} onClick={()=>void refreshTasks('reviewUnknown',op.id)}>已核对页面，解除阻塞</button></li>)}</ul></section>}
    <p>显示最近 50 条任务。记录保留 30 天；运行中、等待核对与结果未知的关联任务受到保护。</p>
    <p><button type="button" disabled={busy} onClick={()=>void refreshTasks()}>刷新任务</button>{' '}<button type="button" disabled={busy} onClick={()=>void refreshTasks('prune')}>清理过期任务</button></p>
    {taskMessage&&<p role="status">{taskMessage}</p>}
    {!tasks.length?<p>暂无任务记录。</p>:<table><thead><tr><th>任务</th><th>工作区</th><th>状态</th><th>更新时间</th></tr></thead><tbody>{tasks.map(task=><tr key={task.id}><td>{({generate:'生成',trialRun:'试运行',saveVersion:'保存版本',restoreVersion:'恢复版本',operation:'编辑'} as Record<string,string>)[task.kind]??task.kind}</td><td><code>{task.workspaceId.slice(0,8)}</code></td><td>{({running:'处理中',cancelRequested:'已请求停止',completed:'已结束',failed:'失败',cancelled:'已取消',waitingUser:'等待核对'} as Record<string,string>)[task.state]}{task.errorCode&&` · ${task.errorCode}`}{task.state==='waitingUser'&&<button type="button" disabled={busy||unknownOperations.some(op=>op.workspaceId===task.workspaceId)} onClick={()=>void refreshTasks('reviewTask',task.id)}>已核对，归档为中断</button>}</td><td>{new Date(task.updatedAt).toLocaleString()}</td></tr>)}</tbody></table>}
  </article>;
}
