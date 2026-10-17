import {readFileSync,realpathSync} from 'node:fs';import {homedir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';import {FrameDecoder,encodeFrame} from '../src/native-framing.mjs';
const id=process.argv[2];if(!/^[a-p]{32}$/.test(id??''))throw Error('Provide the actual extension ID');
const registration=JSON.parse(readFileSync(join(homedir(),'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.luban.bridge.json'),'utf8'));const origin=`chrome-extension://${id}/`;if(registration.name!=='com.luban.bridge'||registration.allowed_origins.length!==1||registration.allowed_origins[0]!==origin)throw Error('Registration origin mismatch');
const launcher=realpathSync(registration.path);const child=spawn(launcher,[origin],{stdio:['pipe','pipe','pipe']});const decoder=new FrameDecoder();let output,stderr=false;
const timer=setTimeout(()=>{child.kill();},10000);
child.stderr.on('data',()=>{stderr=true;});child.stdout.on('data',chunk=>{for(const reply of decoder.push(chunk)){output=reply;child.stdin.end();}});
child.stdin.write(encodeFrame({protocolVersion:1,requestId:'installed-health-probe',method:'health.get',params:{}}));
try{const code=await new Promise((resolveExit,reject)=>{child.on('error',reject);child.on('exit',resolveExit);});if(code!==0||stderr||!output?.ok||output.data?.service!=='luban-bridge')throw Error('Installed Bridge health failed');console.log(JSON.stringify({passed:true,extensionId:id,launcher,health:output.data,realChromeConnection:false}));}finally{clearTimeout(timer);child.kill();}
