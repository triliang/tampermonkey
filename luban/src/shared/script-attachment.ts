export interface ScriptAttachment {workspaceId:string;scriptId:string|null;versionId:string;hash:string;filename:string;source:'draft'|'saved';}
export function scriptFilename(name:string){return(name.replace(/[\\/:*?"<>|\r\n]/g,'_').trim().slice(0,80)||'当前脚本')+'.user.js';}
