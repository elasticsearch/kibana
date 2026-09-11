#!/usr/bin/env python3
"""Pre-flight gate for persona-matrix sweeps.

Every check here corresponds to a failure that silently wasted a real sweep.
Run it BEFORE launching models; it exits non-zero and refuses the sweep rather
than letting a run produce unpublishable scores.

    python3 preflight_sweep.py --models eis-anthropic-claude-4-6-sonnet ...

Checks
------
1. judge-independence  A model may not be its own judge. Self-judged scores are
   dropped by `excludeSelfJudged`, so the run burns a VM and fills zero cells.
   This is the 2026-08-29 incident: 294/294 docs exported, 0 cells gained.
2. golden-reachable    The golden URL must return a live doc count. `EXPORT_EXIT=0`
   against a wrong host is a false success — we shipped 546 docs into a
   nonexistent cluster before noticing.
3. golden-index        `.evaluation-scores` exactly; the `*` wildcard 404s on
   serverless, which reads as "index missing".
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

from model_ids import same_model, strip_connector_prefix

GOLDEN_INDEX = ".evaluation-scores"


def _fail(check: str, msg: str) -> None:
    print(f"FAIL [{check}] {msg}", file=sys.stderr)


def _ok(check: str, msg: str) -> None:
    print(f"  ok  [{check}] {msg}")


def check_judge_independence(models: list[str], judge: str) -> bool:
    """A model must never grade itself."""
    judge_c = strip_connector_prefix(judge)
    clashes = [m for m in models if same_model(m, judge)]
    if clashes:
        _fail(
            "judge-independence",
            f"judge '{judge}' (canonical '{judge_c}') is also under test: {clashes}. "
            "Its scores would be self-judged and dropped, filling zero cells. "
            "Pass a different --judge for these models.",
        )
        return False
    _ok("judge-independence", f"judge '{judge_c}' is not among the {len(models)} model(s) under test")
    return True


def check_golden(url: str, api_key: str) -> bool:
    """Prove the golden cluster is real by reading a doc count, not a 200."""
    if not url or not api_key:
        _fail("golden-reachable", "GOLDEN_ES_URL / GOLDEN_ES_API_KEY not set")
        return False

    endpoint = f"{url.rstrip('/')}/{GOLDEN_INDEX}/_count"
    req = urllib.request.Request(endpoint, headers={"Authorization": f"ApiKey {api_key}"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        _fail("golden-reachable", f"HTTP {exc.code} from {endpoint} — wrong host or bad key")
        return False
    except Exception as exc:  # noqa: BLE001 - any transport error is a hard fail
        _fail("golden-reachable", f"cannot reach {endpoint}: {exc}")
        return False

    count = body.get("count")
    if not isinstance(count, int):
        _fail("golden-reachable", f"no doc count in response: {body}")
        return False
    if count == 0:
        _fail("golden-reachable", f"{GOLDEN_INDEX} exists but is empty — suspect wrong cluster")
        return False
    _ok("golden-reachable", f"{GOLDEN_INDEX} live with {count:,} docs")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", nargs="+", required=True, help="connector ids under test")
    parser.add_argument("--judge", required=True, help="EVAL_CONNECTOR_ID used to grade")
    parser.add_argument("--skip-golden", action="store_true", help="offline check of judge only")
    args = parser.parse_args()

    print(f"Pre-flight: {len(args.models)} model(s), judge '{args.judge}'")
    results = [check_judge_independence(args.models, args.judge)]
    if not args.skip_golden:
        results.append(check_golden(os.environ.get("GOLDEN_ES_URL", ""), os.environ.get("GOLDEN_ES_API_KEY", "")))

    if not all(results):
        print("\nPRE-FLIGHT FAILED — sweep refused. Fix the above before spending VM time.", file=sys.stderr)
        return 1
    print("\nPRE-FLIGHT PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
