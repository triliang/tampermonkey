import 'fake-indexeddb/auto';
import {afterEach,describe,expect,it} from 'vitest';
import {Database,request} from '../repositories/database';
import {ScriptStore} from '../script-store';
import {lockWorkspace,assertWorkspaceOwner} from './workspace-lock';
const dbs:Database[]=[];
afterEach(async()=>{for(const db of dbs.splice(0))await db.close();});
describe('S1 persistent extension workspace ownership',()=>{
 it('rejects writes without an owner and fences an old epoch inside the write transaction',async()=>{
  const db=new Database('v3-lease-'+crypto.randomUUID());dbs.push(db);const store=new ScriptStore(db,async()=>({}));await store.ready();const ws=await store.workspaces.create(null,'example.com');const release=await lockWorkspace(ws.id,db);
  try{await expect(store.workspaces.saveDraft(ws.id,0,{input:'competing'})).rejects.toMatchObject({code:'WORKSPACE_BUSY'});const updated=await store.workspaces.saveDraft(ws.id,0,{input:'owner'},[],undefined,release.owner);expect(updated.input).toBe('owner');
   await db.mutate(async tx=>{const s=tx.objectStore('workspaceLeases');const row=await request<{id:string;epoch:number;token:string}>(s.get(ws.id));row.epoch++;row.token='replacement';await request(s.put(row));});
   await expect(store.workspaces.saveDraft(ws.id,updated.draftRevision,{input:'late'},[],undefined,release.owner)).rejects.toMatchObject({code:'TASK_STALE'});expect((await store.workspaces.get(ws.id))?.input).toBe('owner');
  }finally{await release();}
  expect((await db.get<{token:string}>('workspaceLeases',ws.id))?.token).toBe('replacement');
 });
 it('persists leases across database connections and preserves active work on repository initialization',async()=>{
  const db=new Database('v3-reopen-'+crypto.randomUUID());dbs.push(db);const store=new ScriptStore(db,async()=>({}));await store.ready();const ws=await store.workspaces.create(null,'example.com');const release=await lockWorkspace(ws.id,db);
  try{await store.workspaces.saveDraft(ws.id,0,{status:'generating',activeRequestId:'request'},[],undefined,release.owner);const other=new Database(db.name);dbs.push(other);const restarted=new ScriptStore(other,async()=>({}));await restarted.ready();expect((await restarted.workspaces.get(ws.id))?.status).toBe('generating');await expect(other.transaction(['workspaceLeases','workspaces','approvals'],'readonly',tx=>assertWorkspaceOwner(tx,ws.id))).rejects.toMatchObject({code:'WORKSPACE_BUSY'});}finally{await release();}
 });
});
