import {ownElement} from '../target-context';
interface Resource {id:string;kind:'stylesheet'|'script';path:string;readable:boolean;unavailable?:string;}
interface Entry {resource:Resource;node:Element;identity:string;sheet?:CSSStyleSheet;version:string;signature:string;}
const digest=(text:string)=>{let result=2166136261;for(const char of text)result=Math.imul(result^char.charCodeAt(0),16777619);return (result>>>0).toString(16);};
const sanitize=(text:string)=>text.replace(/Bearer\s+[\w.-]+/gi,'[已脱敏]').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_all,_quote,raw)=>{try{const url=new URL(raw,document.baseURI);return ['http:','https:'].includes(url.protocol)?'url('+url.origin+url.pathname+')':'url([不可展示])';}catch{return 'url([不可展示])';}});
export class ResourceEvidence {
 private entries=new Map<string,Entry>();
 reset(){this.entries.clear();}
 private css(sheet:CSSStyleSheet){const rules=Array.from(sheet.cssRules);let code='',truncated=rules.length>500;for(const rule of rules.slice(0,500)){const next=rule.cssText;if(code.length+next.length>64000){truncated=true;break;}code+=next+'\n';}return {code:sanitize(code),raw:code,truncated};}
 search(query:string,limit=20){
  if(!query.trim()||query.length>160||!Number.isInteger(limit)||limit<1||limit>20)throw Error('INVALID_RESOURCE_QUERY');
  const found:Resource[]=[];const nodes=document.querySelectorAll('link[rel~="stylesheet"],style,script[src]');let truncated=nodes.length>500;
  for(const node of Array.from(nodes).slice(0,500)){
   if(ownElement(node))continue;const stylesheet=node.matches('style,link');const raw=node.getAttribute(stylesheet?'href':'src')??'';let path=stylesheet?'[内联样式]':'';
   if(raw)try{const url=new URL(raw,document.baseURI);if(!['http:','https:'].includes(url.protocol))continue;path=url.origin+url.pathname;}catch{continue;}
   const sheet=stylesheet?(node as HTMLLinkElement|HTMLStyleElement).sheet as CSSStyleSheet|null:null;let readable=false,version='',signature='',unavailable='SOURCE_NOT_AVAILABLE_WITHOUT_FETCH';
   if(sheet)try{signature=this.css(sheet).raw;version=digest(signature);readable=true;unavailable='';}catch{unavailable='CSSOM_NOT_ACCESSIBLE';}
   const identity=raw;let entry=[...this.entries.values()].find(value=>value.node===node&&value.identity===identity&&value.version===version&&value.signature===signature);
   if(!entry){for(const [id,old]of this.entries)if(old.node===node)this.entries.delete(id);const resource:Resource={id:crypto.randomUUID(),kind:stylesheet?'stylesheet':'script',path:path.slice(0,2048),readable,...(unavailable?{unavailable}:{})};entry={resource,node,identity,sheet:sheet??undefined,version,signature};this.entries.set(resource.id,entry);}
   if((path+' '+entry.resource.kind).toLowerCase().includes(query.toLowerCase())||query==='*')found.push(entry.resource);
  }
  for(const [id,entry]of this.entries)if(!entry.node.isConnected||(entry.node.getAttribute(entry.resource.kind==='stylesheet'?'href':'src')??'')!==entry.identity)this.entries.delete(id);
  if(found.length>limit)truncated=true;
  return {resources:found.slice(0,limit),truncated,coverage:'主文档样式表与脚本引用；只读取已可访问 CSSOM，不重新下载文件，不重放接口。路径不区分查询版本，但资源引用内部独立绑定版本。'};
 }
 read(id:string,offset=0,length=2000){
  if(!Number.isInteger(offset)||offset<0||offset>64000||!Number.isInteger(length)||length<1||length>4000)throw Error('INVALID_RESOURCE_WINDOW');
  const entry=this.entries.get(id);if(!entry||!entry.node.isConnected||(entry.node.getAttribute(entry.resource.kind==='stylesheet'?'href':'src')??'')!==entry.identity)throw Error('RESOURCE_STALE');
  if(!entry.sheet||!entry.resource.readable)return {resourceId:id,available:false,reason:entry.resource.unavailable??'CSSOM_NOT_ACCESSIBLE',excerpt:'',coverage:'没有可读取正文；不会依据展示路径重新请求资源。'};
  let source;try{source=this.css(entry.sheet);}catch{throw Error('RESOURCE_STALE');}if(source.raw!==entry.signature)throw Error('RESOURCE_STALE');
  return {resourceId:id,available:true,contentVersion:entry.version,offset,excerpt:source.code.slice(offset,offset+length),truncated:source.truncated||offset+length<source.code.length,coverage:'只读 CSSOM 片段；样式选择器和源码字符串不证明当前存在目标，必须另用 DOM 观察与真实节点复核。'};
 }
}
