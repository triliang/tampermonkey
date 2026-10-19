// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';import {h,render} from 'preact';import {act} from 'preact/test-utils';import {IDBFactory} from 'fake-indexeddb';
import {installHarness} from '../../tests/p2/harness';import App from './App';import type {V4Conversation} from '../shared/v4-types';import type {ScriptVersion} from '../shared/v2-types';
it('upgrades the original chat in place, restores old draft/history, and applies candidates without changing conversation',async()=>{
 const previous=window.location.href;window.history.replaceState(null,'','?tabId=1');vi.stubGlobal('indexedDB',new IDBFactory());const fixture=await installHarness();const root=document.createElement('div');document.body.append(root);
 const original=await fixture.store.workspaces.create(null,'shop.example.com');const draft:ScriptVersion={versionId:'old-version',hash:'old-hash',code:'console.log("old draft")',grants:[],explanation:'原草稿',runAt:'document_end',createdAt:10};
 await fixture.store.workspaces.saveDraft(original.id,0,{draft,input:'原来未发送的内容'},[{role:'user',text:'原来的需求记录',createdAt:1}]);await chrome.storage.session.set({'luban:chat:workspace:1':original.id});
 const values=fixture.sessionValues();Object.assign(chrome.storage.session,{get:async()=>values,set:async(data:Record<string,unknown>)=>{Object.assign(values,data);},remove:async(key:string)=>{delete values[key];}});
 const transport=chrome.runtime.sendMessage.bind(chrome.runtime);const calls:string[]=[];let c:V4Conversation|null=null;
 (chrome.runtime as unknown as {sendMessage:(m:Record<string,unknown>)=>Promise<unknown>}).sendMessage=async m=>{
  if(m.type!=='V4_HARNESS')return transport(m as never);const method=m.method as string,params=m.params as Record<string,unknown>;calls.push(method);
  if(method==='configure'){expect(params.conversationId).toBe('same-agent-thread');return {ok:true,data:{model:'test'}};}
  if(method==='open'){if(!c){const history=await fixture.store.workspaces.conversation(params.workspaceId as string);c={id:'same-agent-thread',workspaceId:params.workspaceId as string,historyCount:history.length,messages:history,revision:0,sequence:0,epoch:0,status:'idle',page:null,targets:[],selected:[],confirmed:false,plan:null,decision:null,artifact:null};}return {ok:true,data:structuredClone(c)};}
  if(!c)throw Error('missing conversation');
  if(method==='message'){c.messages.push({role:'user',text:params.text as string,createdAt:Date.now()});c.messages.push({role:'assistant',text:'继续沿用原会话，先确认需求。',createdAt:Date.now()+1});c.sequence!++;
   if(params.text==='按当前方案生成脚本'){c.plan={revision:1,hash:'plan-hash',ids:['t'],action:'hide',constraints:[]};c.artifact={operationId:'candidate-one',epoch:1,planHash:'plan-hash',baselineHash:'old-hash',code:'console.log("new candidate")',grants:[],explanation:'已授权候选'};c.status='candidate';}
  }
  if(method==='submit'){const ws=(await fixture.store.workspaces.get(c.workspaceId))!;await fixture.store.workspaces.saveDraft(ws.id,ws.draftRevision,{draft:{...draft,code:c.artifact!.code,versionId:'new-version'}},[{role:'assistant',text:'候选已检查应用，等待单独运行。',createdAt:Date.now()+2}]);c.submitted=true;return {ok:true,data:{workspaceId:ws.id}};}
  return {ok:true,data:structuredClone(c)};
 };
 const type=async(text:string)=>act(async()=>{const area=root.querySelector<HTMLTextAreaElement>('#intent')!;area.value=text;area.dispatchEvent(new Event('input',{bubbles:true}));});const send=async()=>act(async()=>root.querySelector<HTMLButtonElement>('button[aria-label="发送"]')!.click());
 try{await act(async()=>render(h(App,{initialView:'home'}),root));await vi.waitFor(()=>expect(root.querySelector<HTMLTextAreaElement>('#intent')?.value).toBe('原来未发送的内容'));
  expect(root.textContent).toContain('原来的需求记录');expect(root.querySelectorAll('textarea')).toHaveLength(1);expect(root.textContent).not.toContain('V4 对话');expect(root.textContent).not.toContain('脚本工具与历史');expect(fixture.sent).toHaveLength(0);
  const executor=root.querySelector<HTMLSelectElement>('select[aria-label="执行方"]')!;expect(executor).not.toBeNull();await act(async()=>{executor.value='codex';executor.dispatchEvent(new Event('change',{bubbles:true}));});expect(values['luban:v3:executor:tab:1']).toBe('codex');expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('原来未发送的内容');
  await type('先讨论，不生成');await send();await vi.waitFor(()=>expect(root.textContent).toContain('继续沿用原会话'));expect(fixture.sent).toHaveLength(0);expect(calls).not.toContain('generate');expect((await fixture.store.workspaces.get(original.id))!.draft!.code).toBe(draft.code);
  await vi.waitFor(()=>expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe(''));await type('按当前方案生成脚本');await send();await vi.waitFor(()=>expect(root.textContent).toContain('检查并应用到当前草稿'));
  await vi.waitFor(()=>expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe(''));await type('待发送反馈应保留');const apply=()=>[...root.querySelectorAll('button')].find(b=>b.textContent==='检查并应用到当前草稿')!;
  await act(async()=>apply().click());await vi.waitFor(async()=>expect((await fixture.store.workspaces.get(original.id))!.draft!.code).toBe('console.log("new candidate")'));
  await vi.waitFor(()=>expect(root.querySelector<HTMLTextAreaElement>('#intent')!.value).toBe('待发送反馈应保留'));expect(root.querySelectorAll('textarea')).toHaveLength(1);expect(root.textContent).toContain('原来的需求记录');expect(root.querySelector('.chat-artifact')).not.toBeNull();expect(c!.id).toBe('same-agent-thread');expect(await fixture.store.workspaces.list()).toHaveLength(1);
  await act(async()=>render(null,root));await act(async()=>render(h(App,{initialView:'home'}),root));await vi.waitFor(()=>expect(root.querySelector<HTMLTextAreaElement>('#intent')?.value).toBe('待发送反馈应保留'));expect((root.textContent!.match(/原来的需求记录/g)??[])).toHaveLength(1);expect(calls.filter(x=>x==='message')).toHaveLength(2);expect(fixture.sent).toHaveLength(0);
 }finally{render(null,root);root.remove();await fixture.close();vi.unstubAllGlobals();window.history.replaceState(null,'',previous);}
});
