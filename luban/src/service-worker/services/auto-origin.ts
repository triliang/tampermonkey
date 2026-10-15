import { DataError } from '../repositories/database';
export async function verifyAutoSource(sender:chrome.runtime.MessageSender){
  if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.documentId||typeof sender.tab?.id!=='number'||!sender.url)throw new DataError('INVALID_SOURCE','运行来源无效。');
  const url=new URL(sender.url),tab=await chrome.tabs.get(sender.tab.id);
  if(!['http:','https:'].includes(url.protocol)||tab.url!==sender.url)throw new DataError('INVALID_DOCUMENT','运行文档已变化。');
  return{tabId:sender.tab.id,documentId:sender.documentId,host:url.hostname};
}
