import {it,expect} from 'vitest';
import {workspaceStage} from './workspace-controller';
it('主操作由状态投影决定，进行中优先于旧结果',()=>{
 const base={generating:false,stream:'',operation:null,preview:false,receipt:false,draft:false,failed:false} as const;
 expect(workspaceStage(base)).toBe('editing');expect(workspaceStage({...base,receipt:true})).toBe('awaitingEffect');expect(workspaceStage({...base,generating:true,receipt:true})).toBe('generating');expect(workspaceStage({...base,generating:true,stream:'正在修复基础问题'})).toBe('repairing');expect(workspaceStage({...base,operation:'trial'})).toBe('trialRunning');
});
