export interface ExportArtifact { filename:string; content:string; versionId:string; hash:string; hasDraft:boolean; grants:string[]; }
export type P5Message={type:'EXPORT_CURRENT';requestId:string;scriptId:string};
