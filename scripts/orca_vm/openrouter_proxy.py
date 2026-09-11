#!/usr/bin/env python3
"""
OpenRouter SSE-Normalizing Proxy for reasoning models (e.g. Gemini 3.7 Flash).

Sits between ES's openai inference service and OpenRouter. Handles three problems:

1. REQUEST: ES forwards the 'reasoning' field from unified completion API to
   OpenRouter. Gemini 3.7 Flash REQUIRES reasoning and rejects reasoning_effort:'none'
   with 400 "Reasoning is mandatory for this endpoint and cannot be disabled."
   → Strip 'reasoning' from request body, add max_tokens=16000 for reasoning budget.

2. RESPONSE: OpenRouter's SSE stream includes 'reasoning' and 'reasoning_content'
   fields in delta objects. ES's OpenAiUnifiedStreamingProcessor can't parse them
   → "[chat_completion_chunk] failed to parse field [choices]"
   → Strip reasoning fields from SSE response chunks, ensure 'content' exists.

3. NON-STANDARD FIELDS: OpenRouter sends 'native_finish_reason', 'reasoning_tokens',
   'cached_tokens' that ES doesn't understand → strip from response.

Usage:
  python3 openrouter-proxy.py [--port 8088]

Then create ES inference endpoint pointing at the proxy:
  curl -X PUT "http://elastic:changeme@localhost:9220/_inference/chat_completion/openrouter-gemini-3-7-flash" \
    -H "Content-Type: application/json" \
    -d '{"service":"openai","service_settings":{"model_id":"google/gemini-3.7-flash","url":"http://localhost:8088","api_key":"<OPENROUTER_KEY>"}}'

Verification:
  # Check proxy is running
  curl -s http://localhost:8088/  # 404 for GET, handles POST

  # Check ES inference endpoint
  curl -s "http://elastic:changeme@localhost:9220/_inference/chat_completion/openrouter-gemini-3-7-flash"

  # Check eval logs for success
  grep -E "passed|Evaluator|EVAL_EXIT" /tmp/eval-*.log
"""

import http.server
import json
import ssl
import urllib.request
import urllib.error
import sys
import os

# Upstream is configurable so non-openrouter routes (selfhost cells, omniroute
# judge combos) reuse this proxy: run_model.sh exports PROXY_UPSTREAM before
# launching. Import-time read is correct — the env prefix sits on the launch
# line itself. Default keeps openrouter-* candidates unchanged.
TARGET = os.environ.get("PROXY_UPSTREAM") or "https://openrouter.ai/api/v1"
LISTEN_PORT = 8088


class OpenRouterProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
        except:
            data = {}
        
        # Gemini 3.7 Flash REQUIRES reasoning — can't send reasoning_effort=none (400)
        # Strip ES unified 'reasoning' field that OpenRouter doesn't understand
        if 'reasoning' in data:
            del data['reasoning']
            print(f"[proxy] Stripped 'reasoning' field from request", flush=True)
        # Ensure max_tokens is high enough so reasoning doesn't consume all output
        if 'chat/completions' in self.path or 'chat_completion' in self.path or self.path == '/':
            if 'max_tokens' not in data and 'max_completion_tokens' not in data:
                data['max_tokens'] = 16000
                print(f"[proxy] Added max_tokens=16000 to request", flush=True)
        
        modified_body = json.dumps(data).encode()
        
        # Forward to OpenRouter - map root path to /chat/completions
        if self.path == '/' or self.path == '':
            url = TARGET + '/chat/completions'
        else:
            url = TARGET + self.path
        req = urllib.request.Request(url, data=modified_body, method='POST')
        
        # Copy headers
        for key, val in self.headers.items():
            if key.lower() not in ('host', 'content-length', 'accept-encoding'):
                req.add_header(key, val)
        req.add_header('Content-Length', str(len(modified_body)))
        
        try:
            resp = urllib.request.urlopen(req, timeout=300)
            self.send_response(resp.status)
            for key, val in resp.headers.items():
                if key.lower() not in ('transfer-encoding',):
                    self.send_header(key, val)
            self.end_headers()
            # Stream the response with SSE normalization
            # ES OpenAiUnifiedStreamingProcessor rejects reasoning fields in finish chunks
            buffer = b''
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk
                # Process complete SSE lines
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    line_str = line.decode('utf-8', errors='replace').strip()
                    if line_str.startswith('data: ') and line_str != 'data: [DONE]':
                        data_str = line_str[6:]
                        try:
                            chunk_data = json.loads(data_str)
                            # Strip reasoning from response chunks
                            if 'choices' in chunk_data:
                                for choice in chunk_data['choices']:
                                    if 'delta' in choice:
                                        delta = choice['delta']
                                        if 'reasoning' in delta:
                                            del delta['reasoning']
                                        if 'reasoning_content' in delta:
                                            del delta['reasoning_content']
                                    # Ensure content field exists (ES parser expects it)
                                    if 'delta' in choice and 'content' not in choice['delta']:
                                        choice['delta']['content'] = ''
                            # Strip native_finish_reason if present (ES rejects it)
                            if 'native_finish_reason' in chunk_data:
                                del chunk_data['native_finish_reason']
                            # Strip reasoning_tokens from usage
                            usage = chunk_data.get('usage')
                            if usage and isinstance(usage, dict):
                                usage.pop('reasoning_tokens', None)
                                usage.pop('cached_tokens', None)
                            line = (b'data: ' + json.dumps(chunk_data).encode() + b'\n')
                        except:
                            pass  # Pass through non-JSON lines
                    self.wfile.write(line + b'\n')
                    self.wfile.flush()
            # Write any remaining buffer
            if buffer:
                self.wfile.write(buffer)
                self.wfile.flush()
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    def do_GET(self):
        url = TARGET + self.path
        req = urllib.request.Request(url)
        for key, val in self.headers.items():
            if key.lower() not in ('host', 'accept-encoding'):
                req.add_header(key, val)
        
        try:
            resp = urllib.request.urlopen(req, timeout=15)
            self.send_response(resp.status)
            for key, val in resp.headers.items():
                self.send_header(key, val)
            self.end_headers()
            self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    def log_message(self, format, *args):
        print(f"[proxy] {format % args}", flush=True)


class ThreadedHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    port = LISTEN_PORT
    if '--port' in sys.argv:
        idx = sys.argv.index('--port')
        if idx + 1 < len(sys.argv):
            port = int(sys.argv[idx + 1])
    
    server = ThreadedHTTPServer(("0.0.0.0", port), OpenRouterProxyHandler)
    print(f"[proxy] OpenRouter proxy on port {port} → {TARGET}", flush=True)
    print(f"[proxy] SSE-normalizing proxy — strips reasoning from request+response, adds max_tokens=16000", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
