#!/usr/bin/env python3
"""Export persona-matrix scores from LOCAL ES on the VM to golden.

Reads local ES (port 9220, elastic:changeme) for the persona-matrix dataset,
then bulk-indexes to golden with create semantics (idempotent retries).
"""
import json
import os
import sys
import urllib.request

GOLDEN_URL = os.environ.get("GOLDEN_ES_URL", "").rstrip("/")
GOLDEN_KEY = os.environ.get("GOLDEN_ES_API_KEY", "")
LOCAL_ES = "http://localhost:9220"
LOCAL_AUTH = "Basic ZWxhc3RpYzpjaGFuZ2VtZQ=="  # elastic:changeme

# Suite to export, injected by the sweeper (EVAL_SUITE). A single hardcoded
# dataset UUID only ever worked for persona-matrix, which has one dataset;
# attack-discovery spans 9 datasets and automatic-migrations several more, so
# filter on the suite instead. Observed 2026-09-02: a clean AD canary run
# passed 9/9 and exported NOTHING, because the persona-matrix dataset id
# matched no local doc and the exporter treated that as "nothing to do".
SUITE_ID = os.environ.get("EVAL_SUITE", "security-persona-matrix")
INDEX = ".evaluation-scores"
# Bulk in chunks so one bad batch cannot discard the whole export.
BULK_BATCH_SIZE = 500


def es_local(path, body=None):
    req = urllib.request.Request(
        f"{LOCAL_ES}{path}",
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json", "Authorization": LOCAL_AUTH},
        method="POST" if body else "GET",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def canonicalise(src: dict, model_id: str) -> dict:
    """Rewrite the upstream model name to the sweep's model key.

    A self-hosted cell is reached through the OpenAI-compatible proxy, so the
    suite records whatever name the UPSTREAM reported (`qwen3.8-27b`,
    `qwen/qwen3.8-27b`) -- never the sweep key `selfhost-qwen38`. Both the
    golden completeness gate and the resume probe look the run up by the sweep
    key, so unrewritten docs are invisible to them: run 12 wrote 266 real score
    docs and still reported total failure.

    execution_id embeds the same upstream name (`<run>::<suite>::qwen3.8-27b`)
    and MUST be rewritten too. Normalising only task.model.id leaves the resume
    probe querying an execution_id that does not exist, so every retry re-ran
    the full dataset (run 14: 5 attempts, "golden confirms 0 scored examples"
    while the export itself reported 14 docs written).
    """
    meta = src.get("metadata") or {}
    exec_id = meta.get("execution_id")
    if isinstance(exec_id, str) and "::" in exec_id:
        run, _, rest = exec_id.partition("::")
        suite = rest.rpartition("::")[0] or SUITE_ID
        meta = {**meta, "execution_id": f"{run}::{suite}::{model_id}"}
        src = {**src, "metadata": meta}
    task = src.get("task") or {}
    model = task.get("model") or {}
    if model:
        src = {**src, "task": {**task, "model": {**model, "id": model_id}}}
    return src


def export_model(model_id: str):
    # Every sweep VM starts from a clean ES data directory and runs exactly one
    # model. Export the complete suite instead of guessing the
    # stored model ID from the connector ID: connector IDs use hyphens
    # (google-gemini-3-1-pro), while score docs use dots
    # (google-gemini-3.1-pro). The dataset filter is the stable identity.
    body = {
        "size": 10000,
        "query": {"term": {"metadata.suite_id": SUITE_ID}},
    }
    resp = es_local(f"/{INDEX}/_search", body)
    hits = resp.get("hits", {}).get("hits", [])
    if not hits:
        sys.stderr.write(f"no local {SUITE_ID} docs for {model_id}\n")
        return 0, 0

    stored_models = {
        h.get("_source", {}).get("task", {}).get("model", {}).get("id") for h in hits
    }
    stored_models.discard(None)
    if len(stored_models) != 1:
        raise RuntimeError(
            f"expected one model on clean VM, found {sorted(stored_models)}"
        )

    # Preserve IDs and use create so retries are idempotent. Version conflicts
    # mean the document already landed and are not export failures.
    #
    # Batched deliberately. A single 10k-doc bulk is one all-or-nothing shot:
    # a mid-flight timeout loses the whole sweep's scores even though most
    # documents were fine. And the old code returned 0 whenever ANY document
    # failed -- reporting total failure while 293 of 294 docs sat safely on
    # golden. Partial data beats no data; report the honest count.
    exported = 0
    failed = 0
    first_failure = None

    for start in range(0, len(hits), BULK_BATCH_SIZE):
        batch = hits[start : start + BULK_BATCH_SIZE]
        bulk_lines = []
        for h in batch:
            bulk_lines.append(json.dumps({"create": {"_index": INDEX, "_id": h["_id"]}}))
            bulk_lines.append(json.dumps(canonicalise(h["_source"], model_id)))
        bulk_body = "\n".join(bulk_lines) + "\n"
        req = urllib.request.Request(
            f"{GOLDEN_URL}/{INDEX}/_bulk",
            data=bulk_body.encode(),
            headers={
                "Authorization": f"ApiKey {GOLDEN_KEY}",
                "Content-Type": "application/x-ndjson",
                "kbn-xsrf": "kbn-client",
                "x-elastic-internal-origin": "kbn-client",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                result = json.loads(r.read())
        except Exception as exc:  # noqa: BLE001 - keep earlier batches
            # A dead batch must not erase the batches that already landed.
            failed += len(batch)
            if first_failure is None:
                first_failure = {"transport": str(exc)}
            sys.stderr.write(
                f"batch {start}-{start + len(batch)} failed at transport: {exc}\n"
            )
            continue

        for item in result.get("items", []):
            op = item.get("create", {})
            status = int(op.get("status", 500))
            if status in (201, 409):
                exported += 1
            else:
                failed += 1
                if first_failure is None:
                    first_failure = op

    if failed:
        # Report, do not discard. The documents that landed are real and the
        # golden gate downstream counts them independently.
        sys.stderr.write(
            f"export incomplete for {model_id}: {exported} landed, {failed} failed "
            f"of {len(hits)}; first={first_failure}\n"
        )
    else:
        sys.stderr.write(
            f"exported {exported} docs for {model_id} "
            f"(models={sorted(stored_models)}, idempotent_conflicts_ok)\n"
        )
    return exported, failed


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: export_scores.py <eis-model-id>")
    model = sys.argv[1]
    count, missing = export_model(model)
    # Transport-level check only: >0 docs landed. Exact-count validation
    # (21 examples x (evaluators + 1) x reps) happens in the sweep
    # controller's golden gate, which derives the evaluator count live from
    # the VM's Scout summary — the hardcoded 252 here went stale when the
    # suite grew to 14 docs/example (21x14=294).
    #
    # A PARTIAL export is not a success. Exiting 0 would tell the controller
    # everything landed while documents were silently missing -- exactly the
    # false green the golden gate exists to catch. 2 = partial, 1 = nothing.
    if count == 0:
        raise SystemExit(1)
    raise SystemExit(2 if missing else 0)
