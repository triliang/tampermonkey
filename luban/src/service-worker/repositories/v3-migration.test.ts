import 'fake-indexeddb/auto';
import {describe,it,expect,vi} from 'vitest';
import {Database,request,STORES} from './database';
const oldStores=['scripts','workspaces','conversations','gm','operations','receipts','runtimeStatus','meta'];
async function legacy(name:string){const opening=indexedDB.open(name,1);opening.onupgradeneeded=()=>{for(const name of oldStores)opening.result.createObjectStore(name,{keyPath:'id'});};return request(opening);}
describe('S1 IDB additive upgrade',()=>{
 it('aborted schema upgrade rolls back new stores and preserves v1 data, then retries safely',async()=>{
  const name='v3-abort-'+crypto.randomUUID();const old=await legacy(name);const tx=old.transaction('scripts','readwrite');await request(tx.objectStore('scripts').put({id:'keep',code:'original'}));await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});old.close();
  const original=indexedDB.open.bind(indexedDB);const spy=vi.spyOn(indexedDB,'open').mockImplementationOnce((name,version)=>{const r=original(name,version);r.addEventListener('upgradeneeded',()=>{queueMicrotask(()=>r.transaction?.abort());});return r;});const db=new Database(name);
  try{await expect(db.open()).rejects.toMatchObject({name:'AbortError'});spy.mockRestore();const inspection=await request(indexedDB.open(name));expect(inspection.version).toBe(1);expect(inspection.objectStoreNames.contains('tasks')).toBe(false);const row=await request(inspection.transaction('scripts').objectStore('scripts').get('keep'));expect(row).toEqual({id:'keep',code:'original'});inspection.close();expect((await db.open()).version).toBe(2);expect(await db.get('scripts','keep')).toEqual(row);}finally{spy.mockRestore();await db.close();}
 });
 it('preserves all v1 records without replaying or rewriting user data',async()=>{
  const name='v3-migration-'+crypto.randomUUID();const old=await legacy(name);const tx=old.transaction(oldStores,'readwrite');const rows=oldStores.map(id=>({id,value:{draft:'original',revision:7,autoRun:true}}));await Promise.all(rows.map(row=>request(tx.objectStore(row.id).put(row))));await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});old.close();
  const db=new Database(name);try{expect((await db.open()).version).toBe(2);for(const row of rows)expect(await db.get(row.id as typeof STORES[number],row.id)).toEqual(row);for(const store of ['tasks','taskEvents','workspaceLeases','pageGrants','approvals'] as const)expect(await db.all(store)).toEqual([]);}finally{await db.close();}
 });
 it('blocked upgrade is visible and can be retried after the old window closes',async()=>{
  const name='v3-blocked-'+crypto.randomUUID();const old=await legacy(name);const db=new Database(name);
  await expect(db.open()).rejects.toMatchObject({code:'DB_BLOCKED'});old.close();
  // Let the abandoned blocked request abort instead of upgrading invisibly.
  await new Promise(resolve=>setTimeout(resolve,10));
  try{expect((await db.open()).version).toBe(2);}finally{await db.close();}
 });
});
