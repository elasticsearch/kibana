#!/usr/bin/env python3
"""Extract attack-discovery results from the golden ES cluster.

Writes a JSON aggregate consumed by render_attack_discovery_board.py.

IMPORTANT — why _source scanning and not `exists` aggregations:
  Fields under `task.output.*` are mapped non-queryable on the golden cluster.
  An `exists` filter on task.output.adToolResult.discoveryCount returns 0 while
  the field is plainly present in _source (positive control: evaluator.score
  returns 17,169 on the identical query shape). Coverage MUST therefore be
  measured by reading _source. Do not "optimise" this into an aggregation.

Absent fields are reported as null and MUST render blank downstream. The
reference artifact's Latency / Total risk columns have no counterpart in this
schema; they are not imputed.
"""
import argparse
import collections
import json
import re
import sys
import urllib.request

SUITE_ID = "attack-discovery-agent-builder"


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
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.load(resp)


def dig(src, dotted):
    cur = src
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def scan(es, suite_id, since=None):
    query = {"term": {"metadata.suite_id": suite_id}}
    if since:
        # The suite has historical executions on golden (CI runs from Jul/Aug,
        # a Sep 7 buildkite batch). A board render must reflect ONE sweep; leave
        # --since unset only when you deliberately want the full history.
        query = {
            "bool": {
                "filter": [
                    {"term": {"metadata.suite_id": suite_id}},
                    {"range": {"@timestamp": {"gte": since}}},
                ]
            }
        }
    body = {
        "size": 1000,
        "query": query,
        "_source": [
            "task.output.adToolResult",
            "task.output.workflow",
            "task.output.insights",
            "task.output.traceId",
            "task.output.raw",
            "task.output.errors",
            "task.model.id",
            "example.dataset.name",
            "evaluator.name",
            "evaluator.score",
            "metadata.execution_id",
            "@timestamp",
        ],
        "sort": ["_doc"],
    }
    res = es.post("/.evaluation-scores*/_search?scroll=5m", body)
    scroll_id = res.get("_scroll_id")
    total = res["hits"]["total"]["value"]
    docs = []
    while res["hits"]["hits"]:
        docs.extend(h["_source"] for h in res["hits"]["hits"])
        res = es.post("/_search/scroll", {"scroll": "5m", "scroll_id": scroll_id})
        scroll_id = res.get("_scroll_id")
    return docs, total


def _blank_row():
    # Heterogeneous value types: static analysers infer a single union type for
    # the dict values and then flag every += / .append below. Behaviour is
    # correct; the annotation keeps the checker quiet.
    row: dict = {
        "docs": 0,
        "discoveryCounts": [],
        "alertsContextCounts": [],
        "statuses": collections.Counter(),
        "validatedDiscoveryCounts": [],
        "evaluators": collections.defaultdict(list),
        "datasets": collections.Counter(),
        "executions": collections.Counter(),
        "insights": [],
        "traceIds": [],
        "rawLatencyMs": [],
        "errorTexts": set(),
    }
    return row


