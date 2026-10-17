import 'fake-indexeddb/auto';
import {expect,it} from 'vitest';
import {Database,request} from '../repositories/database';import {ScriptStore} from '../script-store';
import {localTasks} from './local-tasks';import {lockWorkspace} from './workspace-lock';import type {LocalTask} from '../../shared/bridge-types';
it('journals transitions atomically and prunes only expired resolved terminal tasks with their events',async()=>{
 const db=new Database('v3-tasks-'+crypto.randomUUID());const store=new ScriptStore(db,async()=>({}));await store.ready();
 try{const ws=await store.workspaces.create(null,'example.com');const release=await lockWorkspace(ws.id,db,'generate');const id=release.owner.token;await release('cancelRequested');expect((await db.get<LocalTask>('tasks',id))?.state).toBe('cancelRequested');await release('cancelled');const settled=(await db.get<LocalTask>('tasks',id))!;expect(settled.state).toBe('cancelled');expect(settled.seq).toBe(3);
  const old=Date.now()-31*86400000;await db.mutate(async tx=>{for(const [id,state] of [['terminal','completed'],['active','running'],['waiting','waitingUser'],['unknown','failed']] as const){await request(tx.objectStore('tasks').put({...settled,id,state,updatedAt:old}));await request(tx.objectStore('taskEvents').put({id:`${id}:1`,taskId:id,seq:1}));}await request(tx.objectStore('approvals').put({id:'unresolved',workspaceId:ws.id,binding:{documentId:'doc'},draftRevision:1,ownerToken:'unknown',state:'unknown',createdAt:old,updatedAt:old}));});
  const result=await localTasks({action:'prune'},store);expect(result.ok).toBe(true);if(result.ok)expect(result.data.pruned).toBe(1);expect(await db.get('tasks','terminal')).toBeUndefined();for(const id of ['active','waiting','unknown'])expect(await db.get('tasks',id)).toBeDefined();expect(await db.get('taskEvents','terminal:1')).toBeUndefined();expect(await db.get('taskEvents','unknown:1')).toBeDefined();
 }finally{await db.close();}
});
