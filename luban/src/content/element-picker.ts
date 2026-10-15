// Page-side picker selects the outer iframe, without reading cross-origin documents.
import {ownElement} from './target-context';
const OVERLAY_ID='__luban_picker_overlay';
export interface PickerHandle {stop:()=>void;}
export function isElementPickerActive(){return document.getElementById(OVERLAY_ID)!==null;}
export function startElementPicker(onPick:(el:Element)=>void,onCancel:()=>void):PickerHandle{
 const previousFocus=document.activeElement;
 const overlay=document.createElement('div');overlay.id=OVERLAY_ID;overlay.dataset.lubanUi='picker';overlay.tabIndex=-1;
 // The non-modal top layer is above page stacking contexts and keeps the underlying
 // page available for hit testing. A modal dialog would make that page inert.
 overlay.setAttribute('popover','manual');
 overlay.style.cssText='position:fixed!important;inset:0!important;margin:0!important;border:0!important;padding:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;overflow:visible!important;z-index:2147483647!important;background:transparent!important;cursor:crosshair!important;pointer-events:auto!important;';
 const box=document.createElement('div');box.style.cssText='position:fixed;pointer-events:none!important;border:2px solid #2563eb;background:#2563eb0b;display:none;box-sizing:border-box;';
 const tip=document.createElement('div');tip.id='__luban_picker_tooltip';tip.style.cssText='position:fixed;pointer-events:none!important;background:#1f2937;color:white;font:12px/1.6 system-ui,sans-serif;padding:6px 9px;border-radius:6px;max-width:calc(100vw - 20px);overflow-wrap:anywhere;';
 tip.textContent='移动选择 · ↑ 父级 / ↓ 返回 · Enter 确认 · Esc 取消';
 tip.style.left='10px';tip.style.top='10px';overlay.append(box,tip);document.documentElement.append(overlay);
 try{if(typeof overlay.showPopover==='function')overlay.showPopover();else overlay.removeAttribute('popover');}catch{overlay.removeAttribute('popover');}
 overlay.focus({preventScroll:true});
 let stopped=false,current:Element|null=null,hovered:Element|null=null,x=0,y=0;
 const path:Element[]=[];
 function resolve(px:number,py:number):Element|null{
  // Some hit-test stacks stop at an iframe. Explicitly remove our entire shield
  // from hit testing during this synchronous lookup, and always restore it.
  overlay.style.setProperty('pointer-events','none','important');
  try{return document.elementsFromPoint(px,py).find(el=>!ownElement(el)&&!['HTML','BODY'].includes(el.tagName))??null;}
  finally{overlay.style.setProperty('pointer-events','auto','important');}
 }
 function draw(){
  if(!current?.isConnected){box.style.display='none';return;}
  const r=current.getBoundingClientRect();Object.assign(box.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
  // No classes/styles are added to the target: selection never pollutes selectors
  // or fingerprints and cannot be mistaken for Luban's own UI.
  const cls=[...current.classList].slice(0,2).map(c=>'.'+c).join('');
  tip.textContent=current.tagName.toLowerCase()+(current.id?'#'+current.id:'')+cls+(current.tagName==='IFRAME'?' · iframe 外框':'')+' · ↑ 父级 / ↓ 返回 · Enter 确认 · Esc 取消';
  tip.style.left=Math.max(8,Math.min(x+12,window.innerWidth-290))+'px';tip.style.top=Math.max(8,Math.min(y+16,window.innerHeight-75))+'px';
 }
 function move(e:MouseEvent){x=e.clientX;y=e.clientY;const real=resolve(x,y);if(real!==hovered){hovered=real;current=real;path.length=0;}draw();}
 function finish(el:Element|null){if(!el?.isConnected)return;stop();onPick(el);}
 function click(e:MouseEvent){e.preventDefault();e.stopImmediatePropagation();const real=resolve(e.clientX,e.clientY);finish(real===hovered?current:real);}
 function key(e:KeyboardEvent){
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();stop();onCancel();return;}
  if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();finish(current);return;}
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){
   e.preventDefault();e.stopImmediatePropagation();
   if(e.key==='ArrowUp'){const parent=current?.parentElement;if(parent&&!ownElement(parent)&&!['BODY','HTML'].includes(parent.tagName)){path.push(current!);current=parent;}}
   else if(path.length)current=path.pop()!;
   draw();
  }
 }
 const refresh=()=>draw();
 function stop(){if(stopped)return;stopped=true;overlay.removeEventListener('mousemove',move);overlay.removeEventListener('click',click);overlay.removeEventListener('keydown',key);window.removeEventListener('scroll',refresh,true);window.removeEventListener('resize',refresh);try{overlay.hidePopover?.();}catch{/* already closed */}overlay.remove();if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});}
 overlay.addEventListener('mousemove',move);overlay.addEventListener('click',click);overlay.addEventListener('keydown',key);window.addEventListener('scroll',refresh,true);window.addEventListener('resize',refresh);
 return{stop};
}
