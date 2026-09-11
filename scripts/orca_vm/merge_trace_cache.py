#!/usr/bin/env python3
"""Merge trace caches so adding one model does not require re-pulling every model.

Why this exists
---------------
`build_trace_cache.py` pulls EVERY model's score documents for the whole lookback
window (2431 cells / 188 MB on 2026-09-02, several minutes against golden). When
a single new model lands, only its own cells are new. This merges a small
freshly-pulled cache on top of the existing one.

Cache keys are `${metadata.execution_id}::${example.id}`, and execution_id embeds
the model, so a new model's keys can never collide with an existing model's. A
RE-RUN of an existing model does produce new execution_ids, which is why the
merge is additive: the matrix generator's own pickLatestExperimentPerModel
decides which execution wins at render time, not this script.

Usage
-----
    # pull only what is new (small --hours window)
    source /tmp/golden-cluster-env.sh
    python3 build_trace_cache.py --out /tmp/trace_cache_newmodel.json --hours 48
    python3 merge_trace_cache.py --base /tmp/trace_cache_v5.json \
        --overlay /tmp/trace_cache_newmodel.json --out /tmp/trace_cache_v6.json
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

# Node aborts readFileSync above its max string length (0x1fffffe8, ~536 MB);
# same ceiling build_trace_cache.py enforces. A merge is the most likely way to
# cross it, so re-check here rather than discovering it in the CLI.
MAX_CACHE_BYTES = 500_000_000


def model_of(docs: list) -> str | None:
    if not docs:
        return None
    return ((docs[0].get("task") or {}).get("model") or {}).get("id")


def merge(base: dict, overlays: list[dict]) -> tuple[dict, dict]:
    """Overlay wins on key collision (a re-pull of the same execution is fresher)."""
    merged = dict(base)
    stats = {"base_keys": len(base), "added": 0, "replaced": 0}
    for overlay in overlays:
        for key, docs in overlay.items():
            if key in merged:
                stats["replaced"] += 1
            else:
                stats["added"] += 1
            merged[key] = docs
    stats["merged_keys"] = len(merged)
    return merged, stats


def model_counts(cache: dict) -> collections.Counter:
    counts: collections.Counter = collections.Counter()
    for docs in cache.values():
        model = model_of(docs)
        if model:
            counts[model] += 1
    return counts


def self_test() -> int:
    failures = []

    def check(name, got, want):
        if got != want:
            failures.append(f"{name}: got {got!r} want {want!r}")

    base = {"exec-a::security-persona-matrix::m1::ex1": [{"task": {"model": {"id": "m1"}}}]}
    overlay = {"exec-b::security-persona-matrix::m2::ex1": [{"task": {"model": {"id": "m2"}}}]}
    merged, stats = merge(base, [overlay])
    check("disjoint merge size", len(merged), 2)
    check("disjoint added", stats["added"], 1)
    check("disjoint replaced", stats["replaced"], 0)

    # A re-pull of the SAME key must take the overlay's docs, not the base's.
    collide = {"exec-a::security-persona-matrix::m1::ex1": [{"task": {"model": {"id": "m1"}}, "fresh": True}]}
    merged2, stats2 = merge(base, [collide])
    check("collision replaced", stats2["replaced"], 1)
    check("collision keeps overlay", merged2["exec-a::security-persona-matrix::m1::ex1"][0].get("fresh"), True)

    check("model counts", dict(model_counts(merged)), {"m1": 1, "m2": 1})
    check("empty docs ignored", dict(model_counts({"k": []})), {})

    for failure in failures:
        print(f"FAIL {failure}", file=sys.stderr)
    print(f"self-test: {len(failures)} failure(s)")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", help="existing cache to build on")
    parser.add_argument("--overlay", action="append", default=[],
                        help="cache(s) to merge in; repeatable, later wins")
    parser.add_argument("--out")
    parser.add_argument("--self-test", action="store_true",
                        help="Verify the merge contract offline and exit.")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    if not args.base or not args.overlay or not args.out:
        print("--base, --overlay and --out are required", file=sys.stderr)
        return 2

    with open(args.base) as handle:
        base = json.load(handle)
    overlays = []
    for path in args.overlay:
        with open(path) as handle:
            overlays.append(json.load(handle))

    merged, stats = merge(base, overlays)

    before = model_counts(base)
    after = model_counts(merged)

    with open(args.out, "w") as handle:
        json.dump(merged, handle)

    size = os.path.getsize(args.out)
    print(f"base keys   : {stats['base_keys']}")
    print(f"added       : {stats['added']}")
    print(f"replaced    : {stats['replaced']}")
    print(f"merged keys : {stats['merged_keys']}")
    print(f"written     : {args.out} ({size / 1e6:.0f} MB)")
    if size > MAX_CACHE_BYTES:
        print(f"FATAL: cache exceeds Node's readFileSync string cap "
              f"({size} > {MAX_CACHE_BYTES}); the matrix CLI cannot read it",
              file=sys.stderr)
        return 1

    new_models = sorted(set(after) - set(before))
    if new_models:
        print("new models  : " + ", ".join(f"{m} ({after[m]} cells)" for m in new_models))
    grown = sorted(m for m in set(after) & set(before) if after[m] != before[m])
    for model in grown:
        print(f"grew        : {model} {before[model]} -> {after[model]} cells")
    if not new_models and not grown:
        print("new models  : none -- the overlay added no cells for any model")
    return 0


if __name__ == "__main__":
    sys.exit(main())