def build(docs):
    per_model = collections.defaultdict(_blank_row)
    for src in docs:
        model = dig(src, "task.model.id")
        if not model:
            continue
        row = per_model[model]
        row["docs"] += 1
        row["datasets"][dig(src, "example.dataset.name") or "?"] += 1

        dc = dig(src, "task.output.adToolResult.discoveryCount")
        if dc is not None:
            row["discoveryCounts"].append(dc)
        ac = dig(src, "task.output.adToolResult.alertsContextCount")
        if ac is not None:
            row["alertsContextCounts"].append(ac)
        st = dig(src, "task.output.adToolResult.status")
        if st is not None:
            row["statuses"][str(st)] += 1
        vd = dig(src, "task.output.workflow.validatedDiscoveryCount")
        if vd is not None:
            row["validatedDiscoveryCounts"].append(vd)

        # persona-matrix (_generate API) schema: the product result rides in
        # task.output.raw (status / alerts_context_count / latency_ms) and the
        # final answer is task.output.insights. Promote once per execution so
        # these do not multiply by evaluator-doc count.
        raw = dig(src, "task.output.raw") or {}
        exec_id_pm = dig(src, "metadata.execution_id")
        if raw and exec_id_pm:
            marker = ("raw", exec_id_pm)
            if marker not in row["traceIds"]:
                row["traceIds"].append(marker)
                ins_pm = dig(src, "task.output.insights") or []
                row["discoveryCounts"].append(len(ins_pm))
                if raw.get("alerts_context_count") is not None:
                    row["alertsContextCounts"].append(raw["alerts_context_count"])
                row["statuses"][str(raw.get("status") or "unknown")] += 1
                if raw.get("latency_ms") is not None:
                    row["rawLatencyMs"].append(raw["latency_ms"])
        errs = dig(src, "task.output.errors")
        if errs:
            for e in errs[:2]:
                row["errorTexts"].add(str(e)[:180])

        ev = dig(src, "evaluator.name")
        sc = dig(src, "evaluator.score")
        if ev and isinstance(sc, (int, float)):
            row["evaluators"][ev].append(float(sc))

        # Final-answer capture for trace cards: task.output.insights is the
        # AD generate-API result (title, summary, MITRE tactics, risk score).
        # Stored once per execution, not per evaluator doc.
        exec_id = dig(src, "metadata.execution_id")
        if exec_id and exec_id not in row["executions"]:
            row["executions"][exec_id] = 0
        insights = dig(src, "task.output.insights")
        if insights and exec_id:
            marker = (exec_id, dig(src, "task.output.traceId"))
            if marker not in row["traceIds"]:
                row["traceIds"].append(marker)
                row["insights"].append(
                    {
                        "executionId": exec_id,
                        "traceId": dig(src, "task.output.traceId"),
                        "insights": insights,
                    }
                )

    def mean(xs):
        return round(sum(xs) / len(xs), 4) if xs else None

    out = []
    for model, row in sorted(per_model.items()):
        statuses = dict(row["statuses"])
        completed = statuses.get("completed", 0)
        status_total = sum(statuses.values())

        # Latency is NOT a task.output field -- it is recorded as a scored
        # evaluator named "Latency" (seconds). Promote it so the board shows a
        # real column instead of a blank. Verified present for all 39 models.
        lat_scores = row["evaluators"].get("Latency") or []
        latency_seconds = round(sum(lat_scores) / len(lat_scores), 1) if lat_scores else None

        # persona-matrix _generate latency: product-side wall clock from
        # task.output.raw.latency_ms (ms -> s), independent of the evaluator
        # latency (which measures the whole test, not the generate call).
        gen_latency_seconds = (
            round(sum(row["rawLatencyMs"]) / len(row["rawLatencyMs"]) / 1000.0, 1)
            if row["rawLatencyMs"] else None
        )

        # Total risk has no source anywhere in the golden schema (neither a
        # task.output field nor an evaluator) -- it stays absent, renders blank.
        out.append(
            {
                "modelId": model,
                "docs": row["docs"],
                "datasets": len(row["datasets"]),
                # Coverage is explicit so the board can show N/total, never a
                # bare mean that hides how many docs actually carried the field.
                "discoveryCount": {
                    "mean": mean(row["discoveryCounts"]),
                    "n": len(row["discoveryCounts"]),
                },
                "alertsContextCount": {
                    "mean": mean(row["alertsContextCounts"]),
                    "n": len(row["alertsContextCounts"]),
                },
                "validatedDiscoveryCount": {
                    "mean": mean(row["validatedDiscoveryCounts"]),
                    "n": len(row["validatedDiscoveryCounts"]),
                },
                "status": {
                    "completedRate": round(completed / status_total, 4) if status_total else None,
                    "counts": statuses,
                    "n": status_total,
                },
                # Latency recovered from the "Latency" evaluator (seconds).
                "latencySeconds": latency_seconds,
                # persona-matrix _generate wall-clock (seconds) from raw.latency_ms.
                "generateLatencySeconds": gen_latency_seconds,
                # Errors recorded on the output doc (e.g. "generation failed:
                # Maximum generation attempts (10) reached") -- surfaced so a
                # failed generation cannot hide behind a passing doc-count gate.
                "generateErrors": sorted(row["errorTexts"])[:5],
                # Total risk: present in the reference artifact, absent from our
                # schema. Explicit null -> blank cell + disclosure. Never imputed.
                "totalRisk": None,
                "evaluators": {k: {"mean": mean(v), "n": len(v)} for k, v in sorted(row["evaluators"].items())},
                # Trace-card payload: one entry per execution with the final AD
                # answer (insights) and the OTel trace id linking to the full span.
                "traceCards": [
                    {
                        "executionId": t["executionId"],
                        "traceId": t["traceId"],
                        "insightCount": len(t["insights"]),
                        "insights": t["insights"],
                    }
                    for t in row["insights"]
                ],
                "executionCount": len(row["executions"]),
            }
        )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env-file", default="/tmp/golden-cluster-env.sh")
    ap.add_argument("--suite-id", default=SUITE_ID)
    ap.add_argument("--since", help="ISO date lower bound; excludes historical executions (e.g. 2026-09-10T12:00Z)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    env = load_env(args.env_file)
    url, key = env.get("GOLDEN_ES_URL"), env.get("GOLDEN_ES_API_KEY")
    if not url or not key:
        sys.exit(f"GOLDEN_ES_URL / GOLDEN_ES_API_KEY missing from {args.env_file}")

    es = Es(url, key)
    docs, total = scan(es, args.suite_id, since=args.since)
    if not docs:
        sys.exit(f"no documents for suite_id={args.suite_id} — refusing to write an empty aggregate")

    rows = build(docs)
    payload = {
        "suiteId": args.suite_id,
        "sourceDocCount": len(docs),
        "reportedTotal": total,
        "modelCount": len(rows),
        # Only totalRisk is truly absent; latencySeconds is recovered from the
        # "Latency" evaluator. Computed, not hardcoded, so this can never drift
        # from what the rows actually carry.
        "absentFields": sorted(
            f for f in ("latencySeconds", "totalRisk") if all(r[f] is None for r in rows)
        ),
        "models": rows,
    }
    with open(args.out, "w") as fh:
        json.dump(payload, fh, indent=2)
    print(f"scanned {len(docs)} docs (reported {total}) -> {len(rows)} models -> {args.out}")


if __name__ == "__main__":
    main()
