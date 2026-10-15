import {it,expect,vi} from 'vitest';
import {thinkingProtocol,thinkingParameters} from './thinking';
import {getSettings,DEFAULT_SETTINGS,saveThinkingEnabled,toProviderConfig} from './settings-store';
import type {ProviderConfig} from './types';
const base:ProviderConfig={id:'openai-compatible',baseUrl:'https://api.xiaomimimo.com/v1',model:'mimo-v2.6-flash',apiKey:'test',billing:'onDemand'};
it('旧配置默认开启，手动关闭持久化且不覆盖模型和其他设置',async()=>{
 let data:Record<string,unknown>={};vi.stubGlobal('chrome',{storage:{sync:{get:async()=>data,set:async(v:Record<string,unknown>)=>{data=v;}}}});
 try{expect((await getSettings()).thinkingEnabled).toBe(true);await saveThinkingEnabled(false);expect((await getSettings()).thinkingEnabled).toBe(false);expect(toProviderConfig(await getSettings(),'key').thinkingEnabled).toBe(false);expect((await getSettings()).defaultModel).toBe(DEFAULT_SETTINGS.defaultModel);}finally{vi.unstubAllGlobals();}
});
it('MiMo/DeepSeek 自动识别，未知兼容端点不乱传；代理可显式开启协议',()=>{
 expect(thinkingParameters(base,true)).toEqual({thinking:{type:'enabled'}});expect(thinkingParameters(base,false)).toEqual({thinking:{type:'disabled'}});
 const custom={...base,customEndpoint:true};expect(thinkingProtocol({...custom,baseUrl:'https://api.deepseek.com/v1'})).toBe('thinking');expect(thinkingParameters({...custom,baseUrl:'https://api.unknown.invalid/v1'},true)).toEqual({});expect(thinkingParameters({...custom,baseUrl:'https://proxy.invalid/v1',thinkingProtocol:'thinking'},false)).toEqual({thinking:{type:'disabled'}});expect(thinkingParameters({...custom,thinkingProtocol:'none'},true)).toEqual({});
});
it('推理展示预算按 UTF-8 截断，不破坏中文字符',async()=>{
 const {appendReasoning}=await import('./reasoning');expect(appendReasoning('','中中',5)).toEqual({text:'中',truncated:true});expect(appendReasoning('a','b',5)).toEqual({text:'ab',truncated:false});
});
