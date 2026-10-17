import 'fake-indexeddb/auto';
import {afterEach,expect,it,vi} from 'vitest';
import {Database,DataError,request} from '../repositories/database';
import {ScriptStore} from '../script-store';
import {PageGrants} from './page-grants';
import {ExternalDispatcher} from './external-dispatcher';
import {lockWorkspace} from './workspace-lock';
import type {CapturedPage} from '../../shared/p2-types';
import type {ExternalCommand,BridgeSnapshot} from '../../shared/bridge-types';
import type {TrialReceipt} from '../../shared/p3-types';
const dbs:Database[]=[];
afterEach(async()=>{for(const db of dbs.splice(0))await db.close();});
async function fixture(allowDrafts=true){
 const db=new Database('external-'+crypto.randomUUID());dbs.push(db);const store=new ScriptStore(db,async()=>({}));await store.ready();
 const page:CapturedPage={binding:{tabId:4,documentId:'exact-document',host:'example.com',url:'https://example.com/a'},context:{scope:'page',meta:{url:'https://example.com/a',title:'Test',siteType:'unknown'},target:null,domSummary:{title:'Test',counts:{inputs:0,buttons:0,forms:0,links:0,images:0},inputs:[],buttons:[],truncated:false}}};
 const status:BridgeSnapshot={status:'connected',extensionId:'a'.repeat(32),profileId:crypto.randomUUID(),paired:true,pageCount:0};const session=crypto.randomUUID();
 const bound=vi.fn(async()=>page);const pages=new PageGrants(store,{run:async()=>status,syncPages:async()=>{}},async()=>session,async()=>page,bound);
 const created=await store.workspaces.create(null,'example.com');const ws=await store.workspaces.saveDraft(created.id,0,{draft:{versionId:crypto.randomUUID(),hash:'untrusted',code:'console.log("initial")',grants:[],explanation:'test',runAt:'document_end',createdAt:1}});
 const [grant]=await pages.create(4,page.binding.url,allowDrafts,ws.id);
 const rpc=vi.fn(async(method:string,_params?:Record<string,unknown>):Promise<Record<string,unknown>>=>method==='tasks.confirm'?{task:{epoch:2,revision:4}}:{});
 const trial=vi.fn(async()=>({result:{ok:true,timedOut:false,changes:[]},receipt:{id:crypto.randomUUID()} as TrialReceipt}));
 const dispatcher=new ExternalDispatcher(store,pages,rpc,trial);
 const updated=vi.fn(async()=>{});dispatcher.setUpdateHandler(updated);
 const command=(kind:ExternalCommand['command']='readContext'):ExternalCommand=>({taskId:crypto.randomUUID(),clientId:crypto.randomUUID(),requestKey:crypto.randomUUID(),epoch:1,revision:1,source:'mcp',command:kind,pageRef:grant.id,...(kind!=='readContext'?{workspaceId:ws.id,expectedDraftRevision:ws.draftRevision}:{}),...(kind==='submitDraft'?{candidate:{code:'console.log("candidate")',grants:[],explanation:'candidate'}}:{})});
 return {db,store,page,pages,ws,rpc,trial,dispatcher,command,bound,updated};
}
it('duplicate concurrent requests capture once; lost acknowledgement resends only the result',async()=>{
 const f=await fixture();const command=f.command();let lost=false;f.rpc.mockImplementation(async method=>{if(method==='tasks.finish'&&!lost){lost=true;throw Error('lost ack');}return {};});
 await Promise.all([f.dispatcher.handle(command),f.dispatcher.handle(command)]);await f.dispatcher.handle(command);
 expect(f.bound).toHaveBeenCalledTimes(1);expect(f.trial).not.toHaveBeenCalled();expect(f.rpc.mock.calls.filter(([method])=>method==='tasks.finish')).toHaveLength(2);
});
it('read-only authorization refuses external candidate writes and acknowledges failure',async()=>{
 const f=await fixture(false);await f.dispatcher.handle(f.command('submitDraft'));expect((await f.store.workspaces.get(f.ws.id))?.draft?.code).toContain('initial');
 expect(f.rpc).toHaveBeenCalledWith('tasks.finish',expect.objectContaining({state:'failed',result:{code:'PAGE_CAPABILITY_DENIED'}}));
});
it('candidate submission uses CAS and original workspace lease without overwriting saved scripts',async()=>{
 const f=await fixture();const release=await lockWorkspace(f.ws.id,f.db);await f.dispatcher.handle(f.command('submitDraft'));await release();
 expect((await f.store.workspaces.get(f.ws.id))?.draft?.code).toContain('initial');
 expect(await f.dispatcher.conflicts()).toHaveLength(1);
 const command=f.command('submitDraft');await f.dispatcher.handle(command);const updated=await f.store.workspaces.get(f.ws.id);
 expect(updated?.draft?.code).toContain('candidate');expect(await f.store.list()).toEqual([]);
 expect(f.updated).toHaveBeenCalledTimes(1);
 await f.dispatcher.handle(command);expect((await f.store.workspaces.get(f.ws.id))?.draftRevision).toBe(updated?.draftRevision);
 await f.dispatcher.handle(f.command('submitDraft'));expect(f.rpc).toHaveBeenLastCalledWith('tasks.finish',expect.objectContaining({state:'failed',result:{code:'REVISION_CONFLICT'}}));
});
it('trial request waits; explicit local confirmation executes once and completion acknowledgement can be retried',async()=>{
 const f=await fixture();await f.dispatcher.handle(f.command('requestTrial'));expect(f.trial).not.toHaveBeenCalled();const [approval]=await f.dispatcher.list();
 await f.dispatcher.decide(approval.id,'approve');await expect(f.dispatcher.decide(approval.id,'approve')).rejects.toMatchObject({code:'APPROVAL_ALREADY_CONSUMED'});
 await f.dispatcher.reconcile();expect(f.trial).toHaveBeenCalledTimes(1);
 expect(f.updated).toHaveBeenCalledWith(f.ws.id,expect.objectContaining({id:expect.any(String)}));
 expect(f.rpc).toHaveBeenLastCalledWith('tasks.finish',expect.objectContaining({state:'completed',epoch:2}));
});
it('code changes invalidate pending confirmation; rejection and navigation never execute',async()=>{
 const f=await fixture();await f.dispatcher.handle(f.command('requestTrial'));const [approval]=await f.dispatcher.list();
 await f.store.workspaces.saveDraft(f.ws.id,f.ws.draftRevision,{input:'changed'});
 expect(await f.dispatcher.list()).toEqual([]);await expect(f.dispatcher.decide(approval.id,'approve')).rejects.toMatchObject({code:'APPROVAL_ALREADY_CONSUMED'});
 const g=await fixture();await g.dispatcher.handle(g.command('requestTrial'));const [other]=await g.dispatcher.list();await g.dispatcher.decide(other.id,'reject');expect(g.trial).not.toHaveBeenCalled();
 const h=await fixture();await h.dispatcher.handle(h.command('requestTrial'));await h.pages.invalidateTab(4);expect(await h.dispatcher.list()).toEqual([]);expect(h.trial).not.toHaveBeenCalled();
});
it('revocation during context capture fences output; no active-page fallback',async()=>{
 const f=await fixture();f.bound.mockImplementationOnce(async()=>{await f.pages.invalidateTab(4);return f.page;});await f.dispatcher.handle(f.command());
 expect(f.rpc).toHaveBeenLastCalledWith('tasks.finish',expect.objectContaining({state:'failed',result:{code:'PAGE_NOT_GRANTED'}}));
});
it('cancel while capture is pending fences completion and late cancellation from a different epoch is ignored',async()=>{
 const f=await fixture();const command=f.command();let release!:()=>void;let started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;});
 f.bound.mockImplementationOnce(async()=>{started();await new Promise<void>(resolve=>{release=resolve;});return f.page;});const running=f.dispatcher.handle(command);await waiting;
 await f.dispatcher.cancel(command.taskId,command.epoch+1);await f.dispatcher.cancel(command.taskId,command.epoch);release();await running;
 expect(f.rpc).toHaveBeenLastCalledWith('tasks.cancelAck',{taskId:command.taskId,epoch:command.epoch,outcome:'cancelled'});
 expect(f.rpc.mock.calls.some(([method,params])=>method==='tasks.finish'&&params?.state==='completed')).toBe(false);
});
it('confirmation failure becomes unknown and repeated confirmation never executes again',async()=>{
 const f=await fixture();await f.dispatcher.handle(f.command('requestTrial'));const [approval]=await f.dispatcher.list();f.trial.mockRejectedValueOnce(Error('result lost'));
 await expect(f.dispatcher.decide(approval.id,'approve')).rejects.toThrow('result lost');expect((await f.dispatcher.list())[0].state).toBe('unknown');
 await expect(f.dispatcher.decide(approval.id,'approve')).rejects.toMatchObject({code:'APPROVAL_ALREADY_CONSUMED'});await f.dispatcher.decide(approval.id,'review');expect(f.trial).toHaveBeenCalledTimes(1);expect(await f.dispatcher.list()).toEqual([]);
});
it('known missing userScripts capability fails without recording an unknown execution',async()=>{
 const f=await fixture();await f.dispatcher.handle(f.command('requestTrial'));const [approval]=await f.dispatcher.list();f.trial.mockRejectedValueOnce(new DataError('USER_SCRIPTS_REQUIRED','Enable user scripts'));
 await expect(f.dispatcher.decide(approval.id,'approve')).rejects.toMatchObject({code:'USER_SCRIPTS_REQUIRED'});expect(await f.dispatcher.list()).toEqual([]);
 expect(await f.db.get('meta',approval.id)).toMatchObject({state:'failed'});expect(f.rpc).toHaveBeenLastCalledWith('tasks.finish',expect.objectContaining({state:'failed',result:{code:'USER_SCRIPTS_REQUIRED'}}));
});
it('reads only the explicitly bound tool baseline without input, history, GM or other tools',async()=>{
 const f=await fixture();await f.store.workspaces.saveDraft(f.ws.id,f.ws.draftRevision,{input:'PRIVATE_INPUT'},[{role:'user',text:'PRIVATE_HISTORY',createdAt:1}]);
 await f.db.mutate(async tx=>{await request(tx.objectStore('gm').put({id:'workspace:'+f.ws.id,values:{secret:'PRIVATE_GM'}}));});
 await f.dispatcher.handle(f.command('readTool'));
 const finish=f.rpc.mock.calls.findLast(([method])=>method==='tasks.finish')!;const result=finish[1]?.result as {draftRevision:number;baseline:{code:string}};
 expect(result.draftRevision).toBe(2);expect(result.baseline.code).toContain('initial');expect(JSON.stringify(result)).not.toMatch(/PRIVATE_INPUT|PRIVATE_HISTORY|PRIVATE_GM/);
 const other=await f.store.workspaces.create(null,'example.com');await f.dispatcher.handle({...f.command('readTool'),workspaceId:other.id});
 expect(f.rpc).toHaveBeenLastCalledWith('tasks.finish',expect.objectContaining({state:'failed',result:{code:'TOOL_NOT_GRANTED'}}));
});
it('rejects malformed, truncated and over-privileged candidates without changing the current draft',async()=>{
 const f=await fixture();for(const [index,code] of ['const x = ;','function truncated( {'].entries()){
  const command=f.command('submitDraft');command.requestKey='invalid-'+index;command.candidate!.code=code;await f.dispatcher.handle(command);
  expect((await f.store.workspaces.get(f.ws.id))?.draft?.code).toContain('initial');
 }
 const command=f.command('submitDraft');command.candidate!.grants=['GM_xmlhttpRequest'];await expect(f.dispatcher.handle(command)).rejects.toMatchObject({code:'INVALID_CANDIDATE'});
 expect((await f.store.workspaces.get(f.ws.id))?.draftRevision).toBe(f.ws.draftRevision);
});
it('returns a complete large baseline and explicitly fails instead of truncating an oversized one',async()=>{
 const f=await fixture();const code='//'+ 'a'.repeat(100000)+'\nconsole.log(1)';
 await f.store.workspaces.saveDraft(f.ws.id,f.ws.draftRevision,{draft:{...f.ws.draft!,code}});
 await f.dispatcher.handle(f.command('readTool'));
 expect(f.rpc).toHaveBeenLastCalledWith('tasks.finish',expect.objectContaining({state:'completed',result:expect.objectContaining({baseline:expect.objectContaining({code})})}));
 const ws=(await f.store.workspaces.get(f.ws.id))!;
 // Raw code fits the per-version budget, but JSON escaping exceeds the wire budget.
 await f.store.workspaces.saveDraft(ws.id,ws.draftRevision,{draft:{...ws.draft!,code:'//'+ '\\'.repeat(160000)}});
 await f.dispatcher.handle(f.command('readTool'));
 expect(f.rpc).toHaveBeenLastCalledWith('tasks.finish',expect.objectContaining({state:'failed',result:{code:'BASELINE_TOO_LARGE'}}));
});
it('remote cancellation expires a pending confirmation without invoking trial execution',async()=>{
 const f=await fixture();await f.dispatcher.handle(f.command('requestTrial'));const [approval]=await f.dispatcher.list();
 f.rpc.mockImplementation(async method=>method==='tasks.get'?{task:{state:'cancelled'}}:{});
 expect(await f.dispatcher.list()).toEqual([]);
 await expect(f.dispatcher.decide(approval.id,'approve')).rejects.toMatchObject({code:'APPROVAL_ALREADY_CONSUMED'});
 expect(f.trial).not.toHaveBeenCalled();
});
it('rejection followed by a fresh request executes only the new approval and preserves candidate revision',async()=>{
 const f=await fixture();await f.dispatcher.handle(f.command('requestTrial'));const [first]=await f.dispatcher.list();
 await f.dispatcher.decide(first.id,'reject');await f.dispatcher.handle(f.command('requestTrial'));const [second]=await f.dispatcher.list();
 expect(second.id).not.toBe(first.id);expect(f.trial).not.toHaveBeenCalled();
 await f.dispatcher.decide(second.id,'approve');await f.dispatcher.reconcile();expect(f.trial).toHaveBeenCalledTimes(1);
 expect((await f.store.workspaces.get(f.ws.id))?.draftRevision).toBe(f.ws.draftRevision);expect(await f.store.list()).toEqual([]);
});
