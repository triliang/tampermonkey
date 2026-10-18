import 'fake-indexeddb/auto';
import {expect,it,vi} from 'vitest';
import {Database} from './database';import {ScriptStore} from '../script-store';import {handleWorkspaceCommand} from './workspace-router';
it('same-host tab drafts are listed and changed only by their own scope; legacy data remains intact',async()=>{
 const db=new Database('tab-workspaces-'+crypto.randomUUID()),store=new ScriptStore(db,async()=>({}));vi.stubGlobal('chrome',{runtime:{id:'fixture'}});
 const sender={id:'fixture',url:'chrome-extension://fixture/src/sidepanel/index.html?tabId=1'};const call=(type:string,scope:string,rest:object={})=>handleWorkspaceCommand({type,requestId:crypto.randomUUID(),...rest},sender,store,scope);
 try{const legacy=await store.workspaces.create(null,'same.example');const a=await call('CREATE_WORKSPACE','session:1',{scriptId:null,host:'same.example'}) as {id:string};const b=await call('CREATE_WORKSPACE','session:2',{scriptId:null,host:'same.example'}) as {id:string};
 await call('SAVE_DRAFT','session:1',{workspaceId:a.id,expectedDraftRevision:0,patch:{input:'only A'}});
 expect((await call('LIST_WORKSPACES','session:2') as Array<{id:string}>).map(w=>w.id).sort()).toEqual([legacy.id,b.id].sort());
 await call('GET_WORKSPACE','session:1',{workspaceId:legacy.id});await expect(call('GET_WORKSPACE','session:2',{workspaceId:legacy.id})).rejects.toMatchObject({code:'WRONG_TAB_WORKSPACE'});
 expect((await call('LIST_WORKSPACES','session:2') as Array<{id:string}>).map(w=>w.id)).toEqual([b.id]);
 for(const type of ['GET_WORKSPACE','SAVE_DRAFT','DISCARD_DRAFT'])await expect(call(type,'session:2',{workspaceId:a.id,expectedDraftRevision:1,patch:{input:'wrong tab'}})).rejects.toMatchObject({code:'WRONG_TAB_WORKSPACE'});
 expect((await store.workspaces.get(a.id))?.input).toBe('only A');expect((await store.workspaces.get(b.id))?.input).toBe('');expect(await store.workspaces.get(legacy.id)).toBeDefined();
 await store.workspaces.releasePanel('session:1');await call('GET_WORKSPACE','session:2',{workspaceId:a.id});expect((await store.workspaces.get(a.id))?.input).toBe('only A');
 const reopened=await call('GET_WORKSPACE','next-session:7',{workspaceId:a.id}) as {workspace:{panelScope:string;input:string}};expect(reopened.workspace.panelScope).toBe('next-session:7');expect(reopened.workspace.input).toBe('only A');
 }finally{await db.close();vi.unstubAllGlobals();}
});
