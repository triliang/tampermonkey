// S0-only probe: creates and removes its own temporary database, never user data.
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'luban-stable-sqlite-')),file=join(dir,'probe.sqlite');
let db;
try {
  db=new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE inbox(app TEXT NOT NULL,message TEXT NOT NULL,UNIQUE(app,message))');
  const insert=db.prepare('INSERT INTO inbox VALUES (?,?)');
  insert.run('probe','message-1');
  assert.throws(()=>insert.run('probe','message-1'),{code:'SQLITE_CONSTRAINT_UNIQUE'});
  const rollback=db.transaction(()=>{insert.run('probe','message-2');throw Error('INTENTIONAL_ROLLBACK');});
  assert.throws(rollback,/INTENTIONAL_ROLLBACK/);
  db.close();db=new Database(file);
  assert.equal(db.prepare('SELECT count(*) AS n FROM inbox').get().n,1);
  console.log(JSON.stringify({check:'better-sqlite3',driver:'13.0.3',sqlite:db.prepare('SELECT sqlite_version() AS version').get().version,node:process.version,arch:process.arch,persistence:true,uniqueness:true,rollback:true}));
} finally {db?.close();rmSync(dir,{recursive:true,force:true});}
