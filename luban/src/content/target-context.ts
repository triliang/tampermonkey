import type {TargetContext,TargetCandidate} from '../shared/v21-types';
import {generateSelectors} from './selector-generator';
export const ownElement=(el:Element)=>!!el.closest('[data-luban-ui]')||el.id.startsWith('__luban_')||[...el.classList].some(c=>c.startsWith('__luban_'));
export function targetFingerprint(el:Element):string{
 const text=(el.textContent??'').replace(/\s+/g,' ').slice(0,120);
 return JSON.stringify([el.tagName,el.id,[...el.classList].filter(c=>!c.startsWith('__luban_')).sort(),text,el.children.length]);
}
export function captureTargetContext(el:Element):TargetContext{
 const candidates:TargetCandidate[]=[];let node:Element|null=el;
 for(let depth=0;node&&depth<=4;depth++,node=node.parentElement){
  if(ownElement(node)||['BODY','HTML','MAIN','ARTICLE','ASIDE'].includes(node.tagName)||node.id==='content'||node.classList.contains('aside')||node.querySelector('main,article,[role=main]'))break;
  const selector=generateSelectors(node).find(s=>{try{return document.querySelectorAll(s).length===1;}catch{return false;}});
  if(selector)candidates.push({selector,tag:node.tagName.toLowerCase(),text:(node.textContent??'').replace(/\s+/g,' ').slice(0,120),fingerprint:targetFingerprint(node),relation:depth?'ancestor':'element'});
 }
 return{candidates,neighbors:[...(el.parentElement?.children??[])].filter(n=>n!==el&&!ownElement(n)).slice(0,3).map(n=>`${n.tagName.toLowerCase()}: ${(n.textContent??'').replace(/\s+/g,' ').slice(0,120)}`)};
}
let overlay:HTMLElement|null=null;
export function clearRangePreview(){overlay?.remove();overlay=null;}
export function previewRange(selectors:string[],fingerprint:string){
 clearRangePreview();let target:Element|null=null;for(const s of selectors){const all=document.querySelectorAll(s);if(all.length===1){target=all[0];break;}}
 if(!target||ownElement(target)||targetFingerprint(target)!==fingerprint)throw new Error('目标已变化，请重新点选。');
 const r=target.getBoundingClientRect();overlay=document.createElement('div');overlay.dataset.lubanUi='range-preview';overlay.style.cssText=`position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #24664c;background:#24664c12;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
 document.documentElement.append(overlay);
}
