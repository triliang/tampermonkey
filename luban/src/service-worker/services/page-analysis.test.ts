import type { GenerationTransport } from './workspace-generation';
import { describe,it,expect,vi } from 'vitest';
import { PageAnalysis,parseSuggestions } from './page-analysis';
import type { CapturedPage } from '../../shared/p2-types';
import type { ProviderConfig } from '../../shared/types';
const page=()=>({binding:{tabId:1,documentId:'doc',host:'example.com',url:'https://example.com/?token=SECRET'},context:{meta:{url:'https://example.com/?token=SECRET',title:'标题'},target:null,domSummary:{structure:[],counts:{}}}} as unknown as CapturedPage);
const config:ProviderConfig={id:'openai-compatible',baseUrl:'https://api.example.com/v1',model:'custom-model',apiKey:'SECRET',billing:'onDemand'};
it('建议严格限制最多四条，残缺或无意图结果拒绝',()=>{
 expect(parseSuggestions('{"suggestions":[]}')).toEqual([]);
 expect(parseSuggestions('{"suggestions":[{"title":"暗色","intent":"添加暗色"}]}')).toHaveLength(1);
 for(const text of ['{','{"suggestions":[{"title":"x"}]}',JSON.stringify({suggestions:Array(5).fill({title:'x',intent:'y'})})])expect(()=>parseSuggestions(text)).toThrow();
});
describe('分析预览与执行',()=>{
 it('准备不调用模型、不发送 Key；执行消息与预览一致，预览单次使用',async()=>{
 const generate=vi.fn<GenerationTransport['generate']>(async()=>({text:'{"suggestions":[{"title":"暗色","intent":"添加暗色"}]}'}));
 const analysis=new PageAnalysis(async()=>page(),async()=>config,()=>({cancel:vi.fn(),generate}));
 const preview=await analysis.prepare();expect(generate).not.toHaveBeenCalled();expect(JSON.stringify(preview)).not.toContain('SECRET');
 expect(await analysis.run(preview.id)).toHaveLength(1);expect(generate.mock.calls[0][1]).toEqual(preview.messages);
 await expect(analysis.run(preview.id)).rejects.toThrow('失效');
 });
 it('页面变化或配置变化阻止发送',async()=>{
 let captured=page(),configuration=config;const generate=vi.fn();
 const a=new PageAnalysis(async()=>captured,async()=>configuration,()=>({cancel:vi.fn(),generate}));
 const p=await a.prepare();captured={...captured,binding:{...captured.binding,documentId:'other'}};
 await expect(a.run(p.id)).rejects.toThrow('页面已变化');expect(generate).not.toHaveBeenCalled();
 const p2=await a.prepare();configuration={...config,model:'changed'};
 await expect(a.run(p2.id)).rejects.toThrow('设置已变化');
 });
 it('取消后迟到结果不可返回；重复执行不会并发发送',async()=>{
 let resolve!:(v:{text:string})=>void;const cancel=vi.fn();
 const a=new PageAnalysis(async()=>page(),async()=>config,()=>({cancel,generate:()=>new Promise(r=>{resolve=r;})}));
 const p=await a.prepare();const pending=a.run(p.id);await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
 await expect(a.run(p.id)).rejects.toThrow('正在分析');a.cancel(p.id);resolve({text:'{"suggestions":[]}'});
 await expect(pending).rejects.toThrow('取消');expect(cancel).toHaveBeenCalledOnce();
 });
});
it('分析默认开启推理，可手动关闭；切换后旧分析预览失效',async()=>{
 let settings={...config,thinkingEnabled:true};const generate=vi.fn<GenerationTransport['generate']>(async()=>({text:'{"suggestions":[]}'}));const analysis=new PageAnalysis(async()=>page(),async()=>settings,()=>({cancel:()=>{},generate}));const on=await analysis.prepare();await analysis.run(on.id);expect(generate.mock.calls[0][2].thinking).toBe(true);const stale=await analysis.prepare();settings={...settings,thinkingEnabled:false};await expect(analysis.run(stale.id)).rejects.toThrow('设置已变化');const off=await analysis.prepare();await analysis.run(off.id);expect(generate.mock.calls[1][2].thinking).toBe(false);
});
it('页面分析的推理流独立展示，建议 JSON 不混入推理',async()=>{
 const progress=vi.fn();const generate:GenerationTransport['generate']=async(_c,_m,_o,callbacks)=>{callbacks.onReasoning?.('分析页面结构',false);return{text:'{"suggestions":[]}',reasoning:'分析页面结构'};};const analysis=new PageAnalysis(async()=>page(),async()=>config,()=>({cancel:()=>{},generate}),progress);const preview=await analysis.prepare();expect(await analysis.run(preview.id)).toEqual([]);expect(progress).toHaveBeenCalledWith(preview.id,'分析页面结构',false);
});
