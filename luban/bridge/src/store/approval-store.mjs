import Database from 'better-sqlite3';
import {z} from 'zod';
const binding=z.object({profileId:z.string().min(1).max(128),browserSession:z.string().min(1).max(128),documentId:z.string().min(1).max(128),navigationEpoch:z.number().int().nonnegative(),workspaceId:z.string().min(1).max(128),draftRevision:z.number().int().nonnegative(),codeHash:z.string().regex(/^[a-f0-9]{64}$/),grantId:z.string().min(1).max(128)}).strict();
const fail=code=>Object.assign(new Error(code),{code});
// This repository accepts only a principal authenticated by the future gateway.
// Caller-supplied JSON must never be treated as an authenticated principal.
export class ApprovalStore {
 constructor(file,{now=()=>Date.now()}={}){this.now=now;this.db=new Database(file);this.db.pragma('busy_timeout=5000');this.db.pragma('journal_mode=WAL');this.db.exec('CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,binding TEXT NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL,receipt TEXT)');}
 close(){this.db.close();}
 create(id,value,{ttlMs=600000}={}){if(typeof id!=='string'||!id.length||id.length>128)throw fail('INVALID_APPROVAL_ID');if(!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>600000)throw fail('INVALID_APPROVAL_TTL');const json=JSON.stringify(binding.parse(value));this.db.prepare("INSERT INTO approvals VALUES(?,?,?,'pending',NULL)").run(id,json,this.now()+ttlMs);}
 get(id){return this.db.prepare('SELECT * FROM approvals WHERE id=?').get(id);}
 consume(id,current,principal){if(principal?.kind!=='extension-ui'||principal.profileId!==current.profileId)throw fail('APPROVAL_UI_REQUIRED');const json=JSON.stringify(binding.parse(current));return this.db.transaction(()=>{const row=this.get(id);if(!row||row.state!=='pending')throw fail('APPROVAL_ALREADY_CONSUMED');if(row.expires_at<=this.now())throw fail('APPROVAL_EXPIRED');if(row.binding!==json)throw fail('APPROVAL_BINDING_CHANGED');this.db.prepare("UPDATE approvals SET state='executing' WHERE id=?").run(id);return {id,binding:JSON.parse(row.binding)};}).immediate();}
 reject(id,principal){return this.db.transaction(()=>{const row=this.get(id);if(!row||row.state!=='pending')throw fail('APPROVAL_ALREADY_CONSUMED');if(principal?.kind!=='extension-ui'||principal.profileId!==JSON.parse(row.binding).profileId)throw fail('APPROVAL_UI_REQUIRED');this.db.prepare("UPDATE approvals SET state='rejected' WHERE id=?").run(id);}).immediate();}
 recordReceipt(id,{outcome,receiptId}){const checked=z.object({outcome:z.enum(['succeeded','failed']),receiptId:z.string().min(1).max(128)}).strict().parse({outcome,receiptId});const result=this.db.prepare("UPDATE approvals SET state=?,receipt=? WHERE id=? AND state IN ('executing','unknown')").run(checked.outcome,checked.receiptId,id);if(result.changes!==1)throw fail('APPROVAL_NOT_EXECUTING');}
 // Called once by the single-instance gateway before accepting requests.
 // An interrupted side effect is never made eligible for execution again.
 recover(){return this.db.prepare("UPDATE approvals SET state='unknown' WHERE state='executing'").run().changes;}
}
