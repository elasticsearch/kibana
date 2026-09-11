#!/usr/bin/env python3
"""Build a matrix trace cache directly from golden Elasticsearch.

Why this exists
---------------
The matrix generator normally fetches per-example score documents through the
evals plugin's example-scores route. On the golden cluster that route runs an
older plugin build that returns nothing for these queries, so every trace cell
renders hollow (no question, no steps, no tool trail) while the aggregated
scores still look perfect. `node scripts/evals ext matrix --trace-cache <path>`
takes a pre-pulled cache and skips the route entirely.

The cache is keyed exactly as query_matrix_traces.ts keys it:

    `${metadata.execution_id}::${example.id}` -> [score documents]

Usage
-----
    source /tmp/golden-cluster-env.sh
    python3 build_trace_cache.py --out /tmp/trace_cache.json
    node scripts/evals ext matrix --config ... --trace-cache /tmp/trace_cache.json
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.request

DEFAULT_INDEX = ".evaluation-scores*"
# Only these carry the payload the trace renderer needs; pulling every evaluator
# for every example multiplies the cache size with no added trace detail.
PAGE_SIZE = 1000

# Mirror query_matrix_traces.ts: it stores JSON.stringify(args).slice(0, 300)
# and slices reasoning at 500, so anything longer is cached and then discarded.
MAX_ARGS_CHARS = 300
MAX_REASONING_CHARS = 500

# Node aborts readFileSync above its max string length (0x1fffffe8, ~536 MB).
# A cache past this is unusable by the matrix CLI, so refuse to write one.
MAX_CACHE_BYTES = 500_000_000


def _client(url: str, api_key: str):
    # Elastic Cloud serves a properly-issued certificate; default verification
    # works and must stay on.
    ctx = ssl.create_default_context()

    def request(path: str, body: dict) -> dict:
        req = urllib.request.Request(
            url.rstrip("/") + path,
            data=json.dumps(body).encode(),
            headers={
                "Authorization": "ApiKey " + api_key,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, context=ctx, timeout=180) as resp:
            return json.load(resp)

    return request


def fetch_all(request, index: str, experiment: str, hours: int) -> list[dict]:
    """Page through every score doc for the experiment using search_after."""
    docs: list[dict] = []
    search_after = None
    while True:
        body = {
            "size": PAGE_SIZE,
            # These documents are large (full step lists plus correctness and
            # groundedness analyses). Without source filtering a full pull moves
            # hundreds of MB and stalls; the renderer only reads these fields.
            # `example.metadata` and the analyses are excluded deliberately: a
            # 720h cache that includes them exceeds Node's max string length
            # (0x1fffffe8) and the CLI cannot readFileSync it at all.
            "_source": [
                "@timestamp",
                "example.id",
                "example.input.question",
                "task.output.steps",
                "task.output.messages",
                "task.model.id",
                "task.repetition_index",
                "evaluator.name",
                "evaluator.score",
                "evaluator.model.id",
                "metadata.execution_id",
            ],
            "query": {
                "bool": {
                    "filter": [
                        {"term": {"experiment_name": experiment}},
                        {"range": {"@timestamp": {"gte": f"now-{hours}h"}}},
                    ]
                }
            },
            # Tiebreak on _shard_doc-free sort: @timestamp alone is not unique.
            "sort": [{"@timestamp": "asc"}, {"_doc": "asc"}],
        }
        if search_after:
            body["search_after"] = search_after
        res = request(f"/{index}/_search", body)
        hits = res["hits"]["hits"]
        if not hits:
            break
        docs.extend(h["_source"] for h in hits)
        search_after = hits[-1]["sort"]
        print(f"  fetched {len(docs)}", flush=True)
        if len(hits) < PAGE_SIZE:
            break
    return docs


def trim_step(step: dict) -> dict:
    """Keep only what the trace renderer reads from a step.

    A full 720h cache of raw steps is ~1.7 GB, which Node cannot readFileSync
    (max string 0x1fffffe8). The renderer truncates tool args to 300 chars and
    reasoning to 500, so caching the untruncated originals buys nothing.
    """
    kind = step.get("type")
    if kind == "tool_call":
        args = step.get("args")
        # query_matrix_traces re-runs JSON.stringify(args).slice(0, 300) on
        # whatever this holds, so keep a real object (a pre-stringified value
        # would double-encode). Oversized args are replaced by a marker rather
        # than dropped, so the tool card still shows the call was made.
        encoded = json.dumps(args) if args is not None else None
        if encoded is not None and len(encoded) > MAX_ARGS_CHARS:
            args = {"_truncated": len(encoded)}
        return {"type": "tool_call", "tool_id": step.get("tool_id"), "args": args}
    if kind == "reasoning":
        text = step.get("reasoning")
        return {
            "type": "reasoning",
            "reasoning": text[:MAX_REASONING_CHARS] if isinstance(text, str) else text,
        }
    if kind == "relevant_skills":
        return {"type": "relevant_skills", "skills": step.get("skills")}
    return {"type": kind}


def build_cache(docs: list[dict]) -> dict[str, list[dict]]:
    cache: dict[str, list[dict]] = {}
    for doc in docs:
        execution_id = (doc.get("metadata") or {}).get("execution_id")
        example_id = (doc.get("example") or {}).get("id")
        if not execution_id or not example_id:
            continue
        output = (doc.get("task") or {}).get("output") or {}
        steps = output.get("steps")
        if isinstance(steps, list):
            output["steps"] = [trim_step(s) for s in steps if isinstance(s, dict)]
        messages = output.get("messages")
        if isinstance(messages, list):
            # Only the last message over 50 chars becomes the answer.
            output["messages"] = [
                {"message": m.get("message")} for m in messages if isinstance(m, dict)
            ]
        cache.setdefault(f"{execution_id}::{example_id}", []).append(doc)
    return cache


def self_test() -> int:
    """Exercise the trim/keying contract without touching Elasticsearch.

    This script is a committed tool with no jest coverage (it is Python in a
    TypeScript repo), so the checks that guard its contract live here and run
    via `--self-test` in the verify manifest.
    """
    failures: list[str] = []

    def check(name: str, got: object, want: object) -> None:
        if got != want:
            failures.append(f"{name}: got {got!r}, want {want!r}")

    # Small tool args stay a real object: query_matrix_traces re-runs
    # JSON.stringify on this value, so a pre-stringified one would double-encode.
    small = trim_step({"type": "tool_call", "tool_id": "load_skill", "args": {"id": "x"}, "n": 1})
    check("small args", small, {"type": "tool_call", "tool_id": "load_skill", "args": {"id": "x"}})

    # Oversized args collapse to a marker rather than vanishing, so the tool
    # card still shows the call happened.
    big = trim_step({"type": "tool_call", "tool_id": "t", "args": {"q": "z" * 400}})
    check("oversized args marked", sorted(big["args"]), ["_truncated"])
    check("marker records real size", big["args"]["_truncated"] > MAX_ARGS_CHARS, True)

    # Reasoning is capped at what the renderer shows.
    long_reasoning = trim_step({"type": "reasoning", "reasoning": "y" * 900})
    check("reasoning cap", len(long_reasoning["reasoning"]), 500)
    check("short reasoning", trim_step({"type": "reasoning", "reasoning": "ab"})["reasoning"], "ab")

    check(
        "relevant_skills",
        trim_step({"type": "relevant_skills", "skills": [{"id": "a"}]}),
        {"type": "relevant_skills", "skills": [{"id": "a"}]},
    )
    # An unrecognised future step type must survive rather than crash.
    check("unknown kind", trim_step({"type": "future"}), {"type": "future"})
    check("args absent", trim_step({"type": "tool_call", "tool_id": "t"})["args"], None)

    # Cache keying: execution_id::example.id, and documents missing either are
    # dropped instead of colliding under a partial key.
    docs = [
        {"metadata": {"execution_id": "e1"}, "example": {"id": "a"}, "task": {"output": {}}},
        {"metadata": {"execution_id": "e1"}, "example": {"id": "a"}, "task": {"output": {}}},
        {"metadata": {"execution_id": "e1"}, "task": {"output": {}}},
        {"example": {"id": "a"}, "task": {"output": {}}},
    ]
    cache = build_cache(docs)
    check("cache keys", sorted(cache), ["e1::a"])
    check("entries merged under one key", len(cache["e1::a"]), 2)

    # Steps are trimmed in place through build_cache, not only via trim_step.
    keyed = build_cache(
        [
            {
                "metadata": {"execution_id": "e2"},
                "example": {"id": "b"},
                "task": {
                    "output": {
                        "steps": [{"type": "tool_call", "tool_id": "t", "args": {"k": "v"}, "x": 1}],
                        "messages": [{"message": "hi", "extra": "dropped"}],
                    }
                },
            }
        ]
    )
    step = keyed["e2::b"][0]["task"]["output"]["steps"][0]
    check("build_cache trims steps", step, {"type": "tool_call", "tool_id": "t", "args": {"k": "v"}})
    check(
        "build_cache trims messages",
        keyed["e2::b"][0]["task"]["output"]["messages"],
        [{"message": "hi"}],
    )

    for failure in failures:
        print(f"FAIL {failure}", file=sys.stderr)
    print(f"self-test: {len(failures)} failure(s)")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out")
    parser.add_argument("--experiment", default="security: security-persona-matrix")
    parser.add_argument("--index", default=DEFAULT_INDEX)
    parser.add_argument("--hours", type=int, default=720)
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Verify the trim/keying contract offline and exit.",
    )
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    if not args.out:
        print("--out is required", file=sys.stderr)
        return 2

    url = os.environ.get("GOLDEN_ES_URL")
    api_key = os.environ.get("GOLDEN_ES_API_KEY")
    if not url or not api_key:
        print("GOLDEN_ES_URL / GOLDEN_ES_API_KEY must be set", file=sys.stderr)
        return 2

    request = _client(url, api_key)
    docs = fetch_all(request, args.index, args.experiment, args.hours)
    cache = build_cache(docs)

    # A cache whose entries carry no task.output is worse than no cache: it
    # silently satisfies the fetch and still renders hollow traces. Report the
    # ratio so the caller can tell a real cache from an empty one.
    with_steps = sum(
        1
        for entries in cache.values()
        for d in entries
        if ((d.get("task") or {}).get("output") or {}).get("steps")
    )
    models = {
        ((d.get("task") or {}).get("model") or {}).get("id")
        for entries in cache.values()
        for d in entries
    }

    with open(args.out, "w") as handle:
        json.dump(cache, handle)

    size = os.path.getsize(args.out)
    print(f"docs        : {len(docs)}")
    print(f"cache keys  : {len(cache)}")
    print(f"docs w/steps: {with_steps}")
    print(f"models      : {len(models - {None})}")
    print(f"written     : {args.out} ({size / 1e6:.0f} MB)")
    if with_steps == 0:
        print("ERROR: no document carries task.output.steps", file=sys.stderr)
        return 1
    # Node reads this file with readFileSync, which cannot produce a string
    # longer than 0x1fffffe8 (~536 MB). A larger cache aborts the matrix CLI
    # outright, so refuse it here where the cause is obvious.
    if size > MAX_CACHE_BYTES:
        print(
            f"ERROR: cache is {size / 1e6:.0f} MB; Node cannot readFileSync "
            f"more than ~536 MB. Narrow --hours or the _source list.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
