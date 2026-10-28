export type ResourceKind='document'|'script'|'stylesheet'|'image'|'font'|'fetch'|'other';
export interface PageResource {url:string;origin:string;path:string;kind:ResourceKind;}
export interface PageResources {title:string;resources:PageResource[];truncated:boolean;}
/** Serialized by executeScript. No request bodies, form values or resource source are read. */
export function collectPageResources():PageResources {
 const resources:PageResource[]=[];const seen=new Set<string>();let truncated=false;
 function add(raw:string,kind:ResourceKind){
  if(!raw)return;
  try{const url=new URL(raw,document.baseURI);if(!['http:','https:'].includes(url.protocol))return;const safe=url.origin+url.pathname;if(seen.has(safe))return;if(resources.length>=500){truncated=true;return;}
   seen.add(safe);resources.push({url:safe,origin:url.origin,path:url.pathname,kind});
  }catch{/* Ignore invalid URLs. */}
 }
 add(location.href,'document');
 for(const [selector,attribute,kind] of [['script[src]','src','script'],['link[rel~="stylesheet"]','href','stylesheet'],['img','src','image'],['source[src]','src','other'],['iframe[src]','src','document']] as const){
  const nodes=document.querySelectorAll(selector);if(nodes.length>2000)truncated=true;
  for(const el of Array.from(nodes).slice(0,2000))add(el instanceof HTMLImageElement?el.currentSrc||el.getAttribute(attribute)||'':el.getAttribute(attribute)||'',kind);
 }
 const entries=performance.getEntriesByType('resource');if(entries.length>2000)truncated=true;
 for(const entry of entries.slice(0,2000)){
  const initiator=(entry as PerformanceResourceTiming).initiatorType;let kind:ResourceKind='other';
  if(initiator==='script')kind='script';else if(initiator==='img'||/\.(png|jpe?g|gif|webp|svg|avif|ico)(?:[?#]|$)/i.test(entry.name))kind='image';else if(/\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(entry.name))kind='font';else if(/\.css(?:[?#]|$)/i.test(entry.name))kind='stylesheet';else if(initiator==='fetch'||initiator==='xmlhttprequest')kind='fetch';
  add(entry.name,kind);
 }
 return {title:document.title.slice(0,160),resources,truncated};
}
