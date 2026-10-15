// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {render,h} from 'preact';
import {act} from 'preact/test-utils';
import {ReasoningDetails} from './ReasoningDetails';
import {reasoningNodes} from './reasoning-nodes';
it('按原始标题或段落拆分，不拆代码围栏，不补造节点，超长内容控制节点数',()=>{
 expect(reasoningNodes('第一段\n\n第二段').map(n=>n.title)).toEqual(['第一段','第二段']);
 const nodes=reasoningNodes('## 识别目标\n段落一\n\n段落二\n## 保留范围\n```js\n// 原始代码\n\nconst n=1;\n```');expect(nodes).toHaveLength(2);expect(nodes[0].text).toContain('段落二');expect(nodes[1].text).toContain('const n=1;');expect(reasoningNodes('')).toEqual([]);const many=reasoningNodes(Array.from({length:100},(_,i)=>`段落 ${i}`).join('\n\n'));expect(many).toHaveLength(64);expect(many.at(-1)?.text).toContain('段落 99');
});
it('实时展开最新节点，独立折叠、全部操作和手动选择在更新时保持',async()=>{
 const root=document.createElement('div');document.body.append(root);const stages=[{attempt:1,text:'## 确定目标\n目标文字\n## 选择策略\n策略文字',truncated:false}];
 const draw=(text=stages[0].text,live=true)=>render(h(ReasoningDetails,{stages:[{...stages[0],text}],live}),root);
 try{
 await act(async()=>draw());let nodes=root.querySelectorAll<HTMLDetailsElement>('.chat-cot-node');expect(nodes).toHaveLength(2);expect(nodes[0].open).toBe(false);expect(nodes[1].open).toBe(true);
 await act(async()=>nodes[0].querySelector('summary')!.click());expect(nodes[0].open).toBe(true);
 await act(async()=>draw(stages[0].text+'\n## 输出\n更多内容'));nodes=root.querySelectorAll('.chat-cot-node');expect(nodes[0].open).toBe(true);expect(nodes[1].open).toBe(false);expect(nodes[2].open).toBe(true);
 const button=(s:string)=>[...root.querySelectorAll('button')].find(b=>b.textContent===s)!;await act(async()=>button('收起全部').click());expect([...nodes].every(n=>!n.open)).toBe(true);await act(async()=>button('展开全部').click());expect([...nodes].every(n=>n.open)).toBe(true);
 const outer=root.querySelector<HTMLDetailsElement>('.chat-reasoning')!;await act(async()=>draw(stages[0].text,false));expect(outer.open).toBe(true);await act(async()=>outer.querySelector('summary')!.click());expect(outer.open).toBe(false);await act(async()=>draw('## 新内容\n持续更新'));expect(outer.open).toBe(false);
 }finally{render(null,root);root.remove();}
});
