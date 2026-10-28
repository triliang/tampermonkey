import {lstatSync,readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {join} from 'node:path';

export const observabilityKeys=['LUBAN_LANGFUSE_ENABLED','LUBAN_LANGFUSE_INGESTION_VERSION','LANGFUSE_BASE_URL','LANGFUSE_PUBLIC_KEY','LANGFUSE_SECRET_KEY'];

// Read per launch: changing tracing never requires stopping an active task.
export function observabilityEnvironment(dir,environment=process.env){
 const path=join(dir,'observability.env');
 try{
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid()||stat.size>16384)return {};
  const values=parseEnv(readFileSync(path,'utf8'));
  if(Object.keys(values).some(key=>!observabilityKeys.includes(key)))return {};
  return Object.fromEntries(observabilityKeys.filter(key=>values[key]!==undefined).map(key=>[key,values[key]]));
 }catch(error){
  if(error.code!=='ENOENT')return {};
  return Object.fromEntries(observabilityKeys.filter(key=>environment[key]!==undefined).map(key=>[key,environment[key]]));
 }
}
