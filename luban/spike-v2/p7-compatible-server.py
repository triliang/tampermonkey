"""P7 本地 Chat Completions 兼容夹具。只绑定回环，不记录请求体或认证信息。"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


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
        if body.get('model') != 'p7-local-test':
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error":{"message":"unknown model"}}')
            return
        if not body.get('stream'):
            response = {'choices': [{'message': {'role': 'assistant', 'content': 'pong'}, 'finish_reason': 'stop'}]}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            return
        analysis = any('最多四个' in str(m.get('content', '')) for m in body.get('messages', []))
        if analysis:
            result = {'suggestions': [{'title': '本地测试标记', 'intent': '在 localhost 测试页的 #result 显示 P7 LOCAL OK，不操作其他内容。'}]}
        else:
            result = {'code': "const el=document.querySelector('#result');if(!el)throw new Error('P7 fixture target missing');el.textContent='P7 LOCAL OK';", 'explanation': '本地兼容夹具固定结果，仅用于 localhost 的传输和版本烟测。', 'selectors': ['#result'], 'gmGrants': [], 'confidence': 1, 'warnings': ['固定测试输出，不代表真实模型能力。']}
        chunk = {'choices': [{'delta': {'content': json.dumps(result, ensure_ascii=False)}, 'finish_reason': None}]}
        final = {'choices': [{'delta': {}, 'finish_reason': 'stop'}]}
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(('data: ' + json.dumps(chunk, ensure_ascii=False) + '\n\ndata: ' + json.dumps(final) + '\n\ndata: [DONE]\n\n').encode())


if __name__ == '__main__':
    print('P7 local compatibility fixture: http://localhost:18889/v1 (model: p7-local-test)', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 18889), Handler).serve_forever()
