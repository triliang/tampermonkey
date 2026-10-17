import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';import {homedir} from 'node:os';import {fileURLToPath} from 'node:url';
export function installBridge(verb,packagePath,extensionId,{home=homedir()}={}){
 if(!['install','uninstall'].includes(verb)||!packagePath)throw Error('Usage: ./runtime/node ./install-bridge.mjs install /absolute/package/path <extension-id> | uninstall /absolute/package/path');
 const root=realpathSync(resolve(packagePath));const expected=join(root,'native-host');
 const target=join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.luban.bridge.json');
 if(verb==='install'){
  if(!/^[a-p]{32}$/.test(extensionId??''))throw Error('Invalid extension ID');
  if(existsSync(target))throw Error('Host already registered; refusing to overwrite. Uninstall the previous owned registration first.');
  const info=JSON.parse(readFileSync(join(root,'build-info.json'),'utf8'));if(info.host!=='com.luban.bridge'||info.platform!=='darwin'||info.arch!=='arm64')throw Error('Not a verified Luban Bridge package');
  realpathSync(expected);realpathSync(join(root,'runtime/node'));
  mkdirSync(dirname(target),{recursive:true,mode:0o700});
  writeFileSync(target,JSON.stringify({name:'com.luban.bridge',description:'Luban local Bridge',path:expected,type:'stdio',allowed_origins:[`chrome-extension://${extensionId}/`]},null,2)+'\n',{mode:0o600,flag:'wx'});
 }else{
  const existing=JSON.parse(readFileSync(target,'utf8'));if(existing.path!==expected||existing.name!=='com.luban.bridge')throw Error('Registration ownership mismatch');unlinkSync(target);
 }
 return {action:verb,host:target};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.platform!=='darwin')throw Error('macOS only');
 console.log(JSON.stringify(installBridge(...process.argv.slice(2))));
}
