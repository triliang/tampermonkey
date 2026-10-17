import {createInterface} from 'node:readline';
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(!m.id)return;
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='account/read')send({id:m.id,result:{account:{type:'test'}}});
 if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'test-thread'}}});
 if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'test-turn'}}});send({method:'item/agentMessage/delta',params:{delta:'{"code":"console.log(1)"}'}});send({method:'turn/completed',params:{turn:{id:'test-turn',status:'completed'}}});}
});
