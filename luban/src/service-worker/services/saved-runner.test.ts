import 'fake-indexeddb/auto';
import {afterEach,expect,it,vi} from 'vitest';
import {Database,DataError} from '../repositories/database';
import {ScriptStore} from '../script-store';
import {SavedRunner} from './saved-runner';
import {lockWorkspace} from './workspace-lock';
import {localTasks} from './local-tasks';
import type {CapturedPage} from '../../shared/p2-types';
import type {UserScript} from '../../shared/types';
import type {TrialResult} from '../../shared/p3-types';
const dbs:Database[]=[];afterEach(async()=>{for(const db of dbs.splice(0))await db.close();});
async function setup(){
 const db=new Database('saved-runner-'+crypto.randomUUID());dbs.push(db);
 const legacy:UserScript={id:'saved-tool',name:'Saved',description:'',explanation:'',code:'console.log("saved")',gmGrants:[],matches:['*://example.com/*'],enabled:true,runAt:'document-end',source:'ai',createdAt:1,updatedAt:1};
 const store=new ScriptStore(db,async()=>({'luban:script:saved-tool':legacy}));await store.ready();const ws=await store.workspaces.create(legacy.id,'example.com');
 const capture=vi.fn(async()=>({binding:{tabId:1,documentId:'saved-document',host:'example.com',url:'https://example.com/'},context:{}} as CapturedPage));
 const execute=vi.fn(async():Promise<TrialResult>=>({ok:true,timedOut:false,changes:[]}));
 return{db,store,ws,execute,capture,runner:new SavedRunner(store,capture,execute)};
}
it('saved execution is one-use and writes GM plus terminal receipt atomically',async()=>{
 const f=await setup();f.execute.mockResolvedValueOnce({ok:true,timedOut:false,changes:[{op:'set',key:'count',value:1}]});
 await f.runner.run('saved-tool','same-operation');await expect(f.runner.run('saved-tool','same-operation')).rejects.toMatchObject({code:'APPROVAL_ALREADY_CONSUMED'});
 expect(f.execute).toHaveBeenCalledTimes(1);expect(await f.store.readGm('saved-tool')).toEqual({count:1});expect(await f.db.get('approvals','saved:same-operation')).toMatchObject({state:'completed'});
});
it('saved run and workspace editing mutually exclude each other across persistent leases',async()=>{
 const f=await setup();const release=await lockWorkspace(f.ws.id,f.db,'generate');await expect(f.runner.run('saved-tool','while-generation')).rejects.toMatchObject({code:'WORKSPACE_BUSY'});await release();expect(f.execute).not.toHaveBeenCalled();
 let deliver!:(r:TrialResult)=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>{started=resolve;});f.execute.mockImplementationOnce(()=>new Promise(resolve=>{deliver=resolve;started();}));
 const run=f.runner.run('saved-tool','running');await waiting;
 await expect(f.store.workspaces.saveDraft(f.ws.id,0,{input:'competing'})).rejects.toMatchObject({code:'WORKSPACE_BUSY'});
 await expect(lockWorkspace(f.ws.id,f.db,'submitDraft','mcp')).rejects.toMatchObject({code:'WORKSPACE_BUSY'});
 await expect(f.store.workspaces.rename('saved-tool',1,'changed')).rejects.toMatchObject({code:'WORKSPACE_BUSY'});
  await expect(f.store.delete('saved-tool')).rejects.toMatchObject({code:'WORKSPACE_BUSY'});
 deliver({ok:true,timedOut:false,changes:[]});await run;
});
it('lost execution result stays unknown; review only unblocks a new explicit request',async()=>{
 const f=await setup();f.execute.mockRejectedValueOnce(Error('lost result'));
 await expect(f.runner.run('saved-tool','lost')).rejects.toMatchObject({code:'TRIAL_OUTCOME_UNKNOWN'});
 await expect(f.runner.run('saved-tool','retry')).rejects.toMatchObject({code:'RECOVERY_REQUIRED'});expect(f.execute).toHaveBeenCalledTimes(1);
 await localTasks({action:'reviewUnknown',id:'saved:lost',reviewed:true},f.store);expect(f.execute).toHaveBeenCalledTimes(1);
 await f.runner.run('saved-tool','new-explicit-request');expect(f.execute).toHaveBeenCalledTimes(2);
});
it('wrong page and missing userScripts permission cannot execute or create an unknown replay',async()=>{
 const f=await setup();f.capture.mockResolvedValueOnce({binding:{tabId:1,documentId:'wrong',host:'other.example',url:'https://other.example/'},context:{}} as CapturedPage);
 await expect(f.runner.run('saved-tool','wrong')).rejects.toMatchObject({code:'WRONG_PAGE'});expect(f.execute).not.toHaveBeenCalled();
 f.execute.mockRejectedValueOnce(new DataError('USER_SCRIPTS_REQUIRED','Permission needed'));
 await expect(f.runner.run('saved-tool','permission')).rejects.toMatchObject({code:'USER_SCRIPTS_REQUIRED'});
 expect(await f.db.get('approvals','saved:permission')).toMatchObject({state:'failed'});
});
