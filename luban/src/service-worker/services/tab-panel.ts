import {panelPath} from '../../shared/panel-tab';
interface Prepared {ready:boolean;promise:Promise<void>;}
const panels=new Map<number,Prepared>();
export function forgetTabPanel(tabId:number){panels.delete(tabId);}
export function configureTabPanel(tabId:number):Promise<void>{
 if(!Number.isSafeInteger(tabId)||tabId<=0)return Promise.reject(Error('无效的标签页。'));
 const existing=panels.get(tabId);if(existing)return existing.promise;
 const prepared:Prepared={ready:false,promise:Promise.resolve()};panels.set(tabId,prepared);
 prepared.promise=chrome.sidePanel.setOptions({tabId,path:panelPath(tabId),enabled:true}).then(()=>{if(panels.get(tabId)===prepared)prepared.ready=true;}).catch(error=>{if(panels.get(tabId)===prepared)panels.delete(tabId);throw error;});
 return prepared.promise;
}
/** Prepare tab-specific paths; Chrome handles toolbar activation natively. */
export async function initializeTabPanels(){
 await chrome.sidePanel.setOptions({enabled:false});
 await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
 await Promise.all((await chrome.tabs.query({})).flatMap(tab=>typeof tab.id==='number'?[configureTabPanel(tab.id)]:[]));
}
export function openTabPanel(tabId:number):Promise<void>{
 if(!Number.isSafeInteger(tabId)||tabId<=0)return Promise.reject(Error('无效的标签页。'));
 if(!panels.get(tabId)?.ready){void configureTabPanel(tabId).catch(()=>{});return Promise.reject(Error('标签页侧栏正在准备，请再点击一次鲁班图标。'));}
 // Content-triggered focus only; toolbar clicks use Chrome native behavior. No window-level fallback.
 return chrome.sidePanel.open({tabId});
}
