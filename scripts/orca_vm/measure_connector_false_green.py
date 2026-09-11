#!/usr/bin/env python3
"""Measure the workflow-authoring false green against the golden cluster.

`ExpectedToolCalled` proves the model CALLED `generate_workflow`. It says
nothing about what the call produced. This script re-reads the produced
workflow text and asks the stricter question: does the authored workflow
actually contain an http step aimed at the Slack connector?

The gap between those two numbers is the false green.

`task.output.*` is mapped non-queryable, so query_string/exists return 0
against it -- everything here scans `_source`. A positive control (docs whose
transcript mentions slack at all) is reported first: if that is 0 the scan is
blind and every downstream number is meaningless, so the script refuses.
"""
import argparse
import collections
import json
import re
import sys
import urllib.request

SLACK_ID = "d7306385-cbe6-4541-9726-49afdff59ba5"
STEP_RE = re.compile(r"""type\s*:\s*["']?http\b""", re.I)
SUITES = ["security-persona-matrix", "skill-selection-benchmark"]


def load_env(path):
    env = {}
    for line in open(path):
        m = re.match(r"""\s*export\s+(\w+)=['"]?([^'"\n]+)""", line)
        if m:
            env[m.group(1)] = m.group(2).strip()
    return env


def collect_text(node, out):
    if isinstance(node, str):
        out.append(node)
    elif isinstance(node, list):
        for v in node:
            collect_text(v, out)
    elif isinstance(node, dict):
        for v in node.values():
            collect_text(v, out)


def scan(url, key, max_docs):
    def post(body):
        req = urllib.request.Request(
            f"{url}/.evaluation-scores*/_search",
            data=json.dumps(body).encode(),
            headers={"Authorization": f"ApiKey {key}", "Content-Type": "application/json"},
        )
        return json.load(urllib.request.urlopen(req, timeout=300))

    after, cells, scanned, saw_slack = None, {}, 0, 0
    exhausted = False
    while True:
        body = {
            "size": 500,
            "sort": [{"_doc": "asc"}],
            "query": {
                "bool": {
                    "should": [{"term": {"metadata.suite_id": s}} for s in SUITES],
                    "minimum_should_match": 1,
                }
            },
            "_source": [
                "task.model.id",
                "task.output",
                "evaluator.name",
                "evaluator.score",
                "example.id",
                "example.dataset.name",
            ],
        }
        if after:
            body["search_after"] = after
        hits = post(body)["hits"]["hits"]
        if not hits:
            exhausted = True
            break
        for h in hits:
            s = h["_source"]
            scanned += 1
            parts = []
            collect_text(s.get("task", {}).get("output"), parts)
            blob = "\n".join(parts)
            if "slack" not in blob.lower():
                continue
            saw_slack += 1
            key_t = (
                s.get("task", {}).get("model", {}).get("id"),
                s.get("example", {}).get("dataset", {}).get("name", ""),
                s.get("example", {}).get("id"),
            )
            cell = cells.setdefault(key_t, {"text": "", "scores": collections.defaultdict(list)})
            if len(blob) > len(cell["text"]):
                cell["text"] = blob
            ev = s.get("evaluator", {})
            if ev.get("name") and isinstance(ev.get("score"), (int, float)):
                cell["scores"][ev["name"]].append(ev["score"])
        after = hits[-1]["sort"]
        if max_docs and scanned >= max_docs:
            break
    return cells, scanned, saw_slack, exhausted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env-file", default="/tmp/golden-cluster-env.sh")
    ap.add_argument("--max-docs", type=int, default=12000,
                    help="0 scans every matching doc; the default caps the scan and the cap is disclosed in the output")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    env = load_env(args.env_file)
    cells, scanned, saw_slack, exhausted = scan(
        env["GOLDEN_ES_URL"].rstrip("/"), env["GOLDEN_ES_API_KEY"], args.max_docs
    )

    # Positive control. A zero here means the scan never saw transcript text,
    # in which case "0 false greens" would be an artefact, not a finding.
    if saw_slack == 0:
        print("POSITIVE CONTROL FAILED: no transcript mentions slack; scan is blind", file=sys.stderr)
        return 1

    etc_pass = real_pass = false_green = 0
    missing_step = missing_id = 0
    by_model = collections.defaultdict(lambda: [0, 0])

    for (model, _ds, _ex), c in cells.items():
        t = c["text"]
        step_ok = bool(STEP_RE.search(t))
        id_ok = SLACK_ID in t
        # Require an http step always; require the connector id only when the
        # transcript shows the prompt actually supplied one.
        needs_id = id_ok or "connector with id" in t.lower()
        real = step_ok and (id_ok if needs_id else True)
        if not step_ok:
            missing_step += 1
        if needs_id and not id_ok:
            missing_id += 1
        etc = c["scores"].get("ExpectedToolCalled")
        if etc and sum(etc) / len(etc) >= 0.99:
            etc_pass += 1
            if not real:
                false_green += 1
        if real:
            real_pass += 1
            by_model[model][0] += 1
        by_model[model][1] += 1

    result = {
        "scan": {
            "suites": SUITES,
            "docsScanned": scanned,
            "scanComplete": exhausted,
            "maxDocs": args.max_docs or None,
            "positiveControlDocsMentioningSlack": saw_slack,
            "slackRelatedCells": len(cells),
            "caveat": (
                "Sample spans two suites, so this is not a clean single-suite rate. "
                + ("Scan hit the doc cap and is a sample, not the full index."
                   if not exhausted else "Scan reached the end of the index.")
            ),
        },
        "summary": {
            "expectedToolCalledPass": etc_pass,
            "reallyTargetsConnector": real_pass,
            "falseGreen": false_green,
            "cellsWithoutHttpStep": missing_step,
            "cellsGivenIdButOmittedIt": missing_id,
        },
        "perModel": [
            {"model": m, "real": ok, "total": tot, "rate": round(100 * ok / tot, 1)}
            for m, (ok, tot) in sorted(by_model.items(), key=lambda kv: -kv[1][1])
        ],
    }

    json.dump(result, open(args.out, "w"), indent=2)
    print(json.dumps(result["scan"], indent=2))
    print(json.dumps(result["summary"], indent=2))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
