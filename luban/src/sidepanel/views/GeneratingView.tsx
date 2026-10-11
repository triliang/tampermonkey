import { useEffect, useState } from 'preact/hooks';
import { STRINGS } from '../../shared/i18n-strings';
import { Button } from '../components/Button';

interface GeneratingViewProps {
  streamContent: string;
  startTime: number;
  onCancel: () => void;
}

export function GeneratingView({ streamContent, startTime, onCancel }: GeneratingViewProps) {
  const s = STRINGS.panel.generating;
  // 用自身的 setInterval 驱动「已用时」每秒刷新，不依赖 PROGRESS 消息触发重渲染——
  // 否则模型两次增量输出之间稍有停顿（大 prompt/网络抖动很常见），计时会看起来"卡死"，
  // 用户无法分辨是真的卡住还是仍在正常处理。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, Math.round((now - startTime) / 1000));
  return (
    <section class="view">
      <h2>{s.heading}</h2>
      <p class="hint">已用时 {elapsed}s</p>
      <pre class="stream">{streamContent || '…'}</pre>
      <Button label={s.cancel} variant="danger" onClick={onCancel} />
    </section>
  );
}
