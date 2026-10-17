import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { FrameDecoder,encodeFrame } from './native-framing.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const allowed=JSON.parse(readFileSync(join(root,'../probe-extension/manifest.json'),'utf8')).key;
// Derive extension ID from the public key, never accept a caller-supplied allowlist.
const {createHash}=await import('node:crypto');
const id=createHash('sha256').update(Buffer.from(allowed,'base64')).digest('hex').slice(0,32).replace(/[0-9a-f]/g,x=>String.fromCharCode(97+parseInt(x,16)));
if(process.argv[2]!==`chrome-extension://${id}/`){process.stderr.write('ORIGIN_DENIED\n');process.exit(1);}
const schema=z.object({protocolVersion:z.literal(1),requestId:z.string().min(1).max(128),method:z.literal('health.ping')}).strict();
const decoder=new FrameDecoder();
process.stdin.on('data',chunk=>{try{for(const value of decoder.push(chunk)){const parsed=schema.safeParse(value);const response=parsed.success?{protocolVersion:1,requestId:parsed.data.requestId,ok:true,data:{service:'luban-s0-native-probe',node:process.version,platform:process.platform,arch:process.arch,pageCapabilities:[]}}:{protocolVersion:1,ok:false,error:{code:'INVALID_REQUEST'}};process.stdout.write(encodeFrame(response));}}catch{process.stderr.write('INVALID_FRAME\n');process.exitCode=1;process.stdin.destroy();}});
process.stdin.on('end',()=>{try{decoder.end();}catch{process.stderr.write('TRUNCATED_FRAME\n');process.exitCode=1;}});
