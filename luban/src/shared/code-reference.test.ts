import {it,expect} from 'vitest';
import {createReference,lineLabel,validReference} from './code-reference';
import type {ScriptVersion} from './v2-types';
const version={versionId:'v1',code:'const x=1;\nconsole.log(x);\n// end',grants:[],runAt:'document-end'} as unknown as ScriptVersion;
it('引用冻结准确的排序行、来源与指纹，非连续行明确显示',async()=>{
 const ref=await createReference('ws',version,'脚本',[3,1,1]);expect(ref.lines).toEqual([1,3]);expect(ref.text).toBe('L1: const x=1;\nL3: // end');expect(ref.hash).toHaveLength(64);expect(lineLabel([1,2,3,5,7,8])).toBe('L1–L3, L5, L7–L8');expect(validReference(ref,'other')).toBe(false);
});
it('拒绝越界、空选择、超过行数或字节预算的引用',async()=>{
 await expect(createReference('ws',version,'脚本',[4])).rejects.toThrow();await expect(createReference('ws',version,'脚本',[])).rejects.toThrow();await expect(createReference('ws',{...version,code:'x\n'.repeat(210)},'脚本',Array.from({length:201},(_,i)=>i+1))).rejects.toThrow();await expect(createReference('ws',{...version,code:'中'.repeat(12000)},'脚本',[1])).rejects.toThrow();
});
