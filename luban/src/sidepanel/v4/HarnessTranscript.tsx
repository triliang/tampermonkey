import {normalizeAssistantOutput} from '../../../contracts/assistant-output.mjs';
import {useEffect,useState} from 'preact/hooks';
import type {ConversationMessage} from '../../shared/v2-types';
import {lineLabel} from '../../shared/code-reference';
import {ChatMarkdown} from '../components/ChatMarkdown';
import {ReasoningDetails} from '../components/ReasoningDetails';
import type {HarnessController} from './useHarnessChat';
import {activitySteps,chatRuns,elapsedLabel,type ChatRun} from './chat-runs';
export function RunActivity({run}:{run:ChatRun}){
 const [open,setOpen]=useState(run.active),[now,setNow]=useState(Date.now());
 useEffect(()=>{if(!run.active){setOpen(false);return;}setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[run.active]);
 const elapsed=elapsedLabel(run.startedAt,run.active?now:run.endedAt);
 const prefix=({active:'正在处理',finished:'共用时',incomplete:'未完成 · 用时',failed:'处理失败 · 用时',stopped:'已停止 · 用时',waiting:'等待确认 · 用时'} as const)[run.state];
 const steps=activitySteps(run.events);
 return <details class={'chat-run-activity'+(run.active?' is-active':'')} open={open}>
  <summary onClick={event=>{event.preventDefault();setOpen(value=>!value);}}><span class="chat-run-indicator" aria-hidden="true"/><span>{elapsed?`${prefix} ${elapsed}`:({active:'正在处理',failed:'处理失败',stopped:'已停止',incomplete:'证据尚不完整',waiting:'等待确认',finished:'处理记录'} as const)[run.state]}</span><span class="chat-run-chevron" aria-hidden="true">›</span></summary>
  <div class="chat-run-content">{steps.length?<ol>{steps.map(step=><li key={step.sequence}><span class="chat-step-icon" aria-hidden="true">{step.type.includes('read')?'▤':step.type.includes('search')?'⌕':step.type==='artifact.candidate'?'◇':step.type.endsWith('.started')?'◌':'✓'}</span><span>{step.label}{step.count>1?<small class="chat-step-count">{step.count} 次</small>:null}</span>{run.startedAt!==undefined?<time title="从本轮开始算起的最近一次活动时间，不是单次调用耗时">开始后 {elapsedLabel(run.startedAt,step.time)}</time>:null}</li>)}</ol>:<p>本轮没有保留可展示的页面操作步骤。</p>}{run.startedAt===undefined?<p>仅显示保留的活动，缺少开始时间，未计算总耗时。</p>:null}</div>
 </details>;
}
export function HarnessTranscript({messages,controller}:{messages:ConversationMessage[];controller:HarnessController}){
 const runs=chatRuns(controller.conversation,messages);
 return <div class="harness-transcript">
 {messages.map((message,index)=><div class="chat-turn-entry" key={message.agentMessageId??`${message.createdAt}:${index}`}>
  {runs.filter(run=>run.beforeMessage===index).map(run=><RunActivity key={run.key} run={run}/>)}
  <article class={'chat-message '+message.role} aria-label={message.role==='user'?'你的消息':'鲁班回复'}><ReasoningDetails stages={message.reasoning??[]} omitted={message.reasoningOmitted}/><ChatMarkdown text={message.role==='assistant'?normalizeAssistantOutput(message.text).text:message.text}/>{message.scriptAttachment?<div class="chat-file-history">📄 {message.scriptAttachment.filename} · {message.scriptAttachment.source==='draft'?'草稿':'保存版'} · {message.scriptAttachment.versionId.slice(0,8)}</div>:null}{message.codeReference?<details class="chat-reference-history"><summary>引用 {message.codeReference.name} · 版本 {message.codeReference.versionId.slice(0,8)} · {lineLabel(message.codeReference.lines)}</summary><pre>{message.codeReference.text}</pre></details>:null}</article>
 </div>)}
 {runs.filter(run=>run.beforeMessage===null).map(run=><RunActivity key={run.key} run={run}/>)}
 {controller.working&&!controller.active?<p class="chat-turn-pending" role="status">正在准备本轮对话…</p>:null}
 </div>;
}
