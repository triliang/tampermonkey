import {createInterface} from 'node:readline';
let accountCalls=0;
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(!m.id)return;
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='account/read'){accountCalls++;if(process.argv.includes('--routing-retry')&&accountCalls===1)send({id:m.id,error:{code:-32603,message:'fixture routing unavailable'}});else send({id:m.id,result:{account:process.argv.includes('--no-account')?null:{type:'test'}}});}
 if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'test-thread'}}});
 if(m.method==='turn/start'){if(process.argv.includes('--deny-tool'))send({id:'server-request',method:'item/commandExecution/requestApproval',params:{}});send({id:m.id,result:{turn:{id:'test-turn'}}});send({method:'item/agentMessage/delta',params:{delta:'{"code":"console.log(1)"}'}});if(process.argv.includes('--final-message'))send({method:'item/completed',params:{item:{type:'agentMessage',text:'final authoritative message'}}});send({method:'turn/completed',params:{turn:{id:'test-turn',status:'completed'}}});}
});
