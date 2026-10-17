import {randomUUID} from 'node:crypto';import {protocolError} from './protocol.mjs';
export class ChannelStore{
 constructor(tasks){this.tasks=tasks;this.db=tasks.db;this.db.exec(`CREATE TABLE IF NOT EXISTS channel_inbox(id TEXT PRIMARY KEY,event_id TEXT UNIQUE NOT NULL,message_id TEXT UNIQUE NOT NULL,profile_id TEXT NOT NULL,intent TEXT NOT NULL,state TEXT NOT NULL,task_id TEXT,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_outbox(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL,message_id TEXT,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS channel_bindings(profile_id TEXT NOT NULL,identity TEXT NOT NULL,client_id TEXT NOT NULL,PRIMARY KEY(profile_id,identity));`);
 this.db.prepare("UPDATE channel_outbox SET state='unknown' WHERE state='sending'").run();this.db.prepare("UPDATE channel_inbox SET state='interrupted' WHERE state IN ('queued','running')").run();}
 receive({eventId,messageId,profileId,intent}){return this.tasks.mutate(()=>{if(this.db.prepare('SELECT 1 FROM channel_inbox WHERE event_id=? OR message_id=?').get(eventId,messageId))return null;const id=randomUUID();this.db.prepare('INSERT INTO channel_inbox VALUES(?,?,?,?,?,?,NULL,?)').run(id,eventId,messageId,profileId,intent,'queued',Date.now());return this.inbox(id);});}
 inbox(id){return this.db.prepare('SELECT * FROM channel_inbox WHERE id=?').get(id);}
 update(id,state,taskId){this.tasks.mutate(()=>this.db.prepare('UPDATE channel_inbox SET state=?,task_id=COALESCE(?,task_id) WHERE id=?').run(state,taskId??null,id));}
 preview(profileId,body,state='draft'){if(typeof body!=='string'||!body.trim()||Buffer.byteLength(body)>3000)throw protocolError('DELIVERY_BODY_INVALID');return this.tasks.mutate(()=>{const id=randomUUID();this.db.prepare('INSERT INTO channel_outbox VALUES(?,?,?,?,NULL,?)').run(id,profileId,body,state,Date.now());return this.delivery(profileId,id);});}
 delivery(profileId,id){const row=this.db.prepare('SELECT * FROM channel_outbox WHERE id=? AND profile_id=?').get(id,profileId);if(!row)throw protocolError('DELIVERY_MISSING');return row;}
 transition(profileId,id,from,to,messageId=null){return this.tasks.mutate(()=>{this.delivery(profileId,id);if(this.db.prepare('UPDATE channel_outbox SET state=?,message_id=COALESCE(?,message_id) WHERE id=? AND profile_id=? AND state=?').run(to,messageId,id,profileId,from).changes!==1)throw protocolError('DELIVERY_STALE');return this.delivery(profileId,id);});}
 list(profileId){return {inbox:this.db.prepare('SELECT id,state,task_id,created_at FROM channel_inbox WHERE profile_id=? ORDER BY created_at DESC LIMIT 30').all(profileId),deliveries:this.db.prepare('SELECT * FROM channel_outbox WHERE profile_id=? ORDER BY created_at DESC LIMIT 30').all(profileId)};}
}
