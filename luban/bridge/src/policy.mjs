// Application budgets: changes require protocol/retention tests and review.
import contract from './protocol-contract.json' with {type:'json'};
export const POLICY = Object.freeze({protocolVersion:contract.protocolVersion,nativeFrameBytes:contract.nativeFrameBytes,codeBytes:256*1024,
  taskDays:30,diagnosticDays:7,dedupeDays:30,taskDatabaseBytes:64*1024*1024,
  diagnosticBytes:16*1024*1024,eventBytes:32*1024,approvalMinutes:10});
export function mayPruneTask(task, now=Date.now()) {
  return ['completed','failed','cancelled'].includes(task.state) && task.operationResolved===true
    && !['pending','sending','unknown','failed'].includes(task.deliveryState)
    && task.updatedAt < now-POLICY.taskDays*86400000;
}
