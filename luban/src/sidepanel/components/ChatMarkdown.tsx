import type {ComponentChildren} from 'preact';
export function Highlight({code}:{code:string}){const pattern=/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|function|return|if|throw|new|true|false|await|async|document|window)\b|\b(\d+(?:\.\d+)?)\b/g;const out:ComponentChildren[]=[];let offset=0;for(const m of code.matchAll(pattern)){out.push(code.slice(offset,m.index),<span class={'chat-token-'+(m[1]?'comment':m[2]?'string':m[3]?'keyword':'number')}>{m[0]}</span>);offset=m.index!+m[0].length;}out.push(code.slice(offset));return <>{out}</>;}
function inline(text:string):ComponentChildren{const result:ComponentChildren[]=[];const pattern=/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g;let offset=0;for(const m of text.matchAll(pattern)){result.push(text.slice(offset,m.index));const s=m[0];if(s.startsWith('`'))result.push(<code>{s.slice(1,-1)}</code>);else if(s.startsWith('**'))result.push(<strong>{s.slice(2,-2)}</strong>);else{const link=s.match(/^\[([^\]]+)\]\((.+)\)$/)!;result.push(/^https?:\/\//i.test(link[2])?<a href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>:link[1]);}offset=m.index!+s.length;}result.push(text.slice(offset));return result;}
function tableCells(line:string):string[]{
 const cells:string[]=[];let cell='',code=false;const row=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'');
 for(let i=0;i<row.length;i++){const c=row[i];if(c==='\\'&&row[i+1]==='|'){cell+='|';i++;}else if(c==='`'){code=!code;cell+=c;}else if(c==='|'&&!code){cells.push(cell.trim());cell='';}else cell+=c;}cells.push(cell.trim());return cells;
}
function tableAlignment(line:string,columns:number){const cells=tableCells(line);return cells.length===columns&&cells.every(s=>/^:?-{3,}:?$/.test(s))?cells.map(s=>s.startsWith(':')&&s.endsWith(':')?'center':s.endsWith(':')?'right':'left'):null;}
export function ChatMarkdown({text}:{text:string}){
 const blocks:ComponentChildren[]=[];let fence=false,code:string[]=[],list:Array<{text:string;number?:number}>=[];
 const flush=()=>{if(list.length){blocks.push(list[0].number!==undefined?<ol>{list.map(s=><li value={s.number}>{inline(s.text)}</li>)}</ol>:<ul>{list.map(s=><li>{inline(s.text)}</li>)}</ul>);list=[];}};
 const lines=text.split('\n');
 for(let i=0;i<lines.length;i++){const line=lines[i];
  if(line.startsWith('```')){flush();if(fence){blocks.push(<pre><code><Highlight code={code.join('\n')}/></code></pre>);code=[];}fence=!fence;continue;}
  if(fence){code.push(line);continue;}
  const header=tableCells(line),alignment=line.includes('|')&&i+1<lines.length?tableAlignment(lines[i+1],header.length):null;
  if(alignment){flush();i++;const rows:string[][]=[];while(i+1<lines.length&&lines[i+1].trim()&&lines[i+1].includes('|')&&!lines[i+1].startsWith('```'))rows.push(tableCells(lines[++i]));blocks.push(<div class="chat-table-scroll" role="region" aria-label="回复表格" tabIndex={0}><table><thead><tr>{header.map((cell,column)=><th scope="col" style={{textAlign:alignment[column]}}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map(row=><tr>{header.map((_,column)=><td style={{textAlign:alignment[column]}}>{inline(row[column]??'')}</td>)}</tr>)}</tbody></table></div>);continue;}
  if(/^[-*] |^\d+\. /.test(line)){const number=/^(\d+)\. /.exec(line);if(list.length&&((list[0].number!==undefined)!==!!number))flush();list.push({text:line.replace(/^[-*] |^\d+\. /,''),...(number?{number:Number(number[1])}:{})});continue;}flush();
  if(/^#{1,4} /.test(line))blocks.push(<h3>{inline(line.replace(/^#+ /,''))}</h3>);else if(line.startsWith('> '))blocks.push(<blockquote>{inline(line.slice(2))}</blockquote>);else if(line.trim())blocks.push(<p>{inline(line)}</p>);
 }flush();if(fence)blocks.push(<pre><code><Highlight code={code.join('\n')}/></code></pre>);return <div class="chat-markdown">{blocks}</div>;
}
