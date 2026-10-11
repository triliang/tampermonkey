import { useEffect, useRef, useState } from 'preact/hooks';
import { highlightAll } from 'microlighter';
import 'microlighter/themes/github.css';

interface CodeBlockProps {
  code: string;
  language?: string;
}

/** 折叠式代码块：默认收起仅显按钮，展开后用 microlighter 做语法高亮（CSS Custom Highlight API，无需额外 DOM 标记）。 */
export function CodeBlock({ code, language = 'javascript' }: CodeBlockProps) {
  const [expanded, setExpanded] = useState(false);
  // highlightAll 用默认选择器 "pre > code" 在 root 的后代中查找——root 必须是 <pre> 的容器，
  // 若直接把 <pre> 自身传作 root，querySelectorAll 不会匹配到它自己的子节点，高亮会静默失效。
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded || !containerRef.current) return;
    document.body.dataset.syntaxTheme = 'github';
    void highlightAll({ root: containerRef.current });
  }, [expanded, code]);

  return (
    <div class="code-block">
      <button type="button" class="code-block-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? '收起代码 ▲' : '展开代码 ▼'}
      </button>
      {expanded ? (
        <div ref={containerRef}>
          <pre class="code">
            <code class={`language-${language}`}>{code}</code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}
