// Explicit installer only: no profile edits or registrations at package/build time.
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';import {homedir} from 'node:os';
if(process.platform!=='darwin')throw Error('macOS only');
const [verb,packagePath]=process.argv.slice(2);if(!['install','uninstall'].includes(verb)||!packagePath)throw Error('Usage: node scripts/install-probe.mjs install|uninstall /absolute/package/path');
const root=realpathSync(resolve(packagePath));const template=JSON.parse(readFileSync(join(root,'host-manifest.template.json'),'utf8'));const expected=join(root,'native-host');
const target=join(homedir(),'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.luban.s0_probe.json');
if(verb==='install'){if(existsSync(target))throw Error('Host already registered; refusing to overwrite');template.path=expected;mkdirSync(join(target,'..'),{recursive:true,mode:0o700});writeFileSync(target,JSON.stringify(template,null,2)+'\n',{mode:0o600,flag:'wx'});}else{const existing=JSON.parse(readFileSync(target));if(existing.path!==expected||existing.name!=='com.luban.s0_probe')throw Error('Registration ownership mismatch');unlinkSync(target);}console.log(JSON.stringify({action:verb,host:target}));
