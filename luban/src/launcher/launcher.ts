import {panelPath} from '../shared/panel-tab';
export function mountLauncher(doc:Document){
 const button=doc.querySelector<HTMLButtonElement>('#open')!,page=doc.querySelector<HTMLElement>('#page')!,status=doc.querySelector<HTMLElement>('#status')!;
 let tabId:number|undefined;
 button.addEventListener('click',()=>{
  if(tabId===undefined)return;
  // No await or messaging before open: this DOM click owns the user gesture.
  button.disabled=true;
  void chrome.sidePanel.open({tabId}).then(()=>window.close()).catch(e=>{button.disabled=false;status.textContent=`打开失败：${e instanceof Error?e.message:String(e)}。请再次点击。`;});
 });
 void (async()=>{
  const tab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
  if(typeof tab?.id!=='number'||!tab.url||!/^https?:\/\//.test(tab.url))throw Error('请在普通 HTTP/HTTPS 网页点击鲁班图标；Chrome 内部页面不可访问。');
  const id=tab.id;
  await chrome.sidePanel.setOptions({tabId:id,path:panelPath(id),enabled:true});
  tabId=id;page.textContent=new URL(tab.url).hostname;button.disabled=false;
 })().catch(e=>{page.textContent='当前页面不可访问';status.textContent=e instanceof Error?e.message:String(e);});
}
