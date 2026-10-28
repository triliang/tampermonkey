import {useEffect,useLayoutEffect,useRef,useState} from 'preact/hooks';
interface Props {value:string;providerName:string;disabled:boolean;onChange:(value:string)=>Promise<void>;onOpen:()=>void;}
export function ModelPicker({value,providerName,disabled,onChange,onOpen}:Props){
 const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const close=(restore=false)=>{setOpen(false);if(restore)queueMicrotask(()=>trigger.current?.focus());};
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(e.target instanceof Node&&!root.current?.contains(e.target))close();};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useLayoutEffect(()=>{if(open)root.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();},[open]);
 async function select(next:string){if(disabled||pending)return;if(next===value){close(true);return;}setPending(true);setError('');try{await onChange(next);close(true);}catch(e){setError(e instanceof Error?e.message:'切换失败，请重试。');}finally{setPending(false);}}
 return <div class="chat-model-picker" ref={root} onFocusOut={e=>{if(e.relatedTarget instanceof Node&&!e.currentTarget.contains(e.relatedTarget))close();}}>
  <button ref={trigger} class={'chat-model-chip'+(open?' expanded':'')} type="button" aria-label="执行方" aria-haspopup="menu" aria-expanded={open} disabled={disabled||pending} title={value==='codex'?'本地 Codex':providerName} onClick={()=>{if(!open){onOpen();setError('');}setOpen(!open);}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();onOpen();setOpen(true);}}}>
   <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></svg><span>{value==='codex'?'本地 Codex':providerName}</span><svg class="chat-model-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
  </button>
  {open?<div class="chat-model-popover" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];const index=items.indexOf(document.activeElement as HTMLButtonElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}}}>
   <div class="chat-model-popover-heading"><strong>选择模型</strong><small>用于接下来的对话</small></div>
   <div role="menu" aria-label="选择模型">{[{id:'provider',name:providerName,description:'使用已配置的模型服务',symbol:'✧'},{id:'codex',name:'本地 Codex',description:'使用本机账号与默认模型',symbol:'⌘'}].map(item=><button type="button" role="menuitemradio" aria-label={item.name} aria-checked={value===item.id} disabled={disabled||pending} class={'chat-model-option'+(value===item.id?' selected':'')} onClick={()=>void select(item.id)}><span class="chat-model-option-icon" aria-hidden="true">{item.symbol}</span><span class="chat-model-option-text"><strong>{item.name}</strong><small>{item.description}</small></span><span class="chat-model-check" aria-hidden="true">{value===item.id?'✓':''}</span></button>)}</div>
   {error?<p role="alert">{error}</p>:null}
   <button class="chat-model-manage" onClick={()=>{close();void chrome.runtime.openOptionsPage();}}>管理模型与连接 <span aria-hidden="true">↗</span></button>
  </div>:null}
 </div>;
}
