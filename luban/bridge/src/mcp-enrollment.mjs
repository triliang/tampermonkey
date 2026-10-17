import {openSync,writeFileSync,closeSync,fsyncSync,mkdirSync,unlinkSync,lstatSync,fstatSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openClient} from './local-daemon.mjs';

export async function enrollMcpClient(file,code,{stateDir=join(homedir(),'Library/Application Support/Luban/bridge')}={}){
  if(!/^[a-f0-9]{64}$/.test(code))throw Object.assign(Error('ENROLLMENT_CODE_INVALID'),{code:'ENROLLMENT_CODE_INVALID'});
  const target=resolve(file);mkdirSync(dirname(target),{recursive:true,mode:0o700});
  const fd=openSync(target,'wx',0o600),inode=fstatSync(fd).ino;let socket,completed=false;
  try{
    const opened=await openClient(stateDir,{enrollmentCode:code});socket=opened.socket;
    writeFileSync(fd,JSON.stringify({schemaVersion:1,...opened.credentials})+'\n');fsyncSync(fd);completed=true;
    return {paired:true,connectionConfig:target};
  }finally{
    socket?.destroy();closeSync(fd);
    if(!completed&&lstatSync(target).ino===inode)unlinkSync(target);
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--connection-config')throw Error('ARGUMENT_INVALID');
    let code='';for await(const chunk of process.stdin){code+=chunk.toString('utf8');if(code.length>128)throw Error('ENROLLMENT_CODE_INVALID');}
    const result=await enrollMcpClient(args[1],code.trim());console.log(JSON.stringify(result));
  }catch(error){const code=['EEXIST','ENROLLMENT_CODE_INVALID'].includes(error.code)?error.code:'MCP_ENROLLMENT_FAILED';process.stderr.write(code+'\n');process.exitCode=1;}
}
