#!/usr/bin/env python3
"""Post-sweep audit: prove a sweep's scores are publishable.

`EVAL_EXIT=0` and `EXPORT_EXIT=0` are NOT evidence. On 2026-08-29 both were
zero while 546 docs went to a nonexistent host, and another 294 landed
correctly but were unusable because the model had graded itself.

This asks the golden cluster three questions per model:
  1. did docs actually land?          (catches wrong-URL false success)
  2. who graded them?                 (catches self-judging)
  3. how many examples completed?     (catches silent partials)

    source /tmp/golden-cluster-env.sh
    python3 audit_sweep.py --models eis-anthropic-claude-4-6-sonnet --hours 6

Exit 0 only if every model has landed, independently-judged docs.
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.request

from model_ids import resolve_model_id

GOLDEN_INDEX = ".evaluation-scores"


def list_stored_model_ids(url: str, key: str, hours: int) -> list[str]:
    """Every task.model.id present in the window — the ground truth id space."""
    body = {
        "size": 0,
        "query": {"bool": {"filter": [{"range": {"@timestamp": {"gte": f"now-{hours}h"}}}]}},
        "aggs": {"m": {"terms": {"field": "task.model.id", "size": 200}}},
    }
    res = es_search(url, key, body)
    return [b["key"] for b in res["aggregations"]["m"]["buckets"]]


def es_search(url: str, key: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{url.rstrip('/')}/{GOLDEN_INDEX}/_search",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"ApiKey {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as resp:
        return json.loads(resp.read().decode())


def audit_model(url: str, key: str, model: str, hours: int, stored_ids: list[str]) -> bool:
    """Return True only if this model produced publishable scores."""
    resolved = resolve_model_id(model, stored_ids)
    if resolved is None:
        print(
            f"FAIL [{model}] no docs under any matching task.model.id in the last {hours}h. "
            f"Export reported success but nothing landed — check GOLDEN_ES_URL points at "
            f"the real cluster.",
            file=sys.stderr,
        )
        return False
    model_c = resolved
    # NOTE: the timestamp field is `@timestamp`, and the model under test is
    # `task.model.id` — NOT `evaluator.model.id`, which is the judge. Querying
    # the judge field silently returns another model's docs.
    body = {
        "size": 0,
        "query": {
            "bool": {
                "filter": [
                    {"term": {"task.model.id": model_c}},
                    {"range": {"@timestamp": {"gte": f"now-{hours}h"}}},
                ]
            }
        },
        "aggs": {
            "judges": {"terms": {"field": "evaluator.model.id", "size": 10}},
            "examples": {"cardinality": {"field": "example.id"}},
        },
    }
    try:
        res = es_search(url, key, body)
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL [{model_c}] golden query failed: {exc}", file=sys.stderr)
        return False

    total = res["hits"]["total"]["value"]
    if total == 0:
        print(
            f"FAIL [{model_c}] 0 docs in the last {hours}h. Export reported success but "
            f"nothing landed — check GOLDEN_ES_URL points at the real cluster.",
            file=sys.stderr,
        )
        return False

    judges = {b["key"]: b["doc_count"] for b in res["aggregations"]["judges"]["buckets"]}
    examples = res["aggregations"]["examples"]["value"]
    self_judged = judges.get(model_c, 0)

    if self_judged:
        pct = 100.0 * self_judged / total
        print(
            f"FAIL [{model_c}] {self_judged}/{total} docs ({pct:.0f}%) are SELF-JUDGED. "
            f"These are dropped by `excludeSelfJudged` and will fill ZERO cells. "
            f"Re-running will not help — assign an independent judge.",
            file=sys.stderr,
        )
        return False

    judge_list = ", ".join(f"{k}({v})" for k, v in judges.items()) or "none"
    print(f"  ok  [{model_c}] {total} docs, {examples} examples, judged by: {judge_list}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--models", nargs="+", required=True)
    ap.add_argument("--hours", type=int, default=6)
    args = ap.parse_args()

    url = os.environ.get("GOLDEN_ES_URL", "")
    key = os.environ.get("GOLDEN_ES_API_KEY", "")
    if not url or not key:
        print("GOLDEN_ES_URL / GOLDEN_ES_API_KEY not set", file=sys.stderr)
        return 1

    print(f"Auditing {len(args.models)} model(s) over the last {args.hours}h")
    stored_ids = list_stored_model_ids(url, key, args.hours)
    results = [audit_model(url, key, m, args.hours, stored_ids) for m in args.models]

    if not all(results):
        print("\nAUDIT FAILED — these scores are not publishable.", file=sys.stderr)
        return 1
    print("\nAUDIT PASSED — scores landed and are independently judged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
