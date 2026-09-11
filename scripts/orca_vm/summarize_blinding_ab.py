#!/usr/bin/env python3
"""Add cost and a distinguishability check to the blinding A/B result.

A mean delta means nothing without knowing whether 14 paired samples could
distinguish it from zero. Exact two-sided sign test on the non-zero pairs.
"""
import json
import math
import sys
from itertools import combinations

PATH = sys.argv[1]
# Opus-5 class pricing, USD per 1M tokens.
IN_RATE, OUT_RATE = 5.0, 25.0

d = json.load(open(PATH))
s = d["summary"]
u = s["usage"]

cost_in = u["prompt_tokens"] / 1e6 * IN_RATE
cost_out = u["completion_tokens"] / 1e6 * OUT_RATE
s["cost"] = {
    "inputUsd": round(cost_in, 4),
    "outputUsd": round(cost_out, 4),
    "totalUsd": round(cost_in + cost_out, 4),
    "rates": {"inputPerMTok": IN_RATE, "outputPerMTok": OUT_RATE},
    "note": "Opus-5 list pricing; the combo may route to a cheaper seat, so this is an upper bound.",
}

pairs = [(r["leaked"], r["blinded"]) for r in d["results"]
         if isinstance(r.get("leaked"), (int, float)) and isinstance(r.get("blinded"), (int, float))]
deltas = [a - b for a, b in pairs]
nz = [x for x in deltas if x != 0]
pos = sum(1 for x in nz if x > 0)
n = len(nz)

# Exact two-sided sign test.
if n:
    def C(k):
        return math.comb(n, k)
    tail = sum(C(k) for k in range(0, min(pos, n - pos) + 1))
    p = min(1.0, 2 * tail / (2 ** n))
else:
    p = 1.0

s["signTest"] = {
    "nonZeroPairs": n,
    "leakedHigher": pos,
    "blindedHigher": n - pos,
    "pValueTwoSided": round(p, 4),
    "distinguishableFromZero": p < 0.05,
    "interpretation": (
        "Cannot distinguish the leaked and blinded variants at n=14; this bounds the "
        "effect rather than showing there is none."
        if p >= 0.05 else
        "The hint moved scores by more than chance would explain."
    ),
}
s["scale"] = "0-10 judge rubric"

json.dump(d, open(PATH, "w"), indent=2)
print(json.dumps(s, indent=2))
