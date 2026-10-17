import {statSync} from 'node:fs';
const fail=code=>Object.assign(new Error(code),{code});
export class SqliteMaintenance {
 constructor(db,{maxBytes=64*1024*1024}={}){
  this.db=db;this.maxBytes=maxBytes;this.memory=db.name===':memory:';
  if(this.memory)return;
  db.pragma('cache_spill=OFF');db.pragma('temp_store=MEMORY');
  const size=db.pragma('page_size',{simple:true});
  // Reserve room for a full dirty-page WAL and its frame headers plus SHM.
  this.maxPages=Math.max(8,Math.floor((maxBytes-65536)/(size*2+24)));
  db.pragma(`max_page_count=${this.maxPages}`);db.pragma('journal_size_limit=0');
 }
 bytes(){if(this.memory)return 0;return ['','-wal','-shm'].reduce((sum,suffix)=>{try{return sum+statSync(this.db.name+suffix).size;}catch(e){if(e.code==='ENOENT')return sum;throw e;}},0);}
 checkpoint(){if(this.memory)return true;return this.db.pragma('wal_checkpoint(TRUNCATE)')[0].busy===0;}
 beforeWrite(){if(this.memory)return;if(!this.checkpoint())throw fail('STORAGE_BUSY');if(this.db.pragma('page_count',{simple:true})>this.maxPages||this.bytes()>this.maxBytes)throw fail('STORAGE_DISK_LIMIT');}
 afterWrite(){this.checkpoint();return this.status();}
 compact(){if(!this.memory){if(!this.checkpoint())throw fail('STORAGE_BUSY');this.db.exec('VACUUM');this.checkpoint();}return this.status();}
 status(){return {physicalBytes:this.bytes(),physicalBudgetBytes:this.maxBytes,overBudget:!this.memory&&(this.bytes()>this.maxBytes||this.db.pragma('page_count',{simple:true})>this.maxPages)};}
}
