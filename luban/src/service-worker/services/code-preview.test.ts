import 'fake-indexeddb/auto';
import {it,expect,vi,afterEach} from 'vitest';
import {Database} from '../repositories/database';
import {ScriptStore} from '../script-store';
import {CodePreviewService} from './code-preview';
const dbs:Database[]=[];afterEach(async()=>{for(const db of dbs)await db.close();dbs.length=0;vi.unstubAllGlobals();});
async function setup(){vi.stubGlobal('chrome',{runtime:{id:'ext'}});const db=new Database('preview-'+crypto.randomUUID());dbs.push(db);const store=new ScriptStore(db,async()=>({}));const ws=await store.workspaces.create(null,'example.com');await store.workspaces.saveDraft(ws.id,0,{draft:{versionId:'v1',hash:'unverified',code:'const n=1;\nconsole.log(n);',grants:[],runAt:'document_end',explanation:'test',createdAt:1}});const notify=vi.fn(async()=>{});const service=new CodePreviewService(store,notify);const snapshot=await service.create(ws.id,'代码',1,'doc1');const sender={id:'ext',frameId:0,tab:{id:1},documentId:'doc1'} as chrome.runtime.MessageSender;return{store,ws,service,snapshot,sender,notify};}
it('页面浮层选行绑定工作区与版本，编辑保留输入并清除旧检查资格',async()=>{
 const {store,ws,service,snapshot,sender,notify}=await setup();await service.action({type:'CODE_PREVIEW_ACTION',requestId:'q',sessionId:snapshot.sessionId,action:'reference',versionId:'v1',lines:[2]},sender);expect((await store.workspaces.get(ws.id))?.codeReference?.text).toBe('L2: console.log(n);');
 const live=(await store.workspaces.get(ws.id))!;await store.workspaces.saveDraft(ws.id,live.draftRevision,{input:'下一轮需求'});
 const result=await service.action({type:'CODE_PREVIEW_ACTION',requestId:'e',sessionId:snapshot.sessionId,action:'edit',code:'const n=2;'},sender);expect(result!.current.versionId).not.toBe('v1');expect((await store.workspaces.get(ws.id))?.input).toBe('下一轮需求');expect(notify).toHaveBeenCalledTimes(2);
});
it('其他标签、子 frame、导航后的 document 和未知会话不能修改工作区',async()=>{
 const {store,ws,service,snapshot,sender}=await setup();const message={type:'CODE_PREVIEW_ACTION' as const,requestId:'x',sessionId:snapshot.sessionId,action:'edit' as const,code:'changed'};
 for(const other of [{...sender,tab:{id:2}},{...sender,frameId:1},{...sender,documentId:'doc2'},{...sender,id:'other'}])await expect(service.action(message,other as chrome.runtime.MessageSender)).rejects.toMatchObject({code:'PREVIEW_EXPIRED'});
 await expect(service.action({...message,sessionId:'unknown'},sender)).rejects.toThrow();expect((await store.workspaces.get(ws.id))?.draft?.code).toContain('const n=1');
});
it('旧代码浮层不能覆盖新草稿，关闭会话后不能再编辑',async()=>{
 const {store,ws,service,snapshot,sender}=await setup();const live=(await store.workspaces.get(ws.id))!;await store.workspaces.saveDraft(ws.id,live.draftRevision,{draft:{...live.draft!,versionId:'new',code:'console.log("new")'}});
 await expect(service.action({type:'CODE_PREVIEW_ACTION',requestId:'e',sessionId:snapshot.sessionId,action:'edit',code:'old edit'},sender)).rejects.toMatchObject({code:'PREVIEW_STALE'});expect((await store.workspaces.get(ws.id))?.draft?.code).toContain('new');
 await service.forget(snapshot.sessionId);await expect(service.action({type:'CODE_PREVIEW_ACTION',requestId:'x',sessionId:snapshot.sessionId,action:'close'},sender)).rejects.toMatchObject({code:'PREVIEW_EXPIRED'});
});

it('SW 重建服务后凭持久化会话仍可选行，绑定校验继续有效',async()=>{
 const {store,ws,snapshot,sender}=await setup();const restarted=new CodePreviewService(store,async()=>{});await restarted.action({type:'CODE_PREVIEW_ACTION',requestId:'wake',sessionId:snapshot.sessionId,action:'reference',versionId:'v1',lines:[1]},sender);expect((await store.workspaces.get(ws.id))?.codeReference?.lines).toEqual([1]);
});
