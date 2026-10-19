export interface V4Target {attributes?:Record<string,string>;parentId?:string;id:string;label:number;text:string;fingerprint:string;tag?:string;description?:string;bounds?:{x:number;y:number;width:number;height:number};members?:number;reason?:string;}
export interface V4Conversation {lastError?:string;coverage?:string;nextOffset?:number|null;
 operation?:{id:string;state:string};effectCheck?:V4EffectCheck;workspaceMessages?:import('./v2-types').ConversationMessage[];submitted?:boolean;historyCount?:number;id:string;workspaceId:string;sequence?:number;revision:number;epoch:number;status:string;pending?:boolean;stale?:boolean;
 page:{pageRef:string;documentId:string;navigationEpoch:number}|null;
 requirement?:{id:string;revision:number;goal:string;constraints:string[];unresolved:string[]}|null;
 targets:V4Target[];selected:string[];confirmed:boolean;
 plan:{revision:number;hash:string;ids:string[];action:'hide'|'dim';constraints:string[]}|null;
 decision:{id:string;scopeHash:string;expiresAt:number}|null;
 artifact:{operationId:string;planHash:string;baselineHash:string|null;epoch:number;code:string;grants:string[];explanation:string}|null;
 messages:Array<{id?:string;role:'user'|'assistant';text:string;createdAt?:number}>;
}

export interface V4EffectCheck {checkerVersion?:'generic-v1';scope?:'confirmed-targets';goalStatus?:'not-assessed';preservation?:{checked:number;violations:Array<{tag:string;description:string;status:string}>};checkedAt:number;action:string;results:Array<{label:number;description?:string;status:string}>;residual:Array<{tag:string;description:string;bounds:{width:number;height:number}}>;truncated:boolean;passed:boolean;coverage:string;}
