export interface ObservationReport {outcome:'answered'|'incomplete'|'needs_clarification';evidenceRefs:string[];reasons:string[];ambiguities:string[];missingEvidence:string[];nextReadIds?:string[];}
export function renderObservationReport(report:ObservationReport):string;
export function renderReportFailure(kind?:string):string;
export function renderTargetProposal(targets:Array<{label:number;description?:string;text?:string}>,reason:string):string;
