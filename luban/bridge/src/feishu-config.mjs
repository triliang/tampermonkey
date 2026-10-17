import {readFileSync,lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {existsSync} from 'node:fs';
const packagedHelper=fileURLToPath(new URL('../runtime/keychain-secret',import.meta.url));
export const keychainHelper=existsSync(packagedHelper)?packagedHelper:fileURLToPath(new URL('../.local/keychain-secret',import.meta.url));
export function loadFeishuConfig(file,{allowUnbound=false,requireKeychain=false,requireTenant=false}={}){
 const stat=lstatSync(file);if(!stat.isFile()||stat.uid!==process.getuid()||stat.size>4096||(stat.mode&0o077))throw Error('CONFIG_PERMISSIONS: chmod 600 config');
 let config;
 try{config=z.object({appId:z.string().min(1),tenantKey:z.string().min(1).max(128).optional(),senderOpenId:allowUnbound?z.string().optional():z.string().min(1),appSecret:z.string().min(1).optional(),credentialRef:z.object({service:z.string().regex(/^com\.luban\.s0\.feishu\.[a-f0-9-]+$/),account:z.string().min(1)}).strict().optional()}).strict().parse(JSON.parse(readFileSync(file,'utf8')));if(Number(!!config.appSecret)+Number(!!config.credentialRef)!==1)throw Error();if(config.credentialRef&&config.credentialRef.account!==config.appId)throw Error();}catch{throw Error('FEISHU_CONFIG_INVALID (contents suppressed)');}
 if(requireKeychain&&!config.credentialRef||requireTenant&&!config.tenantKey)throw Error('FEISHU_CONFIG_REQUIRES_KEYCHAIN_AND_TENANT');
 if(config.credentialRef){const r=spawnSync(keychainHelper,['get',config.credentialRef.service,config.credentialRef.account],{encoding:'utf8',timeout:30000,maxBuffer:16384});if(r.error||r.status!==0||!r.stdout)throw Error('KEYCHAIN_SECRET_UNAVAILABLE (no plaintext fallback)');config.appSecret=r.stdout;}
 return config;
}
