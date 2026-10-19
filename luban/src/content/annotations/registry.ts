import {generateSelectors} from '../selector-generator';
import {ownElement} from '../target-context';
import type {V4Target,V4EffectCheck} from '../../shared/v4-types';
export type AnnotationTarget=V4Target;
interface Entry extends AnnotationTarget {element:Element;selectors:string[];}
interface Guard {element:Element;opacity:number;ownText:boolean;}
const NODE_LIMIT=800,TARGET_LIMIT=40;
export const PRESERVATION_LIMIT=10000;
interface StyleState {hidden:boolean;opacity:number;}
const STRUCTURAL='section,aside,div,iframe,a,img,nav,header,footer,p,ul,ol,table,[role]';
export class TargetRegistry {
 readonly sessionId=crypto.randomUUID();
 private entries=new Map<string,Entry>();private root:HTMLElement|null=null;private shadow:ShadowRoot|null=null;
 private guards:Guard[]=[];private guardTruncated=false;
 private frame=0;private observer:MutationObserver|null=null;private sizes:ResizeObserver|null=null;private shown:string[]=[];private excluded=new Set<string>();private color='#608868';
 private update=()=>{if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});};
 private styleState(el:Element,cache:Map<Element,StyleState>){let state=cache.get(el);if(!state){const style=getComputedStyle(el);state={hidden:style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||(style.opacity!==''&&Number(style.opacity)===0),opacity:style.opacity===''?1:Number(style.opacity)};cache.set(el,state);}return state;}
 private styleHidden(el:Element,cache:Map<Element,StyleState>){for(let n:Element|null=el;n;n=n.parentElement)if(this.styleState(n,cache).hidden)return true;return false;}
 private visible(el:Element,cache=new Map<Element,StyleState>()){return !this.styleHidden(el,cache)&&[...el.getClientRects()].some(r=>r.width>0&&r.height>0);}
 private opacity(el:Element,cache=new Map<Element,StyleState>()){let opacity=1;for(let n:Element|null=el;n;n=n.parentElement)opacity*=this.styleState(n,cache).opacity;return opacity;}
 private safe(el:Element){return !ownElement(el)&&!['HTML','BODY','MAIN','ARTICLE','FORM','INPUT','TEXTAREA','NAV','HEADER','FOOTER'].includes(el.tagName)&&!el.matches('[role=main],[role=navigation]')&&!el.querySelector('main,article,nav,header,footer,[role=main],[role=navigation],input[type=password]');}
 // All targets use the same identity rule. Descendant presentation classes may
 // animate within a confirmed range; content, resources, structure and root
 // attributes remain bound. Original node identity and unique selectors are
 // independently revalidated, so replacements never inherit confirmation.
 private fingerprint(el:Element){
  const clone=el.cloneNode(true) as Element;
  clone.querySelectorAll('[data-luban-ui]').forEach(node=>node.remove());
  for(const node of [clone,...clone.querySelectorAll('*')]){node.removeAttribute('style');node.removeAttribute('hidden');node.removeAttribute('aria-hidden');}
  clone.querySelectorAll('*').forEach(node=>node.removeAttribute('class'));
  const content=clone.outerHTML;if(content.length>100000)throw Error('TARGET_RANGE_TOO_BROAD');
  let hash=2166136261,other=5381;for(let i=0;i<content.length;i++){hash=Math.imul(hash^content.charCodeAt(i),16777619);other=Math.imul(other,33)^content.charCodeAt(i);}
  return `${content.length}:${hash>>>0}:${other>>>0}`;
 }
 private attributes(el:Element){
  const result:Record<string,string>={};
  for(const name of ['id','class','role','aria-label','title','alt','src','href']){let value=el.getAttribute(name);if(!value)continue;if(name==='src'||name==='href'){try{const url=new URL(value,document.baseURI);value=['http:','https:'].includes(url.protocol)?url.origin+url.pathname:'[非 HTTP 资源]';}catch{value='[无法解析的地址]';}}result[name]=value.replace(/Bearer\s+[\w.-]+/gi,'[已脱敏]').slice(0,200);}
  return result;
 }
 private captureGuards(){
  const nodes=[...document.body.querySelectorAll('*')].filter(el=>!ownElement(el)&&!['SCRIPT','STYLE','LINK','META','TEMPLATE','NOSCRIPT'].includes(el.tagName));
  this.guardTruncated=nodes.length>PRESERVATION_LIMIT;
  const styles=new Map<Element,StyleState>();
  this.guards=[document.body,...nodes.slice(0,PRESERVATION_LIMIT)].filter(el=>this.visible(el,styles)).map(element=>({element,opacity:this.opacity(element,styles),ownText:[...element.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&Boolean(n.textContent?.trim()))}));
 }
 private selectors(el:Element){return generateSelectors(el).filter(s=>{try{const all=document.querySelectorAll(s);return all.length===1&&all[0]===el;}catch{return false;}});}
 private add(el:Element):AnnotationTarget {
  if(!this.safe(el))throw Error('TARGET_RANGE_TOO_BROAD');
  const existing=[...this.entries.values()].find(e=>e.element===el);if(existing)return this.public(existing);
  if(this.entries.size>=TARGET_LIMIT)throw Error('TARGET_LIMIT');
  const selectors=this.selectors(el);if(!selectors.length)throw Error('TARGET_NOT_UNIQUE');
  const clean=el.cloneNode(true) as Element;clean.querySelectorAll('script,style,input,textarea,[contenteditable]').forEach(e=>e.remove());
  const text=(clean.textContent??'').replace(/\s+/g,' ').replace(/Bearer\s+[\w.-]+/gi,'[已脱敏]').trim().slice(0,300);
  const entry:Entry={id:crypto.randomUUID(),label:this.entries.size+1,text,fingerprint:this.fingerprint(el),element:el,selectors};
  this.entries.set(entry.id,entry);return this.public(entry);
 }
 private public(e:Entry):AnnotationTarget{
  const r=e.element.getBoundingClientRect(),attributes=this.attributes(e.element);
  const parent=[...this.entries.values()].filter(other=>other!==e&&other.element.contains(e.element)).sort((a,b)=>a.element.contains(b.element)?1:-1)[0];
  return {id:e.id,label:e.label,text:e.text,fingerprint:e.fingerprint,tag:e.element.tagName.toLowerCase(),description:[e.element.tagName.toLowerCase(),attributes['aria-label']||attributes.title||attributes.alt||e.text.slice(0,80)||attributes.id||attributes.href||attributes.src||'无文本区域'].join(' · '),attributes,parentId:parent?.id,bounds:{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)},members:e.element.querySelectorAll('iframe').length,reason:'页面结构证据；用途需结合用户需求判断，未读取嵌入文档内部'};
 }
 scan(offset=0){
  if(!Number.isInteger(offset)||offset<0||offset>=NODE_LIMIT)throw Error('INVALID_SCAN_OFFSET');
  this.clear();this.entries.clear();this.captureGuards();
  const nodes=[...document.querySelectorAll(STRUCTURAL)].filter(el=>!ownElement(el));let cursor=offset;
  while(cursor<Math.min(nodes.length,NODE_LIMIT)&&this.entries.size<TARGET_LIMIT){const el=nodes[cursor++];if(this.visible(el))try{this.add(el);}catch{/* Unsafe or unbounded ranges are not actionable. */}}
  const nextOffset=cursor<Math.min(nodes.length,NODE_LIMIT)?cursor:null;
  const truncated=nextOffset!==null||nodes.length>NODE_LIMIT;
  return {sessionId:this.sessionId,targets:[...this.entries.values()].map(e=>this.public(e)),nextOffset,coverage:`当前主文档结构节点 ${offset+1}–${cursor}，共 ${nodes.length} 个；提供结构候选，不判定业务用途。iframe、Shadow DOM 内部未读取。${truncated?'采集未覆盖完整页面，可读取下一批或手动补选；不能据此断言目标已全部找到。':''}`,truncated};
 }
 prepare(ids:string[]){const targets=this.resolve(ids);this.captureGuards();return targets;}
 check(ids:string[],action='hide'):V4EffectCheck{
  if(!['hide','dim'].includes(action))throw Error('INVALID_EFFECT_ACTION');
  if(!Array.isArray(ids)||!ids.length||ids.length>TARGET_LIMIT||new Set(ids).size!==ids.length)throw Error('INVALID_TARGETS');
  this.clear();
  const styles=new Map<Element,StyleState>();
  const selected=ids.map(id=>{const entry=this.entries.get(id);if(!entry)throw Error('TARGET_STALE');return entry;});
  const results=selected.map(e=>{
   // A replacement matching an old selector is not the node that the user confirmed.
   let status='missing';if(e.element.isConnected){status=!this.safe(e.element)?'changed':this.fingerprint(e.element)!==e.fingerprint?'changed':!this.visible(e.element,styles)?'hidden':action==='dim'&&this.opacity(e.element,styles)<1?'dimmed':'visible';}
   return {label:e.label,description:this.public(e).description,status};
  });
  const preserved=this.guards.filter(g=>!selected.some(e=>e.element===g.element||e.element.contains(g.element)));
  const violations=preserved.flatMap(g=>{
   // Empty wrapping boxes may naturally collapse when their selected content
   // disappears. Their own styles must remain visible; independent text and
   // all unselected descendants are still protected by their original guards.
   const naturalCollapse=!g.ownText&&!['HTML','BODY','MAIN','ARTICLE','NAV','HEADER','FOOTER','FORM'].includes(g.element.tagName)&&selected.some(e=>g.element.contains(e.element))&&!this.styleHidden(g.element,styles);
   const status=!g.element.isConnected?'missing':!this.visible(g.element,styles)&&!naturalCollapse?'hidden':this.opacity(g.element,styles)<g.opacity-0.01?'dimmed':null;
   return status?[{tag:g.element.tagName.toLowerCase(),description:(g.element.getAttribute('aria-label')||g.element.id||g.element.tagName.toLowerCase()).slice(0,100),status}]:[];
  });
  const residual=selected.filter((_,i)=>results[i].status==='visible').map(e=>({tag:e.element.tagName.toLowerCase(),description:this.public(e).description??'',bounds:{width:Math.round(e.element.getBoundingClientRect().width),height:Math.round(e.element.getBoundingClientRect().height)}}));
  return {checkerVersion:'generic-v1',checkedAt:Date.now(),action,scope:'confirmed-targets',goalStatus:'not-assessed',results,residual,preservation:{checked:preserved.length,violations:violations.slice(0,40)},truncated:this.guardTruncated,passed:results.every(r=>r.status===(action==='dim'?'dimmed':'hidden'))&&!violations.length&&!this.guardTruncated,coverage:'仅检查本次确认目标的预期变化与采集范围内非目标区域的可见性/透明度；不判定业务目标是否完整达成。iframe、Shadow DOM 内部及内容语义、交互功能需另行复核。'+(this.guardTruncated?'保留区域基线已截断，不能判定通过。':'')};
 }
 manual(el:Element,keepIds:string[]=[]){
  if(!this.safe(el))throw Error('TARGET_RANGE_TOO_BROAD');
  if(!Array.isArray(keepIds)||keepIds.some(id=>!this.entries.has(id)))throw Error('INVALID_TARGETS');
  // Validate before evicting any unselected evidence. Never discard a selected range.
  this.fingerprint(el);if(!this.selectors(el).length)throw Error('TARGET_NOT_UNIQUE');
  let trimmed=false;
  if(this.entries.size>=TARGET_LIMIT&&![...this.entries.values()].some(e=>e.element===el)){
   const removable=[...this.entries.values()].find(e=>!keepIds.includes(e.id));
   if(!removable)throw Error('本次最多选择 40 个区域，请先取消部分所选区域，再手动补选。');
   this.entries.delete(removable.id);let label=1;for(const entry of this.entries.values())entry.label=label++;
   trimmed=true;
  }
  if(!this.guards.length)this.captureGuards();const target=this.add(el);
  return {sessionId:this.sessionId,target,targets:[...this.entries.values()].map(e=>this.public(e)),coverage:'手动补选当前页范围；需重新核对和确认。iframe、Shadow DOM 内部未读取。'+(trimmed?'本批结构证据已满，已裁剪一处未选候选，保留原所选目标。':'')};
 }
 resolve(ids:string[]){if(!Array.isArray(ids)||!ids.length||ids.length>TARGET_LIMIT||new Set(ids).size!==ids.length)throw Error('INVALID_TARGETS');return ids.map(id=>{const e=this.entries.get(id);if(!e||!e.element.isConnected||!this.safe(e.element)||this.fingerprint(e.element)!==e.fingerprint)throw Error('TARGET_STALE');const selectors=this.selectors(e.element);if(!selectors.length)throw Error('TARGET_STALE');e.selectors=selectors;return {...this.public(e),selectors};});}
 show(ids:string[],excluded:string[]=[],color='green'){if(!['green','blue','amber'].includes(color))throw Error('INVALID_ANNOTATION_STYLE');this.color=({green:'#608868',blue:'#6489a2',amber:'#aa813d'} as Record<string,string>)[color];const visibleIds=ids.filter(id=>!excluded.includes(id));if(!visibleIds.length){this.clear();return {shown:0};}this.resolve(visibleIds);this.clear();this.shown=visibleIds;this.excluded=new Set();this.root=document.createElement('div');this.root.dataset.lubanUi='v4-annotations';this.root.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483645';this.shadow=this.root.attachShadow({mode:'open'});document.documentElement.append(this.root);window.addEventListener('scroll',this.update,true);window.addEventListener('resize',this.update);this.observer=new MutationObserver(this.update);if(typeof ResizeObserver!=='undefined')this.sizes=new ResizeObserver(this.update);for(const id of visibleIds){const e=this.entries.get(id)!;this.sizes?.observe(e.element);this.observer.observe(e.element,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','id','hidden']});}this.draw();return {shown:visibleIds.length};}
 private draw(){if(!this.shadow)return;this.shadow.replaceChildren();for(const id of this.shown){const e=this.entries.get(id);if(!e||!e.element.isConnected||this.fingerprint(e.element)!==e.fingerprint)continue;const r=e.element.getBoundingClientRect();if(!r.width||!r.height||r.bottom<0||r.top>innerHeight)continue;const box=document.createElement('div');box.style.cssText=`position:fixed;pointer-events:none;border:2px ${this.excluded.has(id)?'dashed #929b89':'solid '+this.color};left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;box-sizing:border-box`;const label=document.createElement('button');label.textContent=`${e.label} ${this.excluded.has(id)?'已排除':'疑似目标'}`;label.style.cssText=`position:absolute;left:0;top:0;transform:translateY(-100%);pointer-events:auto;background:${this.excluded.has(id)?'#687263':this.color};color:white;border:0;border-radius:4px;font:12px sans-serif;padding:3px 6px;cursor:pointer`;label.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();e.element.scrollIntoView({block:'center',behavior:'smooth'});label.textContent=`${e.label} ${e.text.slice(0,40)}`;});box.append(label);this.shadow.append(box);}}
 locate(id:string){this.resolve([id]);this.entries.get(id)!.element.scrollIntoView({block:'center',behavior:'smooth'});}
 clear(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;window.removeEventListener('scroll',this.update,true);window.removeEventListener('resize',this.update);this.observer?.disconnect();this.observer=null;this.sizes?.disconnect();this.sizes=null;this.root?.remove();this.root=null;this.shadow=null;}
}
