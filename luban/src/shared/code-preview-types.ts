import type {ScriptVersion} from './v2-types';
export interface CodePreviewSnapshot {sessionId:string;workspaceId:string;name:string;current:ScriptVersion;saved?:ScriptVersion;previous?:ScriptVersion|null;hasReference:boolean;}
export type CodePreviewMessage={requestId:string}&(
 |{type:'OPEN_CODE_PREVIEW';workspaceId:string;name:string}
 |{type:'CLOSE_CODE_PREVIEW';sessionId:string}
 |{type:'RENDER_CODE_PREVIEW';snapshot:CodePreviewSnapshot}
 |{type:'DISMISS_CODE_PREVIEW';sessionId:string}
 |{type:'CODE_PREVIEW_ACTION';sessionId:string;action:'reference'|'edit'|'name'|'close'|'more';versionId?:string;lines?:number[];code?:string;name?:string}
 |{type:'CODE_PREVIEW_UPDATED';sessionId:string;workspaceId:string;action:'reference'|'edit'|'name'|'close'|'more';name:string}
);
