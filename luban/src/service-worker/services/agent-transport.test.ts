import {expect,it,vi} from 'vitest';import {AgentTransport} from './agent-transport';import type {ProviderConfig} from '../../shared/types';
const config={} as ProviderConfig;
it('accepts only completed agent output, preserving failure codes and current baseline messages',async()=>{
 const rpc=vi.fn(async(method:string)=>method==='agent.start'?{task:{id:'test'}}:{task:{state:'completed'},text:'{"code":"current baseline"}'});
 const transport=new AgentTransport(rpc,'workspace'),messages=[{role:'user' as const,content:'latest edited baseline'}];
 expect(await transport.generate(config,messages,{}, {onDelta:()=>{}})).toEqual({text:'{"code":"current baseline"}',finishReason:'stop'});
 expect(rpc).toHaveBeenCalledWith('agent.start',expect.objectContaining({workspaceId:'workspace',messages}));
});
it('failed and interrupted agent runs do not return partial output',async()=>{
 for(const state of ['failed','waitingUser','cancelled']){
  const transport=new AgentTransport(async method=>method==='agent.start'?{task:{id:'test'}}:{task:{state},text:'partial',error:'AGENT_LOGIN_REQUIRED'},'ws');
  await expect(transport.generate(config,[],{}, {onDelta:()=>{}})).rejects.toMatchObject({code:'AGENT_LOGIN_REQUIRED'});
 }
});
it('cancel before start acknowledgement sends cancellation and fences a late completion',async()=>{
 const rpc=vi.fn(async(method:string)=>method==='agent.start'?{task:{id:'test'}}:method==='agent.get'?{task:{state:'completed'},text:'late'}:{task:{state:'cancelRequested'}});
 const transport=new AgentTransport(rpc,'ws');transport.cancel();await expect(transport.generate(config,[],{}, {onDelta:()=>{}})).rejects.toMatchObject({code:'CANCELLED'});
 expect(rpc).toHaveBeenCalledWith('agent.cancel',{taskId:'test'});
});
it('unknown stop state is not reported as a confirmed cancellation',async()=>{
 const rpc=async(method:string)=>method==='agent.start'?{task:{id:'test'}}:{task:{state:'waitingUser'}};
 const transport=new AgentTransport(rpc,'ws');await expect(transport.generate(config,[],{}, {onDelta:()=>{}})).rejects.toThrow();
 await expect(transport.waitForStop()).rejects.toMatchObject({code:'AGENT_CANCEL_UNKNOWN'});
});
