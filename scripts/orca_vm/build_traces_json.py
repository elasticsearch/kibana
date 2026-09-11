#!/usr/bin/env python3
"""Build TRACES_JSON for render_from_golden.ts from golden ES.

Combines two golden sources into MatrixTraceData (keyed "modelId:column"):
  1. .ds-.evaluation-scores* task.output (steps, messages) per execution
  2. traces-agent_builder.otel-default spans:
       - gen_ai.input.messages -> reasoning/final answer
       - gen_ai.tool.call.arguments on execute_tool spans -> toolParams

The historical cache has steps[].args = null for every tool_call (383,098
steps, 100% null, pre-includeToolDetails). New runs carry real args ONLY on
the spans, so toolParams is sourced from spans and joined by (trace_id,
tool span order). Absent args render as an explicit "(args not captured)"
marker — never invented.
"""
import argparse
import collections
import json
import os
import re
import sys
import urllib.request

def load_env(path):
    env = {}
    with open(path) as fh:
        for line in fh:
            m = re.match(r"""\s*export\s+(\w+)=['"]?([^'"\n]+)""", line)
            if m:
                env[m.group(1)] = m.group(2).strip()
    return env

class Es:
    def __init__(self, url, key):
        self.url = url.rstrip("/")
        self.key = key

    def post(self, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method="POST")
        req.add_header("Authorization", f"ApiKey {self.key}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.load(resp)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env-file", default="/tmp/golden-cluster-env.sh")
    ap.add_argument("--suite", default="security-persona-matrix",
                    help="suite_id filter for score docs (agent-builder feeds agent_eval_full boards)")
    ap.add_argument("--since", required=True, help="ISO lower bound for trace docs")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    env = load_env(args.env_file)
    url, key = env.get("GOLDEN_ES_URL"), env.get("GOLDEN_ES_API_KEY")
    if not url or not key:
        sys.exit("GOLDEN_ES_URL / GOLDEN_ES_API_KEY missing")

    es = Es(url, key)

    # ---- 1. score docs: execution -> steps/messages --------------------
    score_body = {
        "size": 1000,
        "query": {"bool": {"filter": [
            {"term": {"metadata.suite_id": args.suite}},
            {"range": {"@timestamp": {"gte": args.since}}},
        ]}},
        "_source": [
            "metadata.execution_id", "task.model.id", "example.id",
            "task.output.steps", "task.output.messages", "task.output.traceId",
            "evaluator.name", "evaluator.score", "task.repetition_index",
        ],
        "sort": [{"@timestamp": "asc"}],
    }
    cells = collections.defaultdict(dict)   # exec_id -> {prompt: docs}
    model_of = {}
    n_docs = 0
    search_after = None
    while True:
        body = dict(score_body)
        if search_after:
            body["search_after"] = search_after
        res = es.post("/.ds-.evaluation-scores*/_search", body)
        hits = res["hits"]["hits"]
        if not hits:
            break
        for h in hits:
            src = h["_source"]
            exec_id = (src.get("metadata") or {}).get("execution_id", "")
            model = ((src.get("task") or {}).get("model") or {}).get("id", "")
            prompt = ((src.get("example") or {}).get("id") or "").lower()
            if exec_id:
                model_of[exec_id] = model
            if not (exec_id and model and prompt):
                continue
            cells[exec_id].setdefault(prompt, []).append(src)
            n_docs += 1
        search_after = hits[-1]["sort"]
        if len(hits) < 1000:
            break

    # ---- 2. spans: tool args per trace --------------------------------
    span_body = {
        "size": 1000,
        "query": {"bool": {"filter": [
            {"range": {"@timestamp": {"gte": args.since}}},
            {"exists": {"field": "attributes.gen_ai.tool.call.arguments"}},
        ]}},
        "_source": [
            "trace_id", "span_id", "parent_span_id", "name", "@timestamp",
            "attributes.gen_ai.tool.call.arguments", "attributes.gen_ai.tool.name",
            "attributes.gen_ai.tool.call.id",
        ],
        "sort": [{"@timestamp": "asc"}],
    }
    span_args = collections.defaultdict(list)  # trace_id -> [(ts, name, args)]
    n_spans = 0
    search_after = None
    while True:
        body = dict(span_body)
        if search_after:
            body["search_after"] = search_after
        res = es.post("/.ds-traces-agent_builder.otel-default-*/_search", body)
        hits = res["hits"]["hits"]
        if not hits:
            break
        for h in hits:
            src = h["_source"]
            tid = src.get("trace_id")
            attrs = src.get("attributes") or {}
            args_v = attrs.get("gen_ai.tool.call.arguments")
            tool_nm = attrs.get("gen_ai.tool.name")
            if tid and args_v is not None:
                span_args[tid].append(
                    {"ts": src.get("@timestamp"),
                     "name": src.get("name") or tool_nm,
                     "toolId": attrs.get("gen_ai.tool.call.id"),
                     "args": args_v}
                )
                n_spans += 1
        search_after = hits[-1]["sort"]
        if len(hits) < 1000:
            break

    # ---- 3. join ------------------------------------------------------
    # Score-doc steps[].args is None even on includeToolDetails runs (the
    # evals writer does not serialise args into task.output). Real args live
    # only on execute_tool spans, keyed by trace_id. Join: within a trace,
    # match each tool_call step to the span with the same tool name in
    # timestamp order. Unmatched -> explicit None (renderer marks it).
    #
    # A model may have MULTIPLE executions in the window (retries). The
    # reference board renders one run per model; pick the execution with
    # the most docs per (model, prompt) — deterministic, never a blend.
    best = {}  # (model, prompt) -> (n_docs, exec_id, docs)
    for exec_id, prompts in cells.items():
        model = model_of.get(exec_id, "")
        short = model.removeprefix("eis-")
        for prompt, docs in prompts.items():
            k = (short, prompt)
            if k not in best or len(docs) > best[k][0]:
                best[k] = (len(docs), exec_id, docs)

    by_exec_prompt = collections.defaultdict(dict)  # exec_id -> prompt -> docs
    for (short, prompt), (n, exec_id, docs) in best.items():
        by_exec_prompt[exec_id][prompt] = docs

    out = {}
    for exec_id, prompts in by_exec_prompt.items():
        model = model_of.get(exec_id, "")
        short = model.removeprefix("eis-")
        for prompt, docs in prompts.items():
            trace_ids = set()
            for d in docs:
                tid = ((d.get("task") or {}).get("output") or {}).get("traceId")
                if tid:
                    trace_ids.add(tid)
            # name-indexed span args for this cell's traces
            name_queue = collections.defaultdict(collections.deque)
            for tid in trace_ids:
                for sp in sorted(span_args.get(tid, []), key=lambda s: s["ts"] or ""):
                    nm = sp["name"].replace("execute_tool ", "") if sp["name"] else sp["name"]
                    name_queue[nm].append(sp)
            steps_out = []
            answer = None
            question = None
            seen_reps = set()
            for d in docs:
                rep = d.get("task", {}).get("repetition_index")
                if rep in seen_reps:
                    continue  # evaluator docs duplicate the same output; take one
                seen_reps.add(rep)
                outp = ((d.get("task") or {}).get("output") or {})
                if question is None:
                    q = (outp.get("messages") or [{}])[0]
                    if isinstance(q, dict) and q.get("role") == "user":
                        question = q.get("content")
                if answer is None:
                    msgs = outp.get("messages") or []
                    for m in reversed(msgs):
                        if isinstance(m, dict) and m.get("message"):
                            answer = m["message"]
                            break
                if question is None and not steps_out:
                    pass
                for s in outp.get("steps") or []:
                    t = s.get("type")
                    if t == "reasoning":
                        steps_out.append({"type": "reasoning", "text": s.get("reasoning")})
                    elif t == "tool_call":
                        nm = s.get("tool_id")
                        sp = name_queue[nm].popleft() if name_queue.get(nm) else None
                        steps_out.append({
                            "type": "tool",
                            "toolId": nm,
                            "toolParams": sp["args"] if sp else None,
                        })
                    elif t == "relevant_skills":
                        steps_out.append({
                            "type": "skill",
                            "skills": s.get("skills"),
                        })
            scores = collections.defaultdict(list)
            for d in docs:
                ev = ((d.get("evaluator") or {}))
                if ev.get("name") and isinstance(ev.get("score"), (int, float)):
                    scores[ev["name"]].append(float(ev["score"]))
            out[f"{short}:{prompt}"] = {
                "question": question,
                "answer": answer,
                "steps": steps_out,
                "stepCount": len(steps_out),
                "scores": {k: round(sum(v)/len(v), 4) for k, v in scores.items()},
                "repetitions": len(docs),
            }

    payload = {
        "cells": out,
        "meta": {
            "since": args.since,
            "scoreDocs": n_docs,
            "argSpans": n_spans,
            "note": "toolParams joined from gen_ai.tool.call.arguments spans",
        },
    }
    with open(args.out, "w") as fh:
        json.dump(payload, fh)
    print(f"score docs: {n_docs} | arg spans: {n_spans} | cells: {len(out)} -> {args.out}")

if __name__ == "__main__":
    main()
