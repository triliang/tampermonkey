import { useEffect, useRef } from 'preact/hooks';
import type { ExportArtifact } from './p5-types';
interface Props{artifact:ExportArtifact;onClose:()=>void;onDownloaded:()=>void;}
export function ExportDialog({artifact,onClose,onDownloaded}:Props){
  const ref=useRef<HTMLDialogElement|null>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();previous?.focus();};},[]);
  function download(){const blob=new Blob([artifact.content],{type:'text/javascript;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=artifact.filename;document.body.append(link);try{link.click();onDownloaded();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}}
  return <dialog class="p2-dialog" ref={ref} onCancel={onClose}><h2>导出当前保存版本</h2><p>{artifact.hasDraft?'有未保存的需求或草稿，本次只导出保存版，不包含这些修改。':'本次仅导出当前保存版本。'}</p><p>文件：{artifact.filename}</p><p>不包含鲁班的对话、设置 Key、页面快照或 GM 数据。目标管理器独立保存 GM 数据，也不会继承鲁班的关闭状态。两边同时开启可能重复执行。</p><p class="p2-muted">已检查标准元数据与静态依赖；实际效果仍需在目标管理器验证。</p><div class="p2-row"><button autoFocus onClick={onClose}>取消导出</button><button onClick={download}>确认下载 .user.js</button></div></dialog>;
}
