import type {ConversationMessage} from '../../shared/v2-types';
import type {V4Conversation} from '../../shared/v4-types';
type Event=NonNullable<V4Conversation['events']>[number];
export interface ChatRun {key:string;epoch:number;events:Event[];startedAt?:number;endedAt?:number;active:boolean;state:'active'|'finished'|'incomplete'|'failed'|'stopped'|'waiting';beforeMessage:number|null;}
const starts=new Set(['run.started','analysis.started','generation.started','run.resumed']);
const ends=new Set(['run.finished','artifact.candidate','generation.failed','run.cancelled']);
/** Only actual host events are displayed; missing retained timestamps never get invented. */
export function chatRuns(c:V4Conversation|null,messages:ConversationMessage[]):ChatRun[]{
 if(!c)return [];
 const groups=new Map<number,Event[]>();for(const event of c.events??[]){if(!Number.isFinite(event.time))continue;const previous=[...groups.values()].at(-1);if(event.type==='run.cancelled'&&!groups.has(event.epoch)&&previous?.some(e=>starts.has(e.type))&&!previous.some(e=>ends.has(e.type))){previous.push(event);continue;}const events=groups.get(event.epoch)??[];events.push(event);groups.set(event.epoch,events);}
 const runs=[...groups].sort((a,b)=>a[0]-b[0]).filter(([,events])=>events.some(e=>starts.has(e.type)||e.type.startsWith('tool.')||ends.has(e.type)));
 return runs.map(([epoch,events],index)=>{
  const start=events.find(e=>starts.has(e.type));const end=[...events].reverse().find(e=>ends.has(e.type));const active=epoch===c.epoch&&['running','generating','stopping'].includes(c.status);const nextEvents=runs[index+1]?.[1];const nextStart=nextEvents?.find(e=>starts.has(e.type))?.time??nextEvents?.[0]?.time;
  const lower=start?.time??events[0].time;
  let beforeMessage=messages.findIndex(m=>m.role==='assistant'&&m.createdAt>=lower&&(nextStart===undefined||m.createdAt<nextStart));
  // Generation may create a card without a transcript reply. Keep its activity before the next turn.
  if(beforeMessage<0&&!active)beforeMessage=messages.findIndex(m=>m.createdAt>lower&&m.createdAt>=(end?.time??lower));
  const state:ChatRun['state']=active?'active':epoch===c.epoch&&c.status==='failed'?'failed':events.some(e=>e.type==='run.cancelled')?'stopped':events.some(e=>e.type==='generation.failed')?'failed':epoch===c.epoch&&c.status==='waitingApproval'?'waiting':epoch===c.epoch&&c.outcome==='incomplete'?'incomplete':'finished';
  return {key:c.id+':'+epoch,epoch,events,startedAt:start?.time,endedAt:end?.time,active,state,beforeMessage:beforeMessage<0?null:beforeMessage};
 });
}
export function elapsedLabel(start:number|undefined,end:number|undefined){
 if(start===undefined||end===undefined||end<start)return null;
 const seconds=Math.floor((end-start)/1000);if(seconds===0)return '不到 1 秒';if(seconds<60)return `${seconds} 秒`;const minutes=Math.floor(seconds/60);return minutes<60?`${minutes} 分 ${seconds%60} 秒`:`${Math.floor(minutes/60)} 小时 ${minutes%60} 分`;
}
export function activityLabel(type:string):string|null{
 const labels:Record<string,string>={'report.rejected':'报告校验未通过','tool.search_dom':'检索页面线索','tool.read_dom_block':'核实页面元素','tool.read_dom_blocks':'批量核实页面元素','tool.query_targets':'读取页面结构','tool.inspect_target':'检查区域关系','tool.review_selection':'复核处理范围','tool.propose_requirement':'整理需求与保留要求','tool.report_observation':'整理识别结论','tool.propose_targets':'提出处理范围','tool.propose_plan':'整理处理方案','tool.request_generation':'请求生成确认','tool.search_resources':'查找页面资源','tool.read_resource_excerpt':'读取可用资源摘要','generation.started':'开始生成脚本','artifact.candidate':'脚本候选已生成','generation.failed':'脚本生成未完成','run.cancelled':'处理已停止'};
 return labels[type]??(type.startsWith('tool.')?'完成分析步骤':null);
}
/** Compress only adjacent identical activities; keep the original event log unchanged. */
export function activitySteps(events:Event[]){
 const steps:Array<{sequence:number;type:string;label:string;count:number;time:number}>=[];
 for(const event of events){const label=activityLabel(event.type);if(!label)continue;const previous=steps.at(-1);if(previous?.type===event.type){previous.count++;previous.time=event.time;}else steps.push({sequence:event.sequence,type:event.type,label,count:1,time:event.time});}
 return steps;
}
