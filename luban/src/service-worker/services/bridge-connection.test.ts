import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {BridgeConnection} from './bridge-connection';
const id='a'.repeat(32), profileId='c6d301f1-b635-4a19-94c9-0c51edb4f491', token='b'.repeat(64);
let service: BridgeConnection;
let handle: typeof import('./bridge-connection')['handleBridgeMessage'];
let stored: Record<string,unknown>;
let messages: Array<{method:string}>;
let authFails=false;
beforeEach(async()=>{
 stored={};messages=[];authFails=false;vi.resetModules();
 vi.stubGlobal('chrome',{runtime:{id,getURL:(path:string)=>`chrome-extension://${id}/${path}`,connectNative:vi.fn(()=>{
  let listener:(v:unknown)=>void=()=>undefined;
  return {disconnect:vi.fn(),onDisconnect:{addListener:vi.fn()},onMessage:{addListener:(fn:(v:unknown)=>void)=>{listener=fn;}},postMessage:(r:{method:string;requestId:string})=>{
   messages.push(r);
   const error=r.method==='harness.configure'?'INVALID_REQUEST':r.method==='context.read'?'PAGE_NOT_GRANTED':r.method==='profile.authenticate'&&authFails?'PAIRING_REQUIRED':undefined;
   const data=r.method==='health.get'?{service:'luban-bridge',version:'0.1.0',protocolVersion:1}:r.method==='profile.pair'?{profileId,token}:r.method==='pages.list'?{pages:[]}:{};
   queueMicrotask(()=>listener({protocolVersion:1,requestId:r.requestId,ok:!error,...(error?{error:{code:error}}:{data})}));
  }};
 } )},permissions:{contains:vi.fn(async()=>true)},storage:{local:{get:vi.fn(async(key:string)=>({[key]:stored[key]})),set:vi.fn(async(value:Record<string,unknown>)=>{Object.assign(stored,value);}),remove:vi.fn(async(key:string)=>{delete stored[key];})}}});
 const module=await import('./bridge-connection');service=new module.BridgeConnection();handle=module.handleBridgeMessage;
});
afterEach(async()=>{await service.run('disconnect');vi.unstubAllGlobals();});
describe('S1 extension native connection',()=>{
 it('pairs without page access, keeps credentials out of UI and authenticates on reconnect',async()=>{
  const first=await service.run('connect');expect(first.status).toBe('connected');expect(first.pageCount).toBe(0);expect(JSON.stringify(first)).not.toContain(token);
  expect((await service.run('check-page-access')).message).toContain('尚未授权');await service.run('disconnect');await service.run('connect');
  expect(messages.filter(r=>r.method==='profile.pair')).toHaveLength(1);expect(messages.filter(r=>r.method==='profile.authenticate')).toHaveLength(1);
  await service.run('revoke');expect((await service.run('status')).paired).toBe(false);expect(stored).toEqual({});
 });
 it('rejects content script and other extension origins before accessing native host',async()=>{
  for(const url of ['https://example.com','chrome-extension://other/src/options/index.html',`chrome-extension://${id}/src/sidepanel/index.html`])expect((await handle({type:'V3_BRIDGE',action:'connect'},{id,url})).ok).toBe(false);
  expect(chrome.runtime.connectNative).not.toHaveBeenCalled();
 });
 it('clears rejected credentials but does not silently pair again',async()=>{
  await service.run('connect');await service.run('disconnect');authFails=true;await expect(service.run('connect')).rejects.toThrow('配对已失效');expect(stored).toEqual({});expect(messages.filter(r=>r.method==='profile.pair')).toHaveLength(1);
 });
});

it('invalid requests keep diagnostic code while showing an actionable update message',async()=>{await service.run('connect');await expect(service.rpc('harness.configure',{backend:'codex'})).rejects.toMatchObject({code:'INVALID_REQUEST',message:'请求参数未通过本机 Bridge 校验，本次操作未执行。'});expect(stored['luban:v3:bridge-pairing']).toBeDefined();});
