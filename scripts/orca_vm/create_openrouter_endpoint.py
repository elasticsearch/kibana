#!/usr/bin/env python3
"""Create/verify the ES inference endpoint for an OpenRouter-backed model.

Pointed at the on-VM proxy (http://127.0.0.1:8088), NOT openrouter.ai directly:
ES's OpenAiUnifiedStreamingProcessor cannot parse OpenRouter's raw SSE
("reasoning": null in finish chunks, native_finish_reason, reasoning_tokens) —
the proxy normalizes the stream first. Skipping the proxy worked nowhere.

Trap notes (all verified in the field):
  - urllib does NOT parse URL-embedded credentials: Authorization must be a
    real header (Basic elastic:changeme) or the call 401s silently.
  - task_type and api_key are REQUIRED in service_settings for the PUT.
    ES strips api_key from GET responses, so "copying the GET shape" breaks.
  - The endpoint id MUST equal the connector's config.inferenceId, else the
    eval 404s with "No connector or inference endpoint found".

Usage: create_openrouter_endpoint.py <endpoint_id> <model_id> <api_key> [proxy_port]
"""

import base64
import json
import sys
import time
import urllib.error
import urllib.request

ES_URL = "http://localhost:9220"
AUTH = "Basic " + base64.b64encode(b"elastic:changeme").decode()

READY_TIMEOUT_S = 600  # ES boot after clean data dir takes minutes
POLL_S = 5


def es_req(method: str, path: str, body: "bytes | None" = None, timeout: int = 30):
    req = urllib.request.Request(
        ES_URL + path, data=body, method=method,
        headers={"Authorization": AUTH, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", "replace")


def wait_for_es() -> bool:
    """Poll until ES accepts connections. A clean-data boot is not instant."""
    deadline = time.time() + READY_TIMEOUT_S
    while time.time() < deadline:
        try:
            es_req("GET", "/", timeout=10)
            return True
        except Exception:
            time.sleep(POLL_S)
    return False


def endpoint_points_at_proxy(endpoint_id: str, model_id: str, port: int) -> bool:
    """True when the endpoint already exists with the RIGHT shape.

    Reuse is only safe when url/model both match: a previous run's endpoint
    pointing straight at openrouter.ai silently bypasses the proxy and dies
    with "agent returned an empty response" mid-sweep.
    """
    try:
        _, body = es_req("GET", f"/_inference/chat_completion/{endpoint_id}")
        # GET wraps the result: {"endpoints": [{...}]} — read through the
        # wrapper or service_settings is always {} and the watcher loop
        # delete/recreates the endpoint every cycle (converse 404 races).
        doc = json.loads(body)
        if isinstance(doc, dict) and "endpoints" in doc:
            eps = doc["endpoints"] or []
            if not eps:
                return False
            cfg = eps[0].get("service_settings", {})
        else:
            cfg = doc.get("service_settings", {})
        return (
            cfg.get("url") == f"http://127.0.0.1:{port}"
            and cfg.get("model_id") == model_id
        )
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    endpoint_id, model_id, api_key = sys.argv[1], sys.argv[2], sys.argv[3]
    port = int(sys.argv[4]) if len(sys.argv) > 4 else 8088

    if not wait_for_es():
        print("FATAL: ES never became reachable", flush=True)
        return 1
    print("ES reachable", flush=True)

    if endpoint_points_at_proxy(endpoint_id, model_id, port):
        print(f"endpoint {endpoint_id} already points at proxy; reusing", flush=True)
        return 0

    # A wrong-shaped endpoint must go: PUT on an existing id errors instead of
    # overwriting (ES inference endpoints are immutable without force delete).
    try:
        es_req("DELETE", f"/_inference/chat_completion/{endpoint_id}?force=true")
        print(f"deleted stale endpoint {endpoint_id}", flush=True)
    except urllib.error.HTTPError:
        pass  # 404 — nothing to delete

    payload = json.dumps({
        "service": "openai",
        "service_settings": {
            "model_id": model_id,
            "url": f"http://127.0.0.1:{port}",
            "api_key": api_key,
            # task_type goes ONLY in the URL path, never service_settings —
            # "Configuration contains settings [{task_type=chat_completion}]
            # unknown to the [openai] service" (400) if included.
            "rate_limit": {"requests_per_minute": 500},
        },
    }).encode()

    for attempt in range(1, 4):
        try:
            status, _ = es_req("PUT", f"/_inference/chat_completion/{endpoint_id}", payload)
            print(f"created endpoint {endpoint_id} -> proxy:{port} (HTTP {status})", flush=True)
            return 0
        except urllib.error.HTTPError as e:
            print(f"PUT attempt {attempt}/3 failed: {e.code} {e.read().decode()[:200]}", flush=True)
            time.sleep(5 * attempt)
    print("FATAL: could not create endpoint after 3 attempts", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
