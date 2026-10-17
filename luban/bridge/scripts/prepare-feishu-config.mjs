// Copy only non-secret S0 identity/Keychain references into the production state.
import {readFileSync,lstatSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';import {join} from 'node:path';import {homedir} from 'node:os';
const [source,tenantKey]=process.argv.slice(2);if(!source||!tenantKey||tenantKey.length>128)throw Error('Usage: node prepare-feishu-config.mjs /private/s0/feishu.json tenantKey');
const stat=lstatSync(source);if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.size>4096)throw Error('CONFIG_UNSAFE');
let config;try{config=JSON.parse(readFileSync(source,'utf8'));}catch{throw Error('CONFIG_INVALID');}
if(!config.credentialRef||config.appSecret||config.credentialRef.account!==config.appId||!/^com\.luban\.s0\.feishu\.[a-f0-9-]+$/.test(config.credentialRef.service)||!/^ou_[a-zA-Z0-9]+$/.test(config.senderOpenId))throw Error('KEYCHAIN_REFERENCE_REQUIRED');
const dir=join(homedir(),'Library/Application Support/Luban/bridge');mkdirSync(dir,{recursive:true,mode:0o700});const target=join(dir,'feishu.json');if(existsSync(target))throw Error('CONFIG_ALREADY_EXISTS');
writeFileSync(target,JSON.stringify({appId:config.appId,senderOpenId:config.senderOpenId,credentialRef:config.credentialRef,tenantKey})+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({prepared:true,secretCopied:false,listenerStarted:false}));
