// Bounded multilingual lexical retrieval. Scores are evidence ranking, never confidence.
export function lexicalTokens(text){
 const normalized=text.normalize('NFKC').toLowerCase();const tokens=normalized.match(/[a-z0-9_]+|[\p{Script=Han}]+/gu)??[];
 return tokens.flatMap(token=>/\p{Script=Han}/u.test(token)?[...token,...Array.from({length:Math.max(0,token.length-1)},(_,i)=>token.slice(i,i+2))]:[token]);
}
export function lexicalSearch(blocks,query,limit=20){
 const terms=[...new Set(lexicalTokens(query))];if(!terms.length)return [];
 const frequencies=new Map();const docs=blocks.map(block=>{const tokens=lexicalTokens([block.accessibleName,block.text,block.context,block.tag,block.role,...Object.values(block.attributes??{})].filter(Boolean).join(' '));const counts=new Map();for(const token of tokens)counts.set(token,(counts.get(token)??0)+1);for(const token of counts.keys())frequencies.set(token,(frequencies.get(token)??0)+1);return {block,tokens,counts};});
 const average=docs.reduce((n,d)=>n+d.tokens.length,0)/Math.max(docs.length,1)||1;
 return docs.map(({block,tokens,counts},index)=>{let score=0;for(const term of terms){const tf=counts.get(term)??0;if(!tf)continue;const df=frequencies.get(term)??0;const idf=Math.log(1+(docs.length-df+0.5)/(df+0.5));score+=idf*(tf*2.2)/(tf+1.2*(0.25+0.75*tokens.length/average));}if(block.accessibleName?.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase()))score+=4;return {...block,score,index};}).filter(b=>b.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,Math.min(20,Math.max(1,limit))).map(({index,...block})=>block);
}
