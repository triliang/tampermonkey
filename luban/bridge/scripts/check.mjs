import {readdirSync} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
function check(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory()){check(path);continue;}if(!/\.(mjs|js)$/.test(entry.name))continue;const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(r.status!==0)process.exit(1);}}
for(const dir of ['src','scripts','test','probe-extension'])check(dir);console.log('All JS syntax checks passed');
