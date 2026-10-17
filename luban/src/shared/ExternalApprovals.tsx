import {useEffect,useState} from 'preact/hooks';
import type {ExternalApproval} from './bridge-types';

export function ExternalApprovals(){
  const [rows,setRows]=useState<Array<ExternalApproval&{code:string}>>([]);
  const [conflicts,setConflicts]=useState<Array<{id:string;source:string;workspaceId:string;expectedDraftRevision:number;candidate:{code:string}}>>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(action='list',id?:string){
    setBusy(true);setError('');
    try{const reply=await chrome.runtime.sendMessage({type:'V3_EXTERNAL_APPROVAL',action,id});if(!reply?.ok)throw Error(reply?.error??'无法读取确认请求。');setRows(reply.data.approvals);setConflicts(reply.data.conflicts??[]);}
    catch(e){setError(e instanceof Error?e.message:'操作失败。');}finally{setBusy(false);}
  }
  useEffect(()=>{void run();},[]);
  return <section class="external-approvals"><h3>外部任务确认</h3><p>外部请求只提交候选。确认试运行后，才会在下方指定页面执行一次；保存仍需使用原有保存流程。</p>
    <button disabled={busy} onClick={()=>void run()}>刷新待确认请求</button>{error&&<p role="alert">{error}</p>}
    {!rows.length?<p>暂无待确认请求。</p>:rows.map(row=><article key={row.id}>
      <p>来源：{row.task.source} · 客户端 {row.task.clientId.slice(0,8)} · 配置档 {row.profileId.slice(0,8)}</p>
      <p>页面：{row.binding.host} · 工作区 {row.workspaceId.slice(0,8)} · 草稿版本 {row.draftRevision}</p>
      <p>代码摘要：<code>{row.codeHash}</code> · 有效期至 {new Date(row.expiresAt).toLocaleTimeString()}</p>
      {row.state==='pending'?<><details onKeyDown={e=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary>检查本次执行代码</summary><pre>{row.code}</pre></details><button disabled={busy} onClick={()=>void run('approve',row.id)}>确认在此页面试运行一次</button>{' '}<button disabled={busy} onClick={()=>void run('reject',row.id)}>拒绝</button></>:row.state==='unknown'?<><p>执行结果未知。请检查页面实际效果；核对后只归档，不重新执行。</p><button disabled={busy} onClick={()=>void run('review',row.id)}>已核对页面，归档为中断</button></>:<p>正在执行，请勿重复操作。</p>}
    </article>)}
    {!!conflicts.length&&<section><h4>未写入的冲突候选</h4><p>当前草稿保持原状。可展开检查候选，整理后在原工作区手动修改。</p>{conflicts.map(row=><details key={row.id}><summary>{row.source} · 工作区 {row.workspaceId.slice(0,8)} · 预期版本 {row.expectedDraftRevision}</summary><pre>{row.candidate.code}</pre></details>)}</section>}
  </section>;
}
