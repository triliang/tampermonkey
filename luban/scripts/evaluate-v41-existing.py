"""Read explicitly selected Luban Chrome storage for evaluation; never print keys.
Only uncompacted LevelDB logs are supported. Fails closed for SST data.
"""
import struct,json,base64,os,subprocess,argparse
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--profile',required=True,type=Path,help='Existing Chrome profile directory')
parser.add_argument('--extension-id',required=True)
parser.add_argument('--live',action='store_true')
args=parser.parse_args()
if not __import__('re').fullmatch('[a-p]{32}',args.extension_id):parser.error('invalid extension id')
from pathlib import Path

def varint(b,pos):
 n=0
 for shift in range(0,35,7):
  c=b[pos];pos+=1;n|=(c&127)<<shift
  if not c&128:return n,pos
 raise ValueError('invalid varint')
def store(folder):
 p=args.profile/folder/args.extension_id
 if list(p.glob('*.ldb')):raise ValueError('compacted storage requires browser API')
 values={}
 if not p.is_dir() or not list(p.glob('*.log')):raise ValueError('storage logs unavailable')
 for file in sorted(p.glob('*.log')):
  b=file.read_bytes();pos=0;fragments=b''
  while pos+7<=len(b):
   remain=32768-pos%32768
   if remain<7:pos+=remain;continue
   crc,length,typ=struct.unpack_from('<IHB',b,pos);pos+=7
   if typ==0 and length==0:pos+=32768-pos%32768;continue
   part=b[pos:pos+length];pos+=length
   if len(part)!=length:break
   if typ in (1,2):fragments=part
   elif typ in (3,4):fragments+=part
   else:raise ValueError('record type')
   if typ not in (1,4):continue
   batch=fragments
   if len(batch)<12:raise ValueError('batch header')
   count=struct.unpack_from('<I',batch,8)[0];j=12
   for _ in range(count):
    kind=batch[j];j+=1;n,j=varint(batch,j);key=batch[j:j+n].decode();j+=n
    if kind==0:values.pop(key,None)
    elif kind==1:
     n,j=varint(batch,j);value=batch[j:j+n];j+=n;values[key]=json.loads(value)
    else:raise ValueError('batch type')
 return values
local=store('Local Extension Settings');sync=store('Sync Extension Settings')
s=sync['luban:settings'];custom=s.get('customEndpoint',False)
key=base64.b64decode(local['luban:customApiKey' if custom else 'luban:apiKey']).decode()
urls={'onDemand':'https://api.xiaomimimo.com/v1','tokenPlanCn':'https://token-plan-cn.xiaomimimo.com/v1','tokenPlanAms':'https://token-plan-ams.xiaomimimo.com/v1'}
url=s.get('customBaseUrl') if custom else urls['onDemand' if s.get('billing','onDemand')=='onDemand' else s.get('endpoint','tokenPlanCn')]
model=s.get('customModel') if custom else s.get('defaultModel','mimo-v2-flash')
from urllib.parse import urlparse
u=urlparse(url)
if u.scheme!='https' or u.username or u.password or u.query or u.fragment:raise ValueError('unsafe endpoint')
if not isinstance(model,str) or not model.strip() or not key:raise ValueError('incomplete configuration')
print(json.dumps({'source':'existing Chrome Luban settings','model':model,'baseUrl':url,'configured':bool(key),'thinkingEnabled':s.get('thinkingEnabled',True)},ensure_ascii=False),flush=True)
if args.live:
 env={**os.environ,'LUBAN_EVAL_BASE_URL':url,'LUBAN_EVAL_MODEL':model,'LUBAN_EVAL_API_KEY':key,'LUBAN_EVAL_THINKING':str(s.get('thinkingEnabled',True)).lower(),'LUBAN_EVAL_CONFIG_SOURCE':'existing-chrome-storage'}
 raise SystemExit(subprocess.call(['node','scripts/evaluate-v41.mjs','--live'],cwd=Path(__file__).resolve().parents[1],env=env))
