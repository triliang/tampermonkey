import type { CapturedPage,PageBinding } from '../../shared/p2-types';
import type { PageContext } from '../../shared/types';
import { DataError } from '../repositories/database';
import { sanitizePageUrl } from '../../shared/safe-url';
import { makeRequestId } from '../../shared/messages';
import contentScriptPath from '../../content/index.ts?script&iife';

interface Pending { tabId: number; documentId?:string; accept: (result: CapturedPage) => void; reject: (e: unknown) => void; }
const pending = new Map<string, Pending>();
export async function currentSite(tabId?:number): Promise<{ tabId: number; host: string; url: string; title: string }> {
  const tab = tabId===undefined?(await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]:await chrome.tabs.get(tabId).catch(()=>undefined);
  if (!tab?.id || !tab.url) throw new DataError('ACTIVE_TAB_EXPIRED', '请点击工具栏鲁班图标，再点“在当前页打开鲁班”以临时授权。');
  const url = new URL(tab.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new DataError('RESTRICTED_PAGE', '当前页面不支持创建工具，请打开普通网页。');
  return { tabId: tab.id, host: url.hostname, url: sanitizePageUrl(tab.url), title: tab.title ?? '' };
}
export async function captureCurrentPage(selectors?: string[],tabId?:number): Promise<CapturedPage> {
  if (selectors && (!Array.isArray(selectors) || selectors.length > 4 || !selectors.every(s => typeof s === 'string' && s.length < 1000))) throw new DataError('INVALID_SELECTION', '点选信息无效。');
  const site = await currentSite(tabId);
  try { await chrome.scripting.executeScript({ target: { tabId: site.tabId }, files: [contentScriptPath] }); }
  catch { throw new DataError('ACTIVE_TAB_EXPIRED', '当前网页未授权，请点击工具栏鲁班图标，再点“在当前页打开鲁班”。'); }
  const requestId = makeRequestId();
  return new Promise<CapturedPage>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new DataError('CAPTURE_TIMEOUT', '采集页面超时，请重试。')); }, 5000);
    const finish = (r: CapturedPage) => { clearTimeout(timer); pending.delete(requestId); resolve(r); };
    const fail = (e: unknown) => { clearTimeout(timer); pending.delete(requestId); reject(e); };
    pending.set(requestId, { tabId: site.tabId, accept: finish, reject: fail });
    void chrome.tabs.sendMessage(site.tabId, { type: 'P2_CAPTURE', requestId, selectors }).then(response => {
      if (!response?.ok) fail(new DataError('CAPTURE_FAILED', response?.error ?? '页面采集失败。'));
    }).catch(fail);
  });
}
export async function acceptCapture(requestId: string, context: PageContext, sender: chrome.runtime.MessageSender): Promise<void> {
  const entry = pending.get(requestId);
  if (!entry || sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.documentId || sender.tab?.id !== entry.tabId || !sender.url) throw new DataError('INVALID_CAPTURE_SOURCE', '采集来源已失效。');
  if(entry.documentId&&sender.documentId!==entry.documentId){entry.reject(new DataError('PAGE_CHANGED','指定文档已失效，未采集其他页面。'));return;}
  const actual = await chrome.tabs.get(entry.tabId);
  if (actual.url !== sender.url) { entry.reject(new DataError('PAGE_CHANGED', '页面已导航，请重新采集。')); return; }
  const url = new URL(sender.url);
  if (!context || !context.meta || !context.domSummary || !['page','element'].includes(context.scope) || new URL(context.meta.url).hostname !== url.hostname) throw new DataError('INVALID_CONTEXT', '页面上下文无效。');
  entry.accept({ context, binding: { tabId: entry.tabId, documentId: sender.documentId, host: url.hostname, url: sanitizePageUrl(sender.url) } });
}

/** External callers must use a server-held binding, never the active tab. */
export async function captureBoundPage(binding:PageBinding,selectors?:string[]):Promise<CapturedPage>{
 if(!binding||!Number.isInteger(binding.tabId)||!binding.documentId||!['http:','https:'].includes(new URL(binding.url).protocol))throw new DataError('INVALID_PAGE_BINDING','指定页面身份无效。');
 if(selectors&&(!Array.isArray(selectors)||selectors.length>4||!selectors.every(s=>typeof s==='string'&&s.length<1000)))throw new DataError('INVALID_SELECTION','点选信息无效。');
 const tab=await chrome.tabs.get(binding.tabId).catch(()=>undefined);
 if(!tab?.url||sanitizePageUrl(tab.url)!==binding.url||new URL(tab.url).hostname!==binding.host)throw new DataError('PAGE_CHANGED','指定页面已导航或关闭，请重新授权。');
 try{await chrome.scripting.executeScript({target:{tabId:binding.tabId,documentIds:[binding.documentId]},files:[contentScriptPath]});}
 catch{throw new DataError('PAGE_CHANGED','指定文档不可访问，请重新授权。');}
 const requestId=makeRequestId();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(requestId);reject(new DataError('CAPTURE_TIMEOUT','指定页面采集超时。'));},5000);
  const fail=(e:unknown)=>{clearTimeout(timer);pending.delete(requestId);reject(e);};
  pending.set(requestId,{tabId:binding.tabId,documentId:binding.documentId,accept:result=>{clearTimeout(timer);pending.delete(requestId);if(result.binding.url!==binding.url||result.binding.host!==binding.host){reject(new DataError('PAGE_CHANGED','指定页面已变化。'));return;}resolve(result);},reject:fail});
  void chrome.tabs.sendMessage(binding.tabId,{type:'P2_CAPTURE',requestId,selectors},{documentId:binding.documentId}).then(response=>{if(!response?.ok)fail(new DataError('CAPTURE_FAILED','指定页面采集失败。'));}).catch(()=>fail(new DataError('PAGE_CHANGED','指定文档已失效。')));
 });
}
