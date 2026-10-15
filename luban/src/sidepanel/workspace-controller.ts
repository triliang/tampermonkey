export type WorkspaceStage='editing'|'previewing'|'generating'|'repairing'|'trialRunning'|'saving'|'awaitingEffect'|'readyToTrial'|'failed';
export function workspaceStage(s:{generating:boolean;stream:string;operation:'trial'|'save'|'restore'|'rename'|null;preview:boolean;receipt:boolean;draft:boolean;failed:boolean}):WorkspaceStage{
 if(s.generating)return s.stream.startsWith('正在修复')?'repairing':'generating';
 if(s.operation)return s.operation==='trial'?'trialRunning':'saving';
 if(s.preview)return 'previewing';if(s.receipt)return 'awaitingEffect';if(s.failed)return 'failed';return s.draft?'readyToTrial':'editing';
}
