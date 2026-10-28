import {randomBytes} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync,chmodSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=join(root,'.local/langfuse');
const action=process.argv[2]??'prepare';if(!['prepare','up','status','down'].includes(action))throw Error('Use prepare, up, status or down');
mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
const envFile=join(dir,'.env'),composeFile=join(dir,'compose.json');
if(!existsSync(envFile)){
 const secret=()=>randomBytes(32).toString('hex');const publicKey='pk-lf-'+secret(),secretKey='sk-lf-'+secret();
 const values={POSTGRES_PASSWORD:secret(),REDIS_AUTH:secret(),CLICKHOUSE_PASSWORD:secret(),SALT:secret(),ENCRYPTION_KEY:secret(),NEXTAUTH_SECRET:secret(),MINIO_ROOT_USER:'luban',MINIO_ROOT_PASSWORD:secret(),LANGFUSE_INIT_ORG_ID:'luban-local',LANGFUSE_INIT_ORG_NAME:'Luban Local',LANGFUSE_INIT_PROJECT_ID:'luban',LANGFUSE_INIT_PROJECT_NAME:'Luban',LANGFUSE_INIT_PROJECT_PUBLIC_KEY:publicKey,LANGFUSE_INIT_PROJECT_SECRET_KEY:secretKey,LANGFUSE_INIT_USER_EMAIL:'admin@luban.local',LANGFUSE_INIT_USER_NAME:'Luban Local Admin',LANGFUSE_INIT_USER_PASSWORD:secret()};
 writeFileSync(envFile,Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
 writeFileSync(join(dir,'bridge.env'),['LUBAN_LANGFUSE_ENABLED=true','LUBAN_LANGFUSE_INGESTION_VERSION=4','LANGFUSE_BASE_URL=http://127.0.0.1:3033','LANGFUSE_PUBLIC_KEY='+publicKey,'LANGFUSE_SECRET_KEY='+secretKey].join('\n')+'\n',{mode:0o600,flag:'wx'});
}
const required=name=>'${'+name+':?Run langfuse-local.mjs prepare}';
const common={NEXTAUTH_URL:'http://127.0.0.1:3033',DATABASE_URL:'postgresql://postgres:'+required('POSTGRES_PASSWORD')+'@postgres:5432/postgres',SALT:required('SALT'),ENCRYPTION_KEY:required('ENCRYPTION_KEY'),TELEMETRY_ENABLED:'false',CLICKHOUSE_MIGRATION_URL:'clickhouse://clickhouse:9000',CLICKHOUSE_URL:'http://clickhouse:8123',CLICKHOUSE_USER:'clickhouse',CLICKHOUSE_PASSWORD:required('CLICKHOUSE_PASSWORD'),CLICKHOUSE_CLUSTER_ENABLED:'false',REDIS_HOST:'redis',REDIS_PORT:'6379',REDIS_AUTH:required('REDIS_AUTH'),LANGFUSE_S3_EVENT_UPLOAD_BUCKET:'langfuse',LANGFUSE_S3_EVENT_UPLOAD_REGION:'auto',LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID:required('MINIO_ROOT_USER'),LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY:required('MINIO_ROOT_PASSWORD'),LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT:'http://minio:9000',LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE:'true',LANGFUSE_S3_MEDIA_UPLOAD_BUCKET:'langfuse',LANGFUSE_S3_MEDIA_UPLOAD_REGION:'auto',LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID:required('MINIO_ROOT_USER'),LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY:required('MINIO_ROOT_PASSWORD'),LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT:'http://minio:9000',LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE:'true'};
const logging={driver:'json-file',options:{'max-size':'10m','max-file':'3'}};
const base={restart:'unless-stopped',logging};
const healthy=test=>({test,interval:'5s',timeout:'5s',retries:30,start_period:'10s'});
const dependencies=Object.fromEntries(['postgres','redis','clickhouse','minio'].map(name=>[name,{condition:'service_healthy'}]));
const init=Object.fromEntries(['ORG_ID','ORG_NAME','PROJECT_ID','PROJECT_NAME','PROJECT_PUBLIC_KEY','PROJECT_SECRET_KEY','USER_EMAIL','USER_NAME','USER_PASSWORD'].map(name=>['LANGFUSE_INIT_'+name,required('LANGFUSE_INIT_'+name)]));
const compose={name:'luban-langfuse',services:{
 postgres:{...base,image:'docker.io/postgres:17',environment:{POSTGRES_USER:'postgres',POSTGRES_PASSWORD:required('POSTGRES_PASSWORD'),POSTGRES_DB:'postgres'},volumes:['postgres_data:/var/lib/postgresql/data'],healthcheck:healthy(['CMD-SHELL','pg_isready -U postgres'])},
 redis:{...base,image:'docker.io/redis:7',environment:{REDISCLI_AUTH:required('REDIS_AUTH')},command:['redis-server','--requirepass',required('REDIS_AUTH'),'--maxmemory-policy','noeviction'],volumes:['redis_data:/data'],healthcheck:healthy(['CMD','redis-cli','ping'])},
 clickhouse:{...base,image:'docker.io/clickhouse/clickhouse-server:25.12',user:'101:101',environment:{CLICKHOUSE_DB:'default',CLICKHOUSE_USER:'clickhouse',CLICKHOUSE_PASSWORD:required('CLICKHOUSE_PASSWORD')},volumes:['clickhouse_data:/var/lib/clickhouse','clickhouse_logs:/var/log/clickhouse-server'],healthcheck:healthy(['CMD-SHELL','wget --no-verbose --tries=1 --spider http://localhost:8123/ping || exit 1'])},
 minio:{...base,image:'cgr.dev/chainguard/minio:latest',entrypoint:'sh',command:['-c','mkdir -p /data/langfuse && minio server --address ":9000" /data'],environment:{MINIO_ROOT_USER:required('MINIO_ROOT_USER'),MINIO_ROOT_PASSWORD:required('MINIO_ROOT_PASSWORD')},ports:['127.0.0.1:9093:9000'],volumes:['minio_data:/data'],healthcheck:healthy(['CMD','mc','ready','local'])},
 'langfuse-worker':{...base,image:'docker.langfuse.com/langfuse/langfuse-worker:4',depends_on:dependencies,environment:common},
 'langfuse-web':{...base,image:'docker.langfuse.com/langfuse/langfuse:4',depends_on:dependencies,ports:['127.0.0.1:3033:3000'],environment:{...common,...init,NEXTAUTH_SECRET:required('NEXTAUTH_SECRET'),LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT:'http://127.0.0.1:9093',LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT:'http://minio:9000'}},
},volumes:Object.fromEntries(['postgres_data','redis_data','clickhouse_data','clickhouse_logs','minio_data'].map(name=>[name,{}]))};
writeFileSync(composeFile,JSON.stringify(compose,null,2)+'\n',{mode:0o600});
if(action==='prepare'){console.log('Prepared private configuration at '+dir);process.exit(0);}
const docker=process.platform==='darwin'&&existsSync('/Applications/Docker.app/Contents/Resources/bin/docker')?'/Applications/Docker.app/Contents/Resources/bin/docker':'docker';
const ready=spawnSync(docker,['info'],{stdio:'ignore'});if(ready.error||ready.status!==0){console.error('Docker is unavailable. Install/start Docker Desktop, then retry. Configuration is preserved.');process.exit(1);}
const prefix=['compose','--env-file',envFile,'-f',composeFile];const args=action==='up'?['up','-d']:action==='down'?['down']:['ps'];
const check=spawnSync(docker,[...prefix,'config','--quiet'],{stdio:'inherit'});if(check.status!==0)process.exit(check.status??1);
const result=spawnSync(docker,[...prefix,...args],{stdio:'inherit'});process.exit(result.status??1);
