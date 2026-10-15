import {thinkingProtocol} from '../../shared/thinking';
import type { CapturedPage } from '../../shared/p2-types';
import type { AnalysisPreview, PageSuggestion } from '../../shared/p7-types';
import type { ProviderConfig } from '../../shared/types';
import { estimateTokens } from '../prompt-builder';
import { TOKEN_BUDGET } from '../../shared/constants';
import { safePageContext } from './generation-envelope';
import { DataError } from '../repositories/database';
import type { GenerationTransport } from './workspace-generation';

export function parseSuggestions(text: string): PageSuggestion[] {
  let value: unknown;
  try {value=JSON.parse(text);}catch{throw new DataError('ANALYSIS_INVALID','分析结果不完整，请重试；没有可执行建议。');}
  const items=value&&typeof value==='object'?(value as {suggestions?:unknown}).suggestions:undefined;
  if(!Array.isArray(items)||items.length>4||items.some(x=>!x||typeof x.title!=='string'||!x.title.trim()||x.title.length>80||typeof x.intent!=='string'||!x.intent.trim()||x.intent.length>600))throw new DataError('ANALYSIS_INVALID','分析结果格式无效，请重试；没有可执行建议。');
  return items.map(x=>({title:x.title.trim(),intent:x.intent.trim()}));
}
export class PageAnalysis {
  private previews=new Map<string,{preview:AnalysisPreview;created:number}>();
  private running=new Map<string,GenerationTransport>();
  constructor(private capture:()=>Promise<CapturedPage>,private configuration:()=>Promise<ProviderConfig>,private factory:()=>GenerationTransport,private reasoning?:(id:string,text:string,truncated:boolean)=>void){}
  async prepare():Promise<AnalysisPreview>{
    const page=await this.capture(),config=await this.configuration();
    const context=safePageContext(page.context);context.target=null;
    const messages:AnalysisPreview['messages']=[{role:'system',content:'分析当前网页，提出最多四个安全且可在当前页完成的样式、隐藏干扰、展示增强或数据提取建议。不生成代码、不执行操作、不发起跨站操作。只返回 JSON：{"suggestions":[{"title":"简短标题","intent":"可供用户确认的具体需求"}]}。没有适合建议时返回空数组。'},{role:'user',content:JSON.stringify({meta:context.meta,domSummary:context.domSummary})}];
    if(estimateTokens(JSON.stringify(messages))>TOKEN_BUDGET.total-TOKEN_BUDGET.response)throw new DataError('CONTEXT_TOO_LARGE','页面摘要过大，无法分析。');
    for(const [id,p] of this.previews)if(Date.now()-p.created>300000)this.previews.delete(id);
    if(this.previews.size>=20)throw new DataError('TOO_MANY_PREVIEWS','分析预览过多，请稍后重试。');
    const preview:AnalysisPreview={thinkingEnabled:config.thinkingEnabled!==false,thinkingProtocol:thinkingProtocol(config),id:crypto.randomUUID(),binding:{...page.binding,url:context.meta.url},provider:{model:config.model,baseUrl:config.baseUrl},messages};
    this.previews.set(preview.id,{preview,created:Date.now()});return structuredClone(preview);
  }
  async run(id:string):Promise<PageSuggestion[]>{
    if(this.running.size)throw new DataError('ANALYSIS_BUSY','正在分析，请先取消或等待完成。');
    const entry=this.previews.get(id);this.previews.delete(id);
    if(!entry||Date.now()-entry.created>300000)throw new DataError('PREVIEW_EXPIRED','分析预览已失效，请重新采集。');
    const client=this.factory();this.running.set(id,client);
    const live=()=>{if(this.running.get(id)!==client)throw new DataError('CANCELLED','分析已取消。');};
    const check=async()=>{const p=await this.capture();live();if(p.binding.tabId!==entry.preview.binding.tabId||p.binding.documentId!==entry.preview.binding.documentId||safePageContext(p.context).meta.url!==entry.preview.binding.url)throw new DataError('PAGE_CHANGED','页面已变化，请重新分析。');const c=await this.configuration();if(c.model!==entry.preview.provider.model||c.baseUrl!==entry.preview.provider.baseUrl||(c.thinkingEnabled!==false)!==entry.preview.thinkingEnabled||thinkingProtocol(c)!==entry.preview.thinkingProtocol)throw new DataError('SETTINGS_CHANGED','模型设置已变化，请重新预览。');};
    try{
      await check();const config=await this.configuration();live();
      if(config.baseUrl!==entry.preview.provider.baseUrl||config.model!==entry.preview.provider.model||(config.thinkingEnabled!==false)!==entry.preview.thinkingEnabled||thinkingProtocol(config)!==entry.preview.thinkingProtocol)throw new DataError('SETTINGS_CHANGED','模型设置已变化，请重新预览。');
      const result=await client.generate(config,structuredClone(entry.preview.messages),{jsonMode:true,thinking:entry.preview.thinkingEnabled!==false,autoRetry:false},{onDelta:()=>{},onReasoning:(text,truncated)=>{if(this.running.get(id)===client)this.reasoning?.(id,text,truncated);}});
      live();await check();return parseSuggestions(result.text);
    }finally{if(this.running.get(id)===client)this.running.delete(id);}
  }
  cancel(id:string){this.previews.delete(id);this.running.get(id)?.cancel();this.running.delete(id);}
}
