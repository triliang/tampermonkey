import {it,expect,afterAll} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {classifyHarnessMessage} from '../service-worker/services/harness-gateway';
import {wantsDraft,bareActionQuestion,actionChoice,unresolvedReference} from '../../contracts/conversation-intent.mjs';
import {compilePlan} from '../../contracts/script-plan.mjs';
const text=readFileSync(new URL('../../docs/v4.3/47-csdn-prompt-cases-2026-10-28.md',import.meta.url),'utf8');
const rows=text.split('\n').filter(l=>/^\| [CITNARD]\d+ \|/.test(l)).map(l=>l.split('|').slice(1,-1).map(x=>x.trim()));
const ids=[...new Set(rows.map(r=>r[0]))];
const results=[];
it('keeps the full 112-case acceptance corpus in the audit',()=>expect(ids).toHaveLength(112));
for(const row of rows.filter(r=>/^[CIN]/.test(r[0]))){
 const [id]=row;const input=row[id.startsWith('N')?1:2].replace(/^`|`$/g,'');
 it(`${id}: permission and route probe`,()=>{
  const route=classifyHarnessMessage(input,false,false),draft=wantsDraft(input);
  if(/^[IN]/.test(id))expect(draft).toBe(false);
  results.push({id,input,route,draftRequested:draft,deterministicQuestion:bareActionQuestion(input)||actionChoice(input)||unresolvedReference(input),scope:'本地函数探针；未调用模型、浏览器或生成任务'});
 });
}
const unsupported=new Set(['C05','C06','C07','C08','C09','C10','C11','C12','C13','C14','C15','C16','C17','C18','C19','C20','C22','C23','C24']);
for(const row of rows.filter(r=>/^C/.test(r[0]))){
 const id=row[0];it(`${id}: compiler capability boundary`,()=>{
  const action=unsupported.has(id)?({'删除':'remove','替换':'replace','添加':'insert','修改':'modify','统计':'count'}[row[1]]??'multiple'):id==='C26'?'dim':'hide';
  const call=()=>compilePlan({planHash:'audit',action,targetIds:['verified']},{planHash:'audit',action,targets:[{id:'verified',selector:'#verified-fixture'}]});
  if(unsupported.has(id))expect(call).toThrow();else expect(call().grants).toEqual([]);
  results.push({id,compilerSupported:!unsupported.has(id),scope:'隔离夹具编译能力检查；不是线上选择器与业务效果验收'});
 });
}
afterAll(()=>writeFileSync(new URL('../../docs/v4.3/evidence/2026-10-28/computer-use/batch-prompt-probes.json',import.meta.url),JSON.stringify({caseCount:ids.length,probeResults:results},null,2)));
