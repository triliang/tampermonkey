"""V2.1 受控响应夹具；仅回环监听，不记录认证或正文，不代表真实模型质量。"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GOOD = "const el=document.querySelector('#result');if(!el)throw new Error('target missing');el.textContent='V21 READY';"
MODELS = {'v21-good', 'v21-undefined', 'v21-scopechange', 'v21-truncated', 'v21-format'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        if self.path != '/v1/chat/completions':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2_000_000:
                self.send_error(413)
                return
            body = json.loads(self.rfile.read(length))
        except (ValueError, TypeError):
            self.send_error(400)
            return
        model = body.get('model')
        if model not in MODELS:
            self.send_error(400, 'Unknown fixture model')
            return
        if not body.get('stream'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"choices":[{"message":{"content":"pong"},"finish_reason":"stop"}]}')
            return
        last = str(body.get('messages', [{}])[-1].get('content', ''))
        repairing = '仅修正以下基础错误' in last
        format_retry = '本次必须只返回完整的合法 JSON' in last
        code = GOOD
        if model in {'v21-undefined', 'v21-scopechange'}:
            code = ('n;\n' + GOOD) if not repairing else (GOOD if model == 'v21-undefined' else GOOD.replace('V21 READY', 'CHANGED SCOPE'))
        if model == 'v21-format' and format_retry:
            code = 'n;\n' + GOOD
        result = {'code': code, 'explanation': '受控本地测试输出。', 'selectors': ['#result'], 'gmGrants': [], 'confidence': 1, 'warnings': ['固定夹具输出，不代表真实模型质量。']}
        content = 'broken JSON' if model == 'v21-format' and not format_retry else json.dumps(result, ensure_ascii=False)
        finish = 'length' if model == 'v21-truncated' else 'stop'
        chunks = [{'choices': [{'delta': {'content': content}, 'finish_reason': None}]}, {'choices': [{'delta': {}, 'finish_reason': finish}]}]
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        for chunk in chunks:
            self.wfile.write(('data: ' + json.dumps(chunk, ensure_ascii=False) + '\n\n').encode())
        self.wfile.write(b'data: [DONE]\n\n')


if __name__ == '__main__':
    print('V2.1 fixture: http://localhost:18921/v1; models: ' + ', '.join(sorted(MODELS)), flush=True)
    ThreadingHTTPServer(('127.0.0.1', 18921), Handler).serve_forever()
