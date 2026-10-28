import {Annotation,StateGraph,START,END,interrupt,Command,type BaseCheckpointSaver} from '@langchain/langgraph';
import {compilePlan,type PlanEnvelope,type PlanIR} from '../../contracts/script-plan.mjs';
export {Command};
export const GenerationState=Annotation.Root({
 envelope:Annotation<PlanEnvelope>(),operationId:Annotation<string>(),ir:Annotation<unknown>(),approvedRef:Annotation<string>(),
 attempts:Annotation<number>({reducer:(_a,b)=>b,default:()=>0}),diagnostics:Annotation<string[]>({reducer:(_a,b)=>b,default:()=>[]}),
 candidate:Annotation<{code:string;grants:string[];explanation:string}|null>({reducer:(_a,b)=>b,default:()=>null}),
 status:Annotation<string>({reducer:(_a,b)=>b,default:()=> 'pending'}),
});
export interface WorkflowOptions {
 checkpointer?:BaseCheckpointSaver;
 claim:(operationId:string,approvalRef:string,envelope:PlanEnvelope)=>Promise<void>;
 revise?:(diagnostics:string[],envelope:PlanEnvelope)=>Promise<unknown>;
 maxAttempts?:number;
}
export function createGenerationWorkflow(options:WorkflowOptions){
 const maximum=Math.max(1,Math.min(options.maxAttempts??2,3));
 const graph=new StateGraph(GenerationState)
 .addNode('approval',state=>{const ref=state.approvedRef||interrupt({kind:'generation',operationId:state.operationId,planHash:state.envelope.planHash});return {approvedRef:String(ref)};})
 .addNode('claim',async state=>{await options.claim(state.operationId,state.approvedRef,state.envelope);return {};})
 .addNode('compile',state=>{
   try {const ir=state.ir??{planHash:state.envelope.planHash,action:state.envelope.action,targetIds:state.envelope.targets.map(t=>t.id)} satisfies PlanIR;
    const {code,grants,explanation}=compilePlan(ir,state.envelope);const candidate={code,grants,explanation};return {candidate,ir,attempts:state.attempts+1,diagnostics:[],status:'ready'};
   }catch(error){return {candidate:null,attempts:state.attempts+1,diagnostics:[error instanceof Error?error.message:'PLAN_IR_INVALID'],status:'invalid'};}
 })
 .addNode('revise',async state=>({ir:await options.revise!(state.diagnostics,state.envelope)}))
 .addNode('stopped',()=>({status:'stopped'}))
 .addEdge(START,'approval').addEdge('approval','claim').addEdge('claim','compile')
 .addConditionalEdges('compile',state=>{
   if(state.status==='ready')return END;
   if(state.diagnostics.some(d=>d!=='PLAN_IR_INVALID')||!options.revise||state.attempts>=maximum)return 'stopped';
   return 'revise';
 },[END,'stopped','revise']).addEdge('revise','compile').addEdge('stopped',END);
 return graph.compile(options.checkpointer?{checkpointer:options.checkpointer}:{});
}
export function loopProgressKey(evidenceRevision:number,ids:string[],diagnostics:string[]){return JSON.stringify([evidenceRevision,[...new Set(ids)].sort(),[...new Set(diagnostics)].sort()]);}
export function evidenceOutcome(report:{ids?:string[];diagnostics?:string[];intent?:string}){if(report.diagnostics?.includes('OUTPUT_FORMAT_INVALID'))return 'report_invalid';const intent=report.intent==='identify'?'identify':'modify';const diagnostics=report.diagnostics??[];if(intent==='identify'&&diagnostics.includes('REPORT_INVALID'))return 'report_invalid';if(intent==='identify'&&diagnostics.includes('NEEDS_TARGETED_EVIDENCE'))return 'needsEvidence';const hard=diagnostics.filter(code=>code&&code!=='TARGET_REQUIRED');if(intent==='modify')return !report.ids?.length||diagnostics.includes('TARGET_REQUIRED')||hard.length?'needsEvidence':'ready';if(hard.some(code=>code==='NOT_UNIQUE'||code==='AMBIGUOUS'||code==='MULTIPLE'))return 'needs_clarification';return hard.length?'incomplete':'answered';}
export class LoopBudget {
 private calls=0;private tools=0;private previous='';private repeats=0;
 constructor(private limit={models:8,tools:24,repeated:2}){}
 model(){if(++this.calls>this.limit.models)throw Error('HARNESS_MODEL_BUDGET');}
 tool(){if(++this.tools>this.limit.tools)throw Error('HARNESS_TOOL_BUDGET');}
 progress(key:string){this.repeats=key===this.previous?this.repeats+1:0;this.previous=key;if(this.repeats>=this.limit.repeated)throw Error('HARNESS_NO_PROGRESS');}
 remainingModels(){return Math.max(0,this.limit.models-this.calls);}
 snapshot(){return {models:this.calls,tools:this.tools,repeats:this.repeats};}
}
const EvidenceState=Annotation.Root({supplemental:Annotation<unknown>(),nextReadIds:Annotation<string[]>(),intent:Annotation<string>(),text:Annotation<string>(),ids:Annotation<string[]>(),diagnostics:Annotation<string[]>(),key:Annotation<string>(),previous:Annotation<string>(),rounds:Annotation<number>({reducer:(_a,b)=>b,default:()=>0}),status:Annotation<string>()});
/** The agent may choose evidence, but only deterministic review controls the outer edge. */
export function createEvidenceWorkflow(options:{analyze:(feedback:string[],supplemental?:unknown)=>Promise<string>;resolveEvidence?:(ids:string[])=>Promise<unknown>;review:()=>Promise<{ids:string[];diagnostics:string[];evidenceRevision:number;intent?:string;nextReadIds?:string[]}>;checkpointer?:BaseCheckpointSaver;canContinue?:()=>boolean}){
 return new StateGraph(EvidenceState)
 .addNode('analyze',async state=>({text:await options.analyze(state.diagnostics??[],state.supplemental),rounds:state.rounds+1}))
 .addNode('review',async state=>{const report=await options.review();const key=loopProgressKey(report.evidenceRevision,report.ids,report.diagnostics);return {...report,key,previous:state.key??'',status:evidenceOutcome(report)};})
 .addNode('readGaps',async state=>({supplemental:await options.resolveEvidence!(state.nextReadIds??[]),diagnostics:['TARGETED_EVIDENCE_READY']}))
 .addNode('partial',state=>({status:'incomplete',text:state.ids?.length?'候选范围未通过最终实时复核，当前不能确认。请手动定位元素后核对变化；未生成、运行或保存脚本。':state.text+'\n\n本轮自动补证已结束，未核实的范围仍保留为缺口；可以手动定位元素后核对范围。'}))
 .addNode('stopped',state=>({status:'stopped',text:state.text+'\n\n本轮未能获得可通过复核的范围，已停止自动尝试。请核对证据缺口或调整需求；未授权生成或运行。'}))
 .addEdge(START,'analyze').addEdge('analyze','review')
 .addConditionalEdges('review',state=>state.intent==='identify'&&state.status==='needsEvidence'?(state.nextReadIds?.length&&options.resolveEvidence&&state.rounds<2&&options.canContinue?.()!==false?'readGaps':'partial'):['ready','answered','incomplete','needs_clarification','report_invalid'].includes(state.status)?END:options.canContinue?.()===false?'partial':state.rounds>=3||state.key===state.previous?'stopped':'analyze',[END,'analyze','stopped','readGaps','partial'])
 .addEdge('readGaps','analyze').addEdge('partial',END).addEdge('stopped',END).compile(options.checkpointer?{checkpointer:options.checkpointer}:{});
}
