import {ownElement} from '../target-context';
export interface StructureSummary {tag:string;role?:string;name?:string;heading?:string;}
export interface ObservationBlock {id:string;blockHash:string;tag:string;role:string;text:string;accessibleName:string;nameSource:string;context:string;parentRef?:string;structure?:{ancestors:StructureSummary[];siblings:StructureSummary[];children:StructureSummary[];truncated:boolean};attributes?:Record<string,string>;}
const clean=(value:string)=>value.replace(/Bearer\s+[\w.-]+/gi,'[已脱敏]').replace(/\s+/g,' ').trim().slice(0,160);
const forbidden='script,style,noscript,template,textarea,[contenteditable]';
function text(element:Element){if(element.matches('input,'+forbidden))return '';const clone=element.cloneNode(true) as Element;clone.querySelectorAll('input,[hidden],[aria-hidden="true"],[data-luban-ui],[id^="__luban_"],'+forbidden).forEach(node=>node.remove());return clean(clone.textContent??'');}
function digest(value:string){let hash=2166136261;for(const char of value)hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(16);}
export class DomObservations {
 private sequence=0;private prefix='obs-'+crypto.randomUUID().slice(0,8)+'-';
 private ids=new WeakMap<Element,string>();private blocks=new Map<string,{element:Element;block:ObservationBlock}>();private observer:MutationObserver|null=null;private evidenceRevision=0;private unstable=false;
 private invalidate(records:MutationRecord[]){if(records.length>200){this.blocks.clear();this.unstable=true;this.evidenceRevision++;return;}let changed=false;for(const record of records){const node=record.target instanceof Element?record.target:record.target.parentElement;if(!node||ownElement(node))continue;const changedNodes=[...record.addedNodes,...record.removedNodes];if(record.type==='childList'&&changedNodes.length&&changedNodes.every(child=>child instanceof Element&&ownElement(child)))continue;for(const [id,entry]of this.blocks)if(node===entry.element||node.contains(entry.element)||entry.element.contains(node)){this.blocks.delete(id);changed=true;}}if(changed)this.evidenceRevision++;}
 private observeChanges(){if(!this.observer){this.observer=new MutationObserver(records=>this.invalidate(records));this.observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['id','class','role','aria-label','aria-labelledby','aria-hidden','title','alt','type','placeholder','src','href','style','hidden']});}this.invalidate(this.observer.takeRecords());}
 reset(){this.ids=new WeakMap();this.blocks.clear();}
 private id(element:Element){let id=this.ids.get(element);if(!id){id=this.prefix+(++this.sequence);this.ids.set(element,id);}return id;}
 private summaryCache:Map<Element,StructureSummary>|null=null;
 private visibilityCache:Map<Element,boolean>|null=null;
 private firstChildren(element:Element){const nodes:Element[]=[];for(let i=0;i<Math.min(12,element.children.length);i++)nodes.push(element.children[i]);return nodes;}
 private visible(element:Element){
  const cached=this.visibilityCache?.get(element);if(cached!==undefined)return cached;
  const value=this.computeVisible(element);this.visibilityCache?.set(element,value);return value;
 }
 private computeVisible(element:Element){
  if(ownElement(element)||element.closest(forbidden)||!element.getClientRects().length)return false;
  for(let node:Element|null=element;node;node=node.parentElement){const style=getComputedStyle(node);if(node.hasAttribute('hidden')||node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;}return true;
 }
 private summary(element:Element,includeText=false):StructureSummary{
  const cached=!includeText?this.summaryCache?.get(element):null;if(cached)return cached;
  const heading=this.firstChildren(element).find(child=>child.matches('h1,h2,h3,h4,h5,h6,legend,caption')&&this.visible(child));
  const labelled=element.getAttribute('aria-labelledby')?.split(/\s+/).slice(0,6).map(id=>document.getElementById(id)).filter((node):node is HTMLElement=>!!node&&this.visible(node)).map(node=>text(node)).join(' ');
  const result={tag:element.tagName.toLowerCase(),role:clean(element.getAttribute('role')??'').slice(0,80),name:clean(labelled||element.getAttribute('aria-label')||element.getAttribute('alt')||element.getAttribute('title')||(includeText?text(element):'')).slice(0,80),heading:heading?text(heading).slice(0,80):''};
  const compact:StructureSummary={tag:result.tag,...(result.role?{role:result.role}:{}),...(result.name?{name:result.name}:{}),...(result.heading?{heading:result.heading}:{})};if(!includeText)this.summaryCache?.set(element,compact);return compact;
 }
 private structure(element:Element){
  const ancestors:StructureSummary[]=[];let node=element.parentElement;
  for(let depth=0;node&&!node.matches('body,html')&&depth<4;depth++,node=node.parentElement)if(this.visible(node)){const summary=this.summary(node);if(summary.name||summary.heading||summary.role)ancestors.push(summary);}
  const siblings:StructureSummary[]=[];for(const sibling of [element.previousElementSibling,element.nextElementSibling])if(sibling&&this.visible(sibling)){const summary=this.summary(sibling,!sibling.matches('div,section,span'));if(summary.name||summary.heading||summary.role||!sibling.matches('div,section,span'))siblings.push(summary);}
  const children:StructureSummary[]=[];const candidates=this.firstChildren(element);for(const child of candidates)if(children.length<4&&this.visible(child)){const summary=this.summary(child,!child.matches('div,section,span'));if(summary.name||summary.heading||summary.role||!child.matches('div,section,span'))children.push(summary);};
  return {ancestors,siblings,children,truncated:!!node&&!node.matches('body,html')||element.children.length>12||candidates.filter(child=>this.visible(child)).length>4};
 }
 private describe(element:Element):ObservationBlock{
  let accessibleName='',nameSource='none';
  const labelled=element.getAttribute('aria-labelledby')?.split(/\s+/).slice(0,6).map(id=>document.getElementById(id)).filter((node):node is HTMLElement=>!!node&&!ownElement(node)&&!node.closest('input,'+forbidden)).map(node=>text(node)).join(' ');
  const labels='labels' in element?Array.from((element as HTMLInputElement).labels??[]).map(label=>text(label)).join(' '):'';
  for(const [source,value]of [['aria-labelledby',labelled],['aria-label',element.getAttribute('aria-label')],['label',labels],['alt',element.getAttribute('alt')],['title',element.getAttribute('title')],['placeholder',element.getAttribute('placeholder')],['text',text(element)]])if(value){accessibleName=clean(value);nameSource=source??'none';break;}
  const attributes:Record<string,string>={};for(const key of ['id','class','role','type','placeholder','alt','title','src','href']){let value=element.getAttribute(key);if(!value)continue;if(key==='src'||key==='href')try{const url=new URL(value,document.baseURI);value=['http:','https:'].includes(url.protocol)?url.origin+url.pathname:'[非 HTTP 引用]';}catch{continue;}attributes[key]=clean(value).slice(0,80);}
  const base={structure:this.structure(element),attributes,id:this.id(element),tag:element.tagName.toLowerCase(),role:clean(element.getAttribute('role')??''),text:text(element),accessibleName,nameSource,context:clean(element.parentElement?.getAttribute('aria-label')??(element.parentElement?.querySelector('h1,h2,h3,legend')?text(element.parentElement.querySelector('h1,h2,h3,legend')!):'')),parentRef:element.parentElement?this.id(element.parentElement):undefined};
  return {...base,blockHash:digest(JSON.stringify(base))};
 }
 private htmlProjection(entries:Array<{element:Element;block:ObservationBlock}>){
  const selected=new Map(entries.map(e=>[e.element,e]));const children=new Map<Element|null,typeof entries>();
  for(const entry of entries){let parent=entry.element.parentElement;while(parent&&!selected.has(parent))parent=parent.parentElement;const key=parent??null;const group=children.get(key)??[];group.push(entry);children.set(key,group);}
  const escape=(v:string)=>v.replace(/LUBAN_REF_/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let remaining=24000,truncated=false;const perNode=Math.max(8,Math.floor(12000/Math.max(entries.length,1)));const encoder=new TextEncoder();
  const render=(entry:typeof entries[number]):string=>{const b=entry.block;const tag=/^(main|article|section|aside|nav|header|footer|div|p|ul|ol|li|h[1-6]|form|label|button)$/u.test(b.tag)?b.tag:'div';let description=escape([b.tag,b.role,b.accessibleName,b.text].join(' ').slice(0,700));if(encoder.encode(description).length>perNode)truncated=true;while(encoder.encode(description).length>perNode)description=description.slice(0,-1);const text='LUBAN_REF_'+b.id+' '+description;const open='<'+tag+'>'+text;const cost=encoder.encode(open+'</'+tag+'>').length;if(cost>remaining){truncated=true;return '';}remaining-=cost;return open+(children.get(entry.element)??[]).map(render).join('')+'</'+tag+'>';};
  return {html:'<html>'+(children.get(null)??[]).map(render).join('')+'</html>',htmlTruncated:truncated,htmlFormat:'bounded-dom-projection-v1' as const};
 }
 collect(query=''){
  this.observeChanges();this.summaryCache=new Map();this.visibilityCache=new Map();
  const nodes=document.querySelectorAll('main,article,nav,header,footer,section,aside,div,form,label,button,input,select,a,img,svg,use,[role],h1,h2,h3,li,p');
  // Retrieval cannot recover a short label that a broad sampler has already dropped.
  // Query preference only retains evidence; it does not classify a business target.
  const terms=(query.normalize('NFKC').toLowerCase().match(/[a-z0-9_]+|[\p{Script=Han}]+/gu)??[]).filter(term=>term.length>=2);
  const queryMatches=new WeakMap<Element,boolean>();
  const matchesQuery=(element:Element)=>{const old=queryMatches.get(element);if(old!==undefined)return old;const label=(element.getAttribute('aria-label')||element.getAttribute('title')||element.getAttribute('alt')||element.getAttribute('placeholder')||(element.children.length===0?element.textContent:'')||'').trim().normalize('NFKC').toLowerCase();const found=label.length>=2&&label.length<=80&&terms.some(term=>label.includes(term)||term.includes(label));queryMatches.set(element,found);return found;};
  const sample=<T,>(items:ArrayLike<T>,limit:number):T[]=>items.length<=limit?Array.from(items):limit===1?[items[0]]:Array.from({length:limit},(_,i)=>items[Math.floor(i*(items.length-1)/(limit-1))]);
  const prioritized=<T,>(items:T[],limit:number,element:(item:T)=>Element)=>{if(items.length<=limit)return items;const preferred=items.filter(item=>matchesQuery(element(item)));const landmarks=items.filter(item=>!matchesQuery(element(item))&&element(item).matches('main,article,aside,nav,header,footer,form,h1,h2,[role="main"],[role="navigation"],[role="complementary"]'));const reserved=Math.min(64,Math.floor(limit/4));const kept=new Set(sample(preferred,Math.min(preferred.length,reserved)));for(const item of sample(landmarks,Math.min(landmarks.length,reserved-kept.size)))kept.add(item);for(const item of sample(items.filter(item=>!kept.has(item)),limit-kept.size))kept.add(item);return items.filter(item=>kept.has(item));};
  const candidates:Array<{element:Element;block:ObservationBlock;size:number}>=[];const styles=new Map<Element,CSSStyleDeclaration>();const sampled=prioritized(Array.from(nodes),800,x=>x);let truncated=nodes.length>800;
  for(const element of sampled){if(ownElement(element)||element.closest(forbidden))continue;
   let hidden=false;for(let node:Element|null=element;node;node=node.parentElement){let style=styles.get(node);if(!style){style=getComputedStyle(node);styles.set(node,style);}if(node.hasAttribute('hidden')||node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'){hidden=true;break;}}if(hidden||!element.getClientRects().length)continue;
   const block=this.describe(element);if(!block.accessibleName&&!block.text&&!element.matches('button,input,a,img,svg,use,[role]'))continue;
   candidates.push({element,block,size:new TextEncoder().encode(JSON.stringify(block)).length});
  }
  let limit=Math.min(240,candidates.length),selected=prioritized(candidates,limit,x=>x.element);let bytes=selected.reduce((sum,entry)=>sum+entry.size,0);
  while(bytes>70000&&limit>1){limit=Math.max(1,Math.min(limit-1,Math.floor(limit*70000/bytes)));selected=prioritized(candidates,limit,x=>x.element);bytes=selected.reduce((sum,entry)=>sum+entry.size,0);}
  truncated ||= selected.length<candidates.length;this.blocks.clear();for(const entry of selected)this.blocks.set(entry.block.id,{element:entry.element,block:entry.block});const blocks=selected.map(entry=>entry.block);
  this.summaryCache=null;this.visibilityCache=null;
  return {...this.htmlProjection(selected),blocks,evidenceRevision:this.evidenceRevision,scanned:sampled.length,truncated:truncated||this.unstable,coverage:`主文档 ${nodes.length} 个匹配节点中分布采样 ${sampled.length} 个，保留 ${blocks.length} 个观察块；${truncated?'这是跨文档位置的有界采样，不是整页覆盖。':'当前匹配节点已在本次观察范围内。'}层级摘要最多四层祖先、两个相邻块、四个子块，摘要不提供可执行引用。名称由 DOM 属性和标签推导，不是完整可访问性树。未读取输入值、iframe/Shadow DOM 内部。`};
 }
 read(id:string){this.observeChanges();const entry=this.blocks.get(id);if(!entry||!entry.element.isConnected||JSON.stringify(this.describe(entry.element))!==JSON.stringify(entry.block))throw Error('TARGET_STALE');return {element:entry.element,block:entry.block};}
}
