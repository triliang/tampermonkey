import type {BridgeSnapshot,PageGrant,PageCapability} from '../../shared/bridge-types';
import type {CapturedPage,PageBinding} from '../../shared/p2-types';
import type {ScriptStore} from '../script-store';
import {request,DataError} from '../repositories/database';import {workerId} from './workspace-lock';
interface Connection {run(action:'status'):Promise<BridgeSnapshot>;syncPages(grants:PageGrant[]):Promise<void>;}
export class PageGrants {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private store:ScriptStore,private connection:Connection,private session:()=>Promise<string>,private capture:()=>Promise<CapturedPage>,private boundCapture:(binding:PageBinding,selectors?:string[])=>Promise<CapturedPage>){}
 private serialize<T>(work:()=>Promise<T>):Promise<T>{const next=this.queue.then(work);this.queue=next.catch(()=>undefined);return next;}
 async list():Promise<PageGrant[]>{await this.store.ready();const session=await this.session();return(await this.store.db.all<PageGrant>('pageGrants')).filter(g=>g.workerId===workerId&&g.browserSession===session);}
 create(tabId:number,url:string,allowDrafts=false,workspaceId?:string,capture=this.capture):Promise<PageGrant[]>{return this.serialize(async()=>{
  const status=await this.connection.run('status');if(status.status!=='connected'||!status.profileId)throw new DataError('BRIDGE_DISCONNECTED','请先在设置中连接本机 Bridge。');
  const page=await capture();if(page.binding.tabId!==tabId||page.binding.url!==url)throw new DataError('PAGE_CHANGED','展示的页面已变化，请刷新页面状态后重新授权。');
  const session=await this.session();await this.store.ready();
  if(allowDrafts){const ws=workspaceId?await this.store.workspaces.get(workspaceId):undefined;if(!ws||ws.host!==page.binding.host)throw new DataError('WORKSPACE_NOT_GRANTED','请先选择当前页面的工具工作区。');}
  const grant:PageGrant={id:crypto.randomUUID(),profileId:status.profileId,browserSession:session,workerId,navigationEpoch:Date.now(),binding:page.binding,title:page.context.meta.title.slice(0,160),createdAt:Date.now(),...(allowDrafts?{workspaceId}:{}),capabilities:allowDrafts?['context.read','tool.read','draft.submit','trial.request']:['context.read']};
  await this.store.db.mutate(async tx=>{const meta=tx.objectStore('meta'),key=`v3:navigation:${tabId}`;const prior=await request<{epoch:number}|undefined>(meta.get(key));grant.navigationEpoch=(prior?.epoch??0)+1;await request(meta.put({id:key,epoch:grant.navigationEpoch}));const s=tx.objectStore('pageGrants');const existing=await request<PageGrant[]>(s.getAll());for(const row of existing)if(row.binding.tabId===tabId)await request(s.delete(row.id));if(existing.filter(row=>row.binding.tabId!==tabId).length>=20)throw new DataError('TOO_MANY_PAGE_GRANTS','最多授权 20 个页面，请先撤销不需要的授权。');await request(s.put(grant));});
  try{const grants=await this.list();await this.connection.syncPages(grants);return grants;}
  catch(e){await this.clearLocal();throw e;}
 });}
 revoke(id?:string):Promise<PageGrant[]>{return this.serialize(async()=>{await this.store.ready();await this.store.db.mutate(async tx=>{const s=tx.objectStore('pageGrants');if(id)await request(s.delete(id));else await request(s.clear());});const grants=await this.list();if((await this.connection.run('status')).status==='connected')await this.connection.syncPages(grants);return grants;});}
 invalidateTab(tabId:number):Promise<void>{return this.serialize(async()=>{await this.store.ready();await this.store.db.mutate(async tx=>{for(const grant of await request<PageGrant[]>(tx.objectStore('pageGrants').getAll()))if(grant.binding.tabId===tabId)await request(tx.objectStore('pageGrants').delete(grant.id));});if((await this.connection.run('status')).status==='connected')await this.connection.syncPages(await this.list());});}
 private async clearLocal(){await this.store.ready();await this.store.db.mutate(async tx=>{await request(tx.objectStore('pageGrants').clear());});}
 invalidateAll():Promise<void>{return this.serialize(async()=>{await this.clearLocal();if((await this.connection.run('status')).status==='connected')await this.connection.syncPages([]);});}
 async require(id:string,capability:PageCapability='context.read'):Promise<PageGrant>{const grant=(await this.list()).find(g=>g.id===id),status=await this.connection.run('status');if(!grant||status.status!=='connected'||grant.profileId!==status.profileId)throw new DataError('PAGE_NOT_GRANTED','页面尚未授权或授权已失效。');if(!(grant.capabilities??['context.read']).includes(capability))throw new DataError('PAGE_CAPABILITY_DENIED','页面未开放该操作，请在侧栏重新选择授权范围。');return grant;}
 async read(id:string,selectors?:string[]):Promise<CapturedPage>{const grant=await this.require(id);const captured=await this.boundCapture(grant.binding,selectors);const fresh=await this.store.db.get<PageGrant>('pageGrants',id);const current=await this.connection.run('status');if(!fresh||current.status!=='connected'||current.profileId!==grant.profileId||fresh.navigationEpoch!==grant.navigationEpoch||fresh.browserSession!==await this.session()||captured.binding.documentId!==grant.binding.documentId)throw new DataError('PAGE_NOT_GRANTED','采集期间页面授权已失效。');return captured;}
}
