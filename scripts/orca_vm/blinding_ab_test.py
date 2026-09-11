#!/usr/bin/env python3
"""Blinding A/B: does a visible model hint change a judge's score?

Criterion 4. Pulls real transcripts from golden ES, judges each one TWICE
through the omniroute combo `omni-opus-5`:

  variant A (leaked)  -- transcript with an `orca-sweep-<model>` host string
  variant B (blinded) -- identical transcript, host replaced with `orca-sweep-m<hash>`

Everything else is byte-identical, so any score delta is attributable to the
hint alone. Writes scores AND the combo's reported token/cost usage.

The earlier static analysis showed the real golden leak lives only in
`metadata.hostname`, which never reaches the judge. This measures the
COUNTERFACTUAL: if such a string DID reach the judge, would it move scores?
That is the question that decides whether blinding matters going forward.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request

OMNIROUTE_URL = os.environ.get("OMNIROUTE_URL", "http://localhost:8080/v1/chat/completions")
COMBO = "omni-opus-5"

JUDGE_PROMPT = """You are grading a security analyst agent's answer.

Score 0-10 on: correctness, use of evidence, and whether the answer actually
completes the requested task. Reply with STRICT JSON only:
{"score": <0-10>, "reason": "<one sentence>"}

--- TASK ---
%s

--- AGENT TRANSCRIPT ---
%s
"""


def load_env(path):
    env = {}
    if os.path.exists(path):
        for line in open(path):
            m = re.match(r"""\s*export\s+(\w+)=['"]?([^'"\n]+)""", line)
            if m:
                env[m.group(1)] = m.group(2)
    return env


def es_search(url, key, body):
    req = urllib.request.Request(
        f"{url}/.evaluation-scores*/_search",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"ApiKey {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def dig(src, path):
    cur = src
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def fetch_cells(url, key, model, limit):
    """Pull distinct transcripts for one model."""
    res = es_search(url, key, {
        "size": 400,
        "query": {"bool": {"filter": [
            {"term": {"metadata.suite_id": "security-persona-matrix"}},
            {"term": {"task.model.id": model}},
        ]}},
        "_source": ["task.output.messages", "example.input.question", "task.trace_id",
                    "example.id", "evaluator.name", "evaluator.score"],
    })
    seen, cells = set(), []
    for h in res["hits"]["hits"]:
        s = h["_source"]
        tid = dig(s, "task.trace_id")
        if not tid or tid in seen:
            continue
        msgs = dig(s, "task.output.messages") or []
        text = "\n".join(m.get("message", "") for m in msgs if isinstance(m, dict))
        if len(text) < 200:
            continue
        seen.add(tid)
        cells.append({
            "traceId": tid,
            "exampleId": dig(s, "example.id"),
            "question": dig(s, "example.input.question") or "",
            "transcript": text,
        })
        if len(cells) >= limit:
            break
    return cells


def judge(text, question, model_name, timeout=180):
    """One judge call through the omni-opus-5 combo."""
    payload = {
        "model": COMBO,
        "messages": [{"role": "user", "content": JUDGE_PROMPT % (question[:1500], text[:12000])}],
        "temperature": 0,
        "max_tokens": 300,
    }
    req = urllib.request.Request(
        OMNIROUTE_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {os.environ.get('OMNIROUTE_API_KEY', 'sk-local')}"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = json.load(r)
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage", {})
    m = re.search(r'\{.*?\}', content, re.S)
    score = None
    if m:
        try:
            score = json.loads(m.group(0)).get("score")
        except Exception:
            pass
    return score, usage, body.get("model", COMBO)


def blind(text, model):
    """Replace the leaked host token with the anonymised form."""
    leaked = f"orca-sweep-{model.replace('.', '-').replace('/', '-')}"
    h = hashlib.sha256(model.encode()).hexdigest()[:8]
    return text.replace(leaked, f"orca-sweep-m{h}"), leaked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="anthropic-claude-4.8-opus")
    ap.add_argument("--cells", type=int, default=14)
    ap.add_argument("--env-file", default="/tmp/golden-cluster-env.sh")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    env = load_env(args.env_file)
    url, key = env.get("GOLDEN_ES_URL"), env.get("GOLDEN_ES_API_KEY")
    if not url or not key:
        sys.exit("golden ES credentials missing")

    cells = fetch_cells(url, key, args.model, args.cells)
    if not cells:
        sys.exit(f"no transcripts for {args.model} -- refusing to write an empty A/B")
    print(f"fetched {len(cells)} transcripts for {args.model}", flush=True)

    results, totals = [], {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "calls": 0}
    for i, c in enumerate(cells, 1):
        blinded, leaked_token = blind(c["transcript"], args.model)
        # Variant A must actually contain a hint, or the A/B measures nothing.
        leaked_text = c["transcript"]
        if leaked_token not in leaked_text:
            leaked_text = f"[host: {leaked_token}]\n{leaked_text}"
        row = {"traceId": c["traceId"], "exampleId": c["exampleId"],
               "hintInjected": leaked_token not in c["transcript"]}
        for variant, text in (("leaked", leaked_text), ("blinded", blinded)):
            try:
                score, usage, served = judge(text, c["question"], args.model)
                row[variant] = score
                row[f"{variant}Model"] = served
                for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    totals[k] += usage.get(k, 0) or 0
                totals["calls"] += 1
            except Exception as e:
                row[variant] = None
                row[f"{variant}Error"] = str(e)[:200]
            time.sleep(0.5)
        results.append(row)
        print(f"  [{i}/{len(cells)}] leaked={row.get('leaked')} blinded={row.get('blinded')}", flush=True)

    paired = [(r["leaked"], r["blinded"]) for r in results
              if isinstance(r.get("leaked"), (int, float)) and isinstance(r.get("blinded"), (int, float))]
    deltas = [a - b for a, b in paired]
    summary = {
        "model": args.model,
        "combo": COMBO,
        "cellsRequested": args.cells,
        "cellsJudged": len(paired),
        "meanLeaked": round(sum(a for a, _ in paired) / len(paired), 3) if paired else None,
        "meanBlinded": round(sum(b for _, b in paired) / len(paired), 3) if paired else None,
        "meanDelta": round(sum(deltas) / len(deltas), 3) if deltas else None,
        "maxAbsDelta": max((abs(d) for d in deltas), default=None),
        "nonZeroDeltas": sum(1 for d in deltas if d != 0),
        "usage": totals,
    }
    with open(args.out, "w") as fh:
        json.dump({"summary": summary, "results": results}, fh, indent=2)
    print(json.dumps(summary, indent=2))
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
