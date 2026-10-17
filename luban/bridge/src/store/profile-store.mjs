import Database from 'better-sqlite3';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {credentialsSchema,protocolError} from '../protocol.mjs';
const digest=token=>createHash('sha256').update(token).digest();
export class ProfileStore {
 constructor(file){this.db=new Database(file);this.db.pragma('busy_timeout=5000');this.db.pragma('journal_mode=WAL');this.db.exec('CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,extension_id TEXT NOT NULL,token_hash BLOB NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS profile_pages(profile_id TEXT PRIMARY KEY,json TEXT NOT NULL)');}
 close(){this.db.close();}
 pair(extensionId){if(!/^[a-p]{32}$/.test(extensionId))throw protocolError('ORIGIN_FORBIDDEN');const profileId=randomUUID(),token=randomBytes(32).toString('hex');this.db.prepare('INSERT INTO profiles VALUES(?,?,?,0)').run(profileId,extensionId,digest(token));return {profileId,token};}
 authenticate(extensionId,raw){const credentials=credentialsSchema.parse(raw);const row=this.db.prepare('SELECT * FROM profiles WHERE id=?').get(credentials.profileId);if(!row||row.revoked||row.extension_id!==extensionId||!timingSafeEqual(row.token_hash,digest(credentials.token)))throw protocolError('PAIRING_REQUIRED');return {kind:'extension',profileId:row.id,extensionId};}
 revoke(principal){this.db.transaction(()=>{this.db.prepare('UPDATE profiles SET revoked=1 WHERE id=? AND extension_id=?').run(principal.profileId,principal.extensionId);this.clearPages(principal.profileId);})();}
 syncPages(profileId,pages){const previous=this.pages(profileId);const mapped=pages.map(page=>({...page,...(page.workspaceId&&page.capabilities?.includes('tool.read')?{toolRef:previous.find(old=>old.pageRef===page.pageRef&&old.workspaceId===page.workspaceId)?.toolRef??randomUUID()}:{})}));this.db.prepare('INSERT INTO profile_pages VALUES(?,?) ON CONFLICT(profile_id) DO UPDATE SET json=excluded.json').run(profileId,JSON.stringify(mapped));}
 pages(profileId){const row=this.db.prepare('SELECT json FROM profile_pages WHERE profile_id=?').get(profileId);return row?JSON.parse(row.json):[];}
 clearPages(profileId){this.db.prepare('DELETE FROM profile_pages WHERE profile_id=?').run(profileId);}
 resetPages(){this.db.prepare('DELETE FROM profile_pages').run();}
}
