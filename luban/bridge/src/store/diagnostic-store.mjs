import Database from 'better-sqlite3';import {z} from 'zod';import {SqliteMaintenance} from './sqlite-maintenance.mjs';
const event=z.object({component:z.enum(['native','ipc','task','storage','mcp','codex','feishu']),code:z.enum(['CONNECTED','DISCONNECTED','PROTOCOL_REJECTED','AUTH_REJECTED','TASK_FAILED','STORAGE_LIMIT','RECOVERY_REQUIRED']),level:z.enum(['info','warn','error'])}).strict();
export class DiagnosticStore {
 constructor(file,{now=()=>Date.now(),maxBytes=16*1024*1024}={}){this.now=now;this.db=new Database(file);this.db.pragma('journal_mode=WAL');this.db.pragma('busy_timeout=5000');this.disk=new SqliteMaintenance(this.db,{maxBytes});this.db.exec('CREATE TABLE IF NOT EXISTS diagnostics(id INTEGER PRIMARY KEY,json TEXT NOT NULL,created_at INTEGER NOT NULL)');this.maxRows=Math.max(1,Math.floor(maxBytes/1024));this.disk.afterWrite();}
 close(){this.db.close();}
 add(raw){const value=event.parse(raw);this.disk.beforeWrite();this.db.transaction(()=>{this.db.prepare('INSERT INTO diagnostics(json,created_at) VALUES(?,?)').run(JSON.stringify(value),this.now());this.db.prepare('DELETE FROM diagnostics WHERE id NOT IN (SELECT id FROM diagnostics ORDER BY id DESC LIMIT ?)').run(this.maxRows);})();this.disk.afterWrite();}
 maintain(){this.disk.beforeWrite();const removed=this.db.prepare('DELETE FROM diagnostics WHERE created_at<?').run(this.now()-7*86400000).changes;return {removed,...this.disk.compact()};}
 export(){return {schemaVersion:1,retentionDays:7,...this.disk.status(),events:this.db.prepare('SELECT json,created_at FROM diagnostics WHERE created_at>=? ORDER BY id DESC LIMIT 100').all(this.now()-7*86400000).map(row=>({...JSON.parse(row.json),at:row.created_at}))};}
}
