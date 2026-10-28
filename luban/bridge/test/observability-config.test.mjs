import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,chmodSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observabilityEnvironment} from '../src/observability-config.mjs';

test('private tracing config overrides inherited values and reloads without restarting work',()=>{
 const dir=mkdtempSync(join(tmpdir(),'luban-trace-config-')),path=join(dir,'observability.env');
 try{
  assert.deepEqual(observabilityEnvironment(dir,{LUBAN_LANGFUSE_ENABLED:'true',UNRELATED_SECRET:'excluded'}),{LUBAN_LANGFUSE_ENABLED:'true'});
  writeFileSync(path,'LUBAN_LANGFUSE_ENABLED=false\n',{mode:0o600});
  assert.deepEqual(observabilityEnvironment(dir,{LANGFUSE_SECRET_KEY:'old'}),{LUBAN_LANGFUSE_ENABLED:'false'});
  writeFileSync(path,'LUBAN_LANGFUSE_ENABLED=true\nLANGFUSE_BASE_URL=http://127.0.0.1:3033\n');
  assert.equal(observabilityEnvironment(dir).LANGFUSE_BASE_URL,'http://127.0.0.1:3033');
  chmodSync(path,0o644);assert.deepEqual(observabilityEnvironment(dir),{});
  chmodSync(path,0o600);writeFileSync(path,'PATH=untrusted\n');assert.deepEqual(observabilityEnvironment(dir),{});
  unlinkSync(path);const other=join(dir,'other');writeFileSync(other,'LUBAN_LANGFUSE_ENABLED=true\n',{mode:0o600});symlinkSync(other,path);assert.deepEqual(observabilityEnvironment(dir),{});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
