"""Official HtmlRAG 0.1.1 cleaning, block-tree, BM25 ranking and bounded pruning.
The input is an authorized, sanitized DOM projection, never a URL or executable HTML.
"""
import json, sys, re, time, copy, unicodedata
from html import escape
from importlib.metadata import version
from bs4 import BeautifulSoup
from htmlrag import clean_html, build_block_tree, BM25HTMLPruner

REF = re.compile(r'LUBAN_REF_(obs-[a-zA-Z0-9-]{1,100})')
class CharacterBudget:
    def encode(self, text, **kwargs): return list(text)
    def tokenize(self, text): return list(text)
    def convert_tokens_to_string(self, tokens): return ''.join(tokens)

def tokens(text):
    parts=re.findall(r'[a-z0-9_]+|[\u3400-\u9fff]+', unicodedata.normalize('NFKC',text).lower())
    out=[]
    for part in parts:
        if re.search(r'[\u3400-\u9fff]',part):
            out.extend(part);out.extend(part[i:i+2] for i in range(len(part)-1))
        else: out.append(part)
    return out

pruner=BM25HTMLPruner()
def retrieve(request):
    start=time.monotonic()
    html=request['html'];blocks=request['blocks'];query=request['query']
    if len(html)>24032 or len(blocks)>240 or len(query)>160: raise ValueError('INPUT_LIMIT')
    known={b['id']:b for b in blocks if re.fullmatch(r'obs-[a-zA-Z0-9-]{1,100}',b.get('id',''))}
    cleaned=clean_html(html)
    tree,tree_html=build_block_tree(cleaned,max_node_words=192,zh_char=True)
    if not tree: return {'ids':[],'context':'','blockCount':0,'elapsedMs':round((time.monotonic()-start)*1000)}
    def refs(tag): return [r for r in dict.fromkeys(REF.findall(tag.get_text(' '))) if r in known]
    def contents(ref):
        b=known[ref]
        return ' '.join([b.get('text',''),b.get('accessibleName',''),b.get('context',''),json.dumps(b.get('attributes',{}),ensure_ascii=False)])
    ranked_tree=[]
    for tag,path,leaf in tree:
        content=tag.get_text(' ')+' '+' '.join(contents(ref) for ref in refs(tag))
        # Official BM25 uses whitespace tokens; adapt Chinese text without mutating source HTML.
        scoring=BeautifulSoup('<p>'+escape(' '.join(tokens(content)))+'</p>','html.parser').p
        ranked_tree.append((scoring,path,leaf))
    query_tokens=set(tokens(query))
    ranking=pruner.calculate_block_rankings(' '.join(tokens(query)),tree_html,ranked_tree)
    selected=[];selected_ids=[]
    for i in ranking:
        tag,path,leaf=tree[i]
        relevant=[r for r in refs(tag) if query_tokens.intersection(tokens(contents(r)))]
        if not relevant: continue
        for ref in relevant:
            if ref not in selected_ids: selected_ids.append(ref)
        # Avoid carrying entire large parent subtrees for a bare-text block.
        node=copy.deepcopy(tag)
        if not leaf:
            for child in list(node.find_all(recursive=False)): child.decompose()
        fragment=str(node)
        for ancestor in reversed(path[:-1]): fragment='<'+ancestor+'>'+fragment+'</'+ancestor+'>'
        selected.append(fragment)
        if len(selected)>=4: break
    if not selected: return {'ids':[],'context':'','blockCount':len(tree),'elapsedMs':round((time.monotonic()-start)*1000)}
    candidate=clean_html('<html>'+''.join(selected)+'</html>')
    reduced,reduced_html=build_block_tree(candidate,max_node_words=192,zh_char=True)
    scoring=[]
    for tag,path,leaf in reduced:
        node=BeautifulSoup('<p>'+escape(' '.join(tokens(tag.get_text(' '))))+'</p>','html.parser').p
        scoring.append((node,path,leaf))
    reduced_rank=pruner.calculate_block_rankings(' '.join(tokens(query)),reduced_html,scoring)
    context=pruner.prune_HTML(reduced_html,reduced,reduced_rank,CharacterBudget(),4096)
    retained=set(REF.findall(context))
    ids=[r for r in selected_ids if r in retained][:min(8,request.get('limit',8))]
    # A pruning result that loses all selected references must not invent a target.
    if not ids: raise ValueError('REFERENCES_PRUNED')
    context=REF.sub(lambda m:m.group(0) if m.group(1) in ids else 'CONTEXT_ONLY',context)
    return {'ids':ids,'context':context,'blockCount':len(tree),'elapsedMs':round((time.monotonic()-start)*1000),'budgetUnit':'characters'}

print(json.dumps({'ready':True,'packageVersion':version('htmlrag'),'algorithm':'official-clean-block-tree-bm25-prune'}),flush=True)
for line in sys.stdin:
    try:
        if len(line)>150000: raise ValueError('INPUT_LIMIT')
        request=json.loads(line);result=retrieve(request)
        print(json.dumps({'id':request['id'],'ok':True,**result},ensure_ascii=False),flush=True)
    except Exception:
        print(json.dumps({'id':locals().get('request',{}).get('id'),'ok':False,'reason':'PRUNING_FAILED'}),flush=True)
