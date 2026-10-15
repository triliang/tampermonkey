import {it,expect,vi} from 'vitest';
import {normalizeCustomUrl,customOrigin,validateModelSettings,DEFAULT_SETTINGS,toProviderConfig,saveApiKey,getApiKey} from './settings-store';
import {openaiCompatibleProvider} from '../service-worker/ai-providers/openai-compatible';
it('端点仅允许无凭据的 HTTP/HTTPS Base URL，不接受完整接口和秘密参数',()=>{
 expect(normalizeCustomUrl(' https://api.example.com/v1/ ')).toBe('https://api.example.com/v1');
 expect(customOrigin('http://localhost:18889/v1')).toBe('http://localhost/*');
 for(const value of ['file:///tmp/a','javascript:alert(1)','https://u:p@host/v1','https://host/v1?key=secret','https://host/#secret','https://host/v1/chat/completions'])expect(()=>normalizeCustomUrl(value)).toThrow();
});
it('自定义模型和任意非 MiMo Key 可用，原 MiMo 校验仍保留',()=>{
 const s={...DEFAULT_SETTINGS,customEndpoint:true,customBaseUrl:'http://localhost:18889/v1',customModel:'local-model'};
 expect(validateModelSettings(s,'custom-secret')).toEqual({ok:true});expect(validateModelSettings({...s,customModel:''},'key').ok).toBe(false);
 expect(validateModelSettings(DEFAULT_SETTINGS,'custom-secret').ok).toBe(false);
 expect(toProviderConfig(s,'key').model).toBe('local-model');
});
it('预设和自定义 Key 隔离，关闭自定义不会覆盖原 Key',async()=>{
 const data:Record<string,unknown>={};vi.stubGlobal('chrome',{storage:{local:{set:async(v:object)=>Object.assign(data,v),get:async(k:string)=>({[k]:data[k]})}}});
 await saveApiKey('sk-original');await saveApiKey('custom-secret',true);
 expect(await getApiKey()).toBe('sk-original');expect(await getApiKey(true)).toBe('custom-secret');vi.unstubAllGlobals();
});
it('实际自定义请求用指定 URL/模型，省略 MiMo 扩展参数，错误不回显 Key',async()=>{
 vi.stubGlobal('chrome',{permissions:{contains:vi.fn(async()=>true)}});
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('{}'));vi.stubGlobal('fetch',fetcher);
 const c=toProviderConfig({...DEFAULT_SETTINGS,customEndpoint:true,customBaseUrl:'https://example.com/v1',customModel:'custom-model'},'custom-secret');
 await openaiCompatibleProvider.streamChatCompletion(c,{messages:[],jsonMode:true,thinking:false,signal:new AbortController().signal});
 expect(fetcher.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions');
 const opts=fetcher.mock.calls[0][1] as RequestInit;expect(JSON.parse(opts.body as string)).toMatchObject({model:'custom-model',stream:true});expect(JSON.parse(opts.body as string).thinking).toBeUndefined();expect(opts.headers).not.toHaveProperty('api-key');
 fetcher.mockImplementation(async()=>new Response('custom-secret',{status:500}));
 await expect(openaiCompatibleProvider.streamChatCompletion(c,{messages:[],jsonMode:true,thinking:false,signal:new AbortController().signal})).rejects.not.toThrow('custom-secret');
 vi.unstubAllGlobals();
});
