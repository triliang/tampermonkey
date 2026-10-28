import {ownElement} from '../../../src/content/target-context';
export interface ObservationBlock {id:string;blockHash:string;tag:string;role:string;text:string;accessibleName:string;nameSource:string;context:string;parentRef?:string;attributes?:Record<string,string>;}
const clean=(value:string)=>value.replace(/Bearer\s+[\w.-]+/gi,'[已脱敏]').replace(/\s+/g,' ').trim().slice(0,160);
const forbidden='script,style,noscript,template,textarea,[contenteditable]';
function text(element:Element){if(element.matches('input,'+forbidden))return '';const clone=element.cloneNode(true) as Element;clone.querySelectorAll('input,'+forbidden).forEach(node=>node.remove());return clean(clone.textContent??'');}
function digest(value:string){let hash=2166136261;for(const char of value)hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(16);}
export class DomObservations {
 private sequence=0;private prefix='obs-'+crypto.randomUUID().slice(0,8)+'-';
 private ids=new WeakMap<Element,string>();private blocks=new Map<string,{element:Element;block:ObservationBlock}>();private observer:MutationObserver|null=null;private evidenceRevision=0;private unstable=false;
 private invalidate(records:MutationRecord[]){if(records.length>200){this.blocks.clear();this.unstable=true;this.evidenceRevision++;return;}let changed=false;for(const record of records){const node=record.target instanceof Element?record.target:record.target.parentElement;if(!node||ownElement(node))continue;const changedNodes=[...record.addedNodes,...record.removedNodes];if(record.type==='childList'&&changedNodes.length&&changedNodes.every(child=>child instanceof Element&&ownElement(child)))continue;for(const [id,entry]of this.blocks)if(node===entry.element||node.contains(entry.element)||entry.element.contains(node)){this.blocks.delete(id);changed=true;}}if(changed)this.evidenceRevision++;}
 private observeChanges(){if(!this.observer){this.observer=new MutationObserver(records=>this.invalidate(records));this.observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['id','class','role','aria-label','aria-labelledby','aria-hidden','title','alt','type','placeholder','src','href','style','hidden']});}this.invalidate(this.observer.takeRecords());}
 reset(){this.ids=new WeakMap();this.blocks.clear();}
 private id(element:Element){let id=this.ids.get(element);if(!id){id=this.prefix+(++this.sequence);this.ids.set(element,id);}return id;}
 private describe(element:Element):ObservationBlock{
  let accessibleName='',nameSource='none';
  const labelled=element.getAttribute('aria-labelledby')?.split(/\s+/).slice(0,6).map(id=>document.getElementById(id)).filter((node):node is HTMLElement=>!!node&&!ownElement(node)&&!node.closest('input,'+forbidden)).map(node=>text(node)).join(' ');
  const labels='labels' in element?Array.from((element as HTMLInputElement).labels??[]).map(label=>text(label)).join(' '):'';
  for(const [source,value]of [['aria-labelledby',labelled],['aria-label',element.getAttribute('aria-label')],['label',labels],['alt',element.getAttribute('alt')],['title',element.getAttribute('title')],['placeholder',element.getAttribute('placeholder')],['text',text(element)]])if(value){accessibleName=clean(value);nameSource=source??'none';break;}
  const attributes:Record<string,string>={};for(const key of ['id','class','role','type','placeholder','alt','title','src','href']){let value=element.getAttribute(key);if(!value)continue;if(key==='src'||key==='href')try{const url=new URL(value,document.baseURI);value=['http:','https:'].includes(url.protocol)?url.origin+url.pathname:'[非 HTTP 引用]';}catch{continue;}attributes[key]=clean(value).slice(0,80);}
  const base={attributes,id:this.id(element),tag:element.tagName.toLowerCase(),role:clean(element.getAttribute('role')??''),text:text(element),accessibleName,nameSource,context:clean(element.parentElement?.getAttribute('aria-label')??(element.parentElement?.querySelector('h1,h2,h3,legend')?text(element.parentElement.querySelector('h1,h2,h3,legend')!):'')),parentRef:element.parentElement?this.id(element.parentElement):undefined};
  return {...base,blockHash:digest(JSON.stringify(base))};
 }
 collect(){
  this.observeChanges();
  const nodes=document.querySelectorAll('main,article,nav,header,footer,section,aside,div,form,label,button,input,select,a,img,svg,use,[role],h1,h2,h3,li,p');
  const sample=<T,>(items:ArrayLike<T>,limit:number):T[]=>items.length<=limit?Array.from(items):limit===1?[items[0]]:Array.from({length:limit},(_,i)=>items[Math.floor(i*(items.length-1)/(limit-1))]);
  const candidates:Array<{element:Element;block:ObservationBlock;size:number}>=[];const styles=new Map<Element,CSSStyleDeclaration>();const sampled=sample(nodes,800);let truncated=nodes.length>800;
  for(const element of sampled){if(ownElement(element)||element.closest(forbidden))continue;
   let hidden=false;for(let node:Element|null=element;node;node=node.parentElement){let style=styles.get(node);if(!style){style=getComputedStyle(node);styles.set(node,style);}if(node.hasAttribute('hidden')||node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'){hidden=true;break;}}if(hidden||!element.getClientRects().length)continue;
   const block=this.describe(element);if(!block.accessibleName&&!block.text&&!element.matches('button,input,a,img,svg,use,[role]'))continue;
   candidates.push({element,block,size:new TextEncoder().encode(JSON.stringify(block)).length});
  }
  let limit=Math.min(240,candidates.length),selected=sample(candidates,limit);let bytes=selected.reduce((sum,entry)=>sum+entry.size,0);
  while(bytes>90000&&limit>1){limit=Math.max(1,Math.min(limit-1,Math.floor(limit*90000/bytes)));selected=sample(candidates,limit);bytes=selected.reduce((sum,entry)=>sum+entry.size,0);}
  truncated ||= selected.length<candidates.length;this.blocks.clear();for(const entry of selected)this.blocks.set(entry.block.id,{element:entry.element,block:entry.block});const blocks=selected.map(entry=>entry.block);
  return {blocks,evidenceRevision:this.evidenceRevision,scanned:sampled.length,truncated:truncated||this.unstable,coverage:`主文档 ${nodes.length} 个匹配节点中分布采样 ${sampled.length} 个，保留 ${blocks.length} 个观察块；${truncated?'这是跨文档位置的有界采样，不是整页覆盖。':'当前匹配节点已在本次观察范围内。'}名称由 DOM 属性和标签推导，不是完整可访问性树。未读取输入值、iframe/Shadow DOM 内部。`};
 }
 read(id:string){this.observeChanges();const entry=this.blocks.get(id);if(!entry||!entry.element.isConnected||JSON.stringify(this.describe(entry.element))!==JSON.stringify(entry.block))throw Error('TARGET_STALE');return {element:entry.element,block:entry.block};}
}
