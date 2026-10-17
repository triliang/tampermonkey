import {writeFileSync,renameSync,chmodSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {loadFeishuConfig,keychainHelper} from '../src/feishu-config.mjs';
const file=process.argv[2];if(!file)throw Error('Provide private config path');
const config=loadFeishuConfig(file);if(config.credentialRef)throw Error('ALREADY_USING_KEYCHAIN');
const raw={appId:config.appId,senderOpenId:config.senderOpenId};
const ref={service:'com.luban.s0.feishu.'+randomUUID(),account:config.appId};
const set=spawnSync(keychainHelper,['set',ref.service,ref.account],{input:config.appSecret,encoding:'utf8',timeout:30000});
if(set.error||set.status!==0)throw Error('KEYCHAIN_MIGRATION_SET_FAILED (original private config retained)');
let committed=false;const temporary=file+'.'+randomUUID()+'.tmp';
try{const get=spawnSync(keychainHelper,['get',ref.service,ref.account],{encoding:'utf8',timeout:30000});if(get.error||get.status!==0||get.stdout!==config.appSecret)throw Error('KEYCHAIN_MIGRATION_VERIFY_FAILED');delete raw.appSecret;raw.credentialRef=ref;writeFileSync(temporary,JSON.stringify(raw,null,2)+'\n',{mode:0o600,flag:'wx'});chmodSync(temporary,0o600);renameSync(temporary,file);committed=true;loadFeishuConfig(file);console.log(JSON.stringify({secretMigrated:true,plaintextRemoved:true,keychainReadVerified:true,privatePermissions:true}));}finally{if(!committed){try{unlinkSync(temporary)}catch{}spawnSync(keychainHelper,['delete',ref.service,ref.account],{timeout:30000});}}
