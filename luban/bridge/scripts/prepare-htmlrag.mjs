import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const root=existsSync(fileURLToPath(new URL('./requirements-htmlrag.lock',import.meta.url)))?fileURLToPath(new URL('.',import.meta.url)):fileURLToPath(new URL('..',import.meta.url));
const runtime=existsSync(resolve(root,'runtime/node'))?resolve(root,'../../.local/htmlrag-venv'):resolve(root,'.local/htmlrag-venv');
for(const args of [['venv','--python','python3.12',runtime],['pip','sync','--python',resolve(runtime,'bin/python'),resolve(root,'requirements-htmlrag.lock')]]){const result=spawnSync('uv',args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
console.log('Official HtmlRAG runtime installed locally. Enable with htmlrag.json mode htmlrag-bm25 in the Bridge state directory. No model weights downloaded.');
