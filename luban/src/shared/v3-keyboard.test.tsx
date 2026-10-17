// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {h,render} from 'preact';
import {act} from 'preact/test-utils';
import {SendToFeishu} from './SendToFeishu';
import {ExternalApprovals} from './ExternalApprovals';
it('发送预览 Esc 取消已预览内容，不能确认发送或运行任务',async()=>{
 const send=vi.fn(async(m)=>({ok:true,data:{delivery:{id:'test-delivery',body:m.params.text}}}));vi.stubGlobal('chrome',{runtime:{sendMessage:send}});const root=document.createElement('div');document.body.append(root);
 try{await act(async()=>render(h(SendToFeishu,{summary:'测试摘要'}),root));const b=(s:string)=>[...root.querySelectorAll('button')].find(b=>b.textContent===s)!;
 await act(async()=>b('发送结果到飞书').click());await act(async()=>b('预览发送内容').click());expect(root.textContent).toContain('确认发送');
 await act(async()=>{b('确认发送').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
 expect(send.mock.calls.map(c=>c[0].method)).toEqual(['preview','cancelPreview']);expect(root.textContent).toContain('已取消，未发送');expect(root.querySelector('textarea')).toBeNull();await vi.waitFor(()=>expect(document.activeElement).toBe(b('发送结果到飞书')));
 }finally{render(null,root);root.remove();vi.unstubAllGlobals();}
});
it('确认卡 Esc 只折叠代码并回到标题，不批准或拒绝任务',async()=>{
 const send=vi.fn(async()=>({ok:true,data:{approvals:[{id:'test',task:{source:'mcp',clientId:'client-123'},profileId:'profile-123',binding:{host:'fixture.invalid'},workspaceId:'workspace',draftRevision:1,codeHash:'hash',expiresAt:Date.now()+60000,state:'pending',code:'// test'}]}}));vi.stubGlobal('chrome',{runtime:{sendMessage:send}});const root=document.createElement('div');document.body.append(root);
 try{await act(async()=>render(h(ExternalApprovals,{}),root));await vi.waitFor(()=>expect(root.querySelector('details')).not.toBeNull());const details=root.querySelector('details')!;details.open=true;await act(async()=>{details.querySelector('summary')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});expect(details.open).toBe(false);expect(document.activeElement).toBe(details.querySelector('summary'));expect(send).toHaveBeenCalledTimes(1);
 }finally{render(null,root);root.remove();vi.unstubAllGlobals();}
});
