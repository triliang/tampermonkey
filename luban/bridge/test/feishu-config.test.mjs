import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {loadFeishuConfig} from '../src/feishu-config.mjs';
test('private Feishu configuration rejects unsafe permissions, ambiguity and cross-app references',()=>{const dir=mkdtempSync(join(tmpdir(),'luban-private-config-')),file=join(dir,'feishu.json');try{
 const base={appId:'cli_test',senderOpenId:'ou_self',appSecret:'synthetic-secret'};
 const put=(value)=>{writeFileSync(file,JSON.stringify(value),{mode:0o600});chmodSync(file,0o600);};
 put(base);assert.equal(loadFeishuConfig(file).appId,'cli_test');chmodSync(file,0o644);assert.throws(()=>loadFeishuConfig(file),/CONFIG_PERMISSIONS/);
 put({...base,credentialRef:{service:'com.luban.s0.feishu.abc123',account:'cli_test'}});assert.throws(()=>loadFeishuConfig(file),/FEISHU_CONFIG_INVALID/);
 put({appId:'cli_test',senderOpenId:'ou_self',credentialRef:{service:'com.luban.s0.feishu.abc123',account:'cli_other'}});assert.throws(()=>loadFeishuConfig(file),/FEISHU_CONFIG_INVALID/);
 }finally{rmSync(dir,{recursive:true,force:true});}});
