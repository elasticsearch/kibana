#!/usr/bin/env python3
"""Per-field diff between the reference artifact and our golden board.

Criterion 7: any claim of "1:1" must be backed by a field-level diff, not by
visual similarity. This script produces that evidence -- and, run against the
current data, is precisely what refutes the 1:1 claim.

It NEVER copies a reference value into our data. Reference numbers are read
only to be compared and reported as differing.
"""
import argparse
import html
import json
import re
import sys


def parse_reference(path):
    """Extract per-model rows from the reference HTML scoreboard."""
    text = open(path, encoding="utf-8", errors="replace").read()
    rows = {}
    for raw in re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S):
        cells = [
            re.sub(r"<[^>]+>", "", c).strip()
            for c in re.findall(r"<td[^>]*>(.*?)</td>", raw, re.S)
        ]
        if len(cells) < 6:
            continue
        label = html.unescape(cells[0])
        parts = [p.strip() for p in label.split("\n") if p.strip()]
        model_id = parts[-1] if len(parts) > 1 else parts[0]
        rows[model_id] = {
            "status": cells[1],
            "discoveries": cells[2],
            "alertsInContext": cells[3],
            "latency": cells[4],
            "totalRisk": cells[5],
        }
    return rows


def ours_field(model):
    """Normalise our aggregate row onto the reference's field names."""
    disc = model["discoveryCount"]["mean"]
    alerts = model["alertsContextCount"]["mean"]
    rate = model["status"]["completedRate"]
    return {
        "status": None if rate is None else ("succeeded" if rate >= 0.99 else f"partial ({rate:.0%})"),
        "discoveries": None if disc is None else round(disc, 2),
        "alertsInContext": None if alerts is None else round(alerts, 2),
        "latency": None if model["latencySeconds"] is None else f'{model["latencySeconds"]}s',
        "totalRisk": model["totalRisk"],
    }


FIELDS = ["status", "discoveries", "alertsInContext", "latency", "totalRisk"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True)
    ap.add_argument("--aggregate", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    ref = parse_reference(args.reference)
    agg = json.load(open(args.aggregate))
    ours = {m["modelId"]: m for m in agg["models"]}

    if not ref:
        sys.exit("parsed zero rows from the reference -- refusing to write a vacuous diff")

    overlap = sorted(set(ref) & set(ours))
    ref_only = sorted(set(ref) - set(ours))
    ours_only = sorted(set(ours) - set(ref))

    per_model = {}
    identical_fields = differing_fields = absent_fields = 0
    for mid in overlap:
        r, o = ref[mid], ours_field(ours[mid])
        fields = {}
        for f in FIELDS:
            rv, ov = r[f], o[f]
            if ov is None:
                verdict = "absent-in-ours"
                absent_fields += 1
            elif str(rv) == str(ov):
                verdict = "identical"
                identical_fields += 1
            else:
                verdict = "differs"
                differing_fields += 1
            fields[f] = {"reference": rv, "ours": ov, "verdict": verdict}
        per_model[mid] = fields

    total = identical_fields + differing_fields + absent_fields
    payload = {
        "referenceModels": len(ref),
        "ourModels": len(ours),
        "overlap": len(overlap),
        "referenceOnly": ref_only,
        "oursOnly": ours_only,
        "fieldTotals": {
            "identical": identical_fields,
            "differs": differing_fields,
            "absentInOurs": absent_fields,
            "comparable": total,
        },
        "isOneToOne": differing_fields == 0 and absent_fields == 0 and not ref_only,
        "perModel": per_model,
    }
    with open(args.out, "w") as fh:
        json.dump(payload, fh, indent=2)

    pct = 100 * identical_fields / total if total else 0
    print(f"reference models : {len(ref)}")
    print(f"our models       : {len(ours)}")
    print(f"overlap          : {len(overlap)}")
    print(f"reference-only   : {len(ref_only)}")
    print(f"fields identical : {identical_fields}/{total} ({pct:.1f}%)")
    print(f"fields differing : {differing_fields}")
    print(f"fields absent    : {absent_fields}")
    print(f"1:1 reproduction : {payload['isOneToOne']}")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
