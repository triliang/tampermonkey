import {spawn} from 'node:child_process';
const nested=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
process.on('message',()=>process.send?.({type:'fixture-ready',pid:nested.pid}));
setInterval(()=>{},1000);
