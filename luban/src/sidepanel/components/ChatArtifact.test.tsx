// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {h,render} from 'preact';
import {act} from 'preact/test-utils';
import {ChatMarkdown} from './ChatMarkdown';
import {CodeArtifactDialog} from './CodeArtifactDialog';
import type {ScriptVersion} from '../../shared/v2-types';
it('Markdown 保留可读格式，HTML 和危险链接不能执行，不加载图片',()=>{
 const root=document.createElement('div');render(h(ChatMarkdown,{text:'# 标题\n- **重点**\n> 引用\n```js\nconst n = 42;\n```\n<img src=x onerror=alert(1)>\n[危险](javascript:alert) [安全](https://example.com)'}),root);
 expect(root.querySelector('h3')?.textContent).toBe('标题');expect(root.querySelector('strong')?.textContent).toBe('重点');expect(root.querySelector('blockquote')).not.toBeNull();expect(root.querySelector('.chat-token-keyword')?.textContent).toBe('const');expect(root.querySelector('img')).toBeNull();expect(root.querySelectorAll('a')).toHaveLength(1);expect(root.textContent).toContain('<img');render(null,root);
});
it('代码浮层支持 Shift/键盘选行，添加引用不修改代码，编辑前必须处理未保留内容',async()=>{
 Object.defineProperties(HTMLDialogElement.prototype,{showModal:{configurable:true,value:function(){this.open=true;}},close:{configurable:true,value:function(){this.open=false;}}});
 const root=document.createElement('div');document.body.append(root);const v={versionId:'v1',code:'const a=1;\nconst b=2;\nconsole.log(a,b);',grants:[],runAt:'document_end',hash:'h',explanation:'测试',createdAt:1} as ScriptVersion;
 const add=vi.fn(async()=>{}),edit=vi.fn(async()=>{}),close=vi.fn();
 await act(async()=>render(h(CodeArtifactDialog,{open:true,current:v,name:'测试',onName:()=>{},onClose:close,onReference:add,onEdit:edit,busy:false}),root));
 const lines=root.querySelectorAll('li'),button=(text:string)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text)!;
 expect(button('添加到聊天').disabled).toBe(true);
 await act(async()=>button('复制代码').click());expect(root.textContent).toContain('剪贴板不可用');
 await act(async()=>{lines[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));lines[2].dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));});
 expect(root.querySelectorAll('[aria-checked="true"]')).toHaveLength(3);
 await act(async()=>{lines[1].dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));});
 await act(async()=>button('添加到聊天').click());expect(add).toHaveBeenCalledWith(v,[1,3]);expect(edit).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();
 await vi.waitFor(()=>expect(button('编辑代码').disabled).toBe(false));await act(async()=>button('编辑代码').click());await act(async()=>{const area=root.querySelector('textarea')!;area.value='const changed=1;';area.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>root.querySelector<HTMLButtonElement>('[aria-label="关闭代码浮层"]')!.click());expect(close).toHaveBeenCalledOnce();expect(root.textContent).toContain('请先保留或放弃');
 await act(async()=>button('保留为未验证草稿').click());expect(edit).toHaveBeenCalledWith('const changed=1;');render(null,root);root.remove();
});
it('模型推理独立折叠、支持安全 Markdown，生成结束自动收起',async()=>{
 const {ReasoningDetails}=await import('./ReasoningDetails');const root=document.createElement('div');const stages=[{attempt:1,text:'**分析**\n<script>alert(1)</script>',truncated:false}];await act(async()=>render(h(ReasoningDetails,{stages,live:true}),root));expect(root.querySelector('details')?.open).toBe(true);expect(root.querySelector('strong')?.textContent).toBe('分析');expect(root.querySelector('script')).toBeNull();await act(async()=>render(h(ReasoningDetails,{stages,live:false}),root));expect(root.querySelector('details')?.open).toBe(false);render(null,root);
});
