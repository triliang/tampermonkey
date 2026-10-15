import {useEffect,useRef,useState} from 'preact/hooks';
import type {ReasoningStage} from '../../shared/reasoning';
import {ChatMarkdown} from './ChatMarkdown';
import {reasoningNodes} from './reasoning-nodes';
export function ReasoningDetails({stages,live=false,omitted=false}:{stages:ReasoningStage[];live?:boolean;omitted?:boolean}){
 const [open,setOpen]=useState(live),[mode,setMode]=useState<'auto'|'all'|'none'>('auto'),[overrides,setOverrides]=useState<Record<string,boolean>>({});
 const touched=useRef(false);
 useEffect(()=>{if(!live&&!touched.current)setOpen(false);},[live]);
 const groups=stages.map(s=>({...s,nodes:reasoningNodes(s.text)}));
 const count=groups.reduce((n,s)=>n+s.nodes.length,0);
 const latest=groups.at(-1);const latestId=latest?`${latest.attempt}:${latest.nodes.length-1}`:'';
 if(!stages.length&&!omitted)return null;
 return <details class="chat-reasoning" open={open}><summary onClick={e=>{e.preventDefault();touched.current=true;setOpen(!open);}}>推理过程 · {count} 个节点{omitted?'（历史容量不足，原文未保存）':''}</summary><div class="chat-reasoning-content"><div class="chat-reasoning-actions"><span>模型返回 · 按文本结构分段</span><button type="button" onClick={()=>{touched.current=true;setMode('all');setOverrides({});}}>展开全部</button><button type="button" onClick={()=>{touched.current=true;setMode('none');setOverrides({});}}>收起全部</button></div>{groups.map(s=><section key={s.attempt}><small>{s.attempt===1?'首次请求':'修复请求'}</small><div class="chat-cot-nodes">{s.nodes.map((node,index)=>{const id=`${s.attempt}:${index}`,active=live&&id===latestId;const expanded=overrides[id]??(mode==='all'||mode==='auto'&&active);return <details key={id} class={'chat-cot-node'+(active?' active':'')} open={expanded}><summary onClick={e=>{e.preventDefault();touched.current=true;setOverrides(old=>({...old,[id]:!expanded}));}}><span class="chat-cot-number">{index+1}</span><span class="chat-cot-title">{node.title}</span>{active?<small>最新</small>:null}</summary><div class="chat-cot-body"><ChatMarkdown text={node.text}/></div></details>;})}</div>{s.truncated?<p>展示已达到 64 KiB 上限，后续推理不再展示。</p>:null}</section>)}</div></details>;
}
