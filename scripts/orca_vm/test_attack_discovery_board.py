#!/usr/bin/env python3
"""Guards for the attack-discovery board.

Outcome-based: assert what lands in the HTML, not flag plumbing.
2026-09-11: aligned to the 9f7de5c renderer contract (--aggregate/--out/
--missing). False-green reporting moved to render_false_green_bug_report.py.
"""
import json
import subprocess
import sys
import tempfile
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RENDER = os.path.join(HERE, "render_attack_discovery_board.py")

# One model with data at every assertable shape: mean/n cell, latency, blank
# totalRisk (absent field -> BLANK marker, never imputed), trace cards.
BASE = {
    "suiteId": "attack-discovery-agent-builder",
    "sourceDocCount": 100,
    "reportedTotal": 100,
    "modelCount": 1,
    "absentFields": ["totalRisk"],
    "models": [
        {
            "modelId": "test-model",
            "docs": 50,
            "datasets": 2,
            "discoveryCount": {"mean": 0.875, "n": 40},
            "alertsContextCount": {"mean": 2.5, "n": 40},
            "validatedDiscoveryCount": {"mean": 0.8, "n": 40},
            "status": {"completedRate": 1.0, "counts": {"completed": 40}, "n": 40},
            "latencySeconds": 35.7,
            "generateLatencySeconds": 35.7,
            "totalRisk": None,
            "generateErrors": [],
            "evaluators": {"Latency": {"mean": 35.7, "n": 40}},
            "traceCards": [
                {
                    "executionId": "exec0001abcdef012345",
                    "traceId": "trace0001234567890abcdef",
                    "insightCount": 2,
                    "insights": [
                        {
                            "title": "Beaconing to rare domain",
                            "risk_score": 65,
                            "mitre_attack_tactics": ["command-and-control"],
                            "summary_markdown": "Multiple alerts reference a rare domain.",
                        },
                        {
                            "title": "Cred dump via LSASS access",
                            "risk_score": 90,
                            "mitre_attack_tactics": ["credential-access"],
                            "summary_markdown": "LSASS access from a workstation.",
                        },
                    ],
                }
            ],
        }
    ],
}


def render(agg, missing=()):
    """Run the real renderer via its CURRENT CLI. Returns (returncode, html)."""
    with tempfile.TemporaryDirectory() as d:
        a = os.path.join(d, "agg.json")
        o = os.path.join(d, "out.html")
        with open(a, "w") as fh:
            json.dump(agg, fh)
        cmd = [sys.executable, RENDER, "--aggregate", a, "--out", o]
        if missing:
            m = os. path.join(d, "missing.json")
            with open(m, "w") as fh:
                json.dump(list(missing), fh)
            cmd += ["--missing", m]
        p = subprocess.run(cmd, capture_output=True, text=True)
        out = open(o).read() if os.path.exists(o) else ""
        return p.returncode, out
# PLACEHOLDER_CHECKS
failures = []
def check(name, got, expected):
    if got != expected:
        failures.append(f"FAIL: {name}")
        print(f"FAIL: {name} | got {got!r} expected {expected!r}")
    else:
        print(f"ok: {name}")


rc, out = render(BASE)
check("renderer exits 0 on a valid aggregate", rc, 0)
check("discoveryCount mean reaches HTML", ">1<span" in out, True)
check("coverage n rides the cell", "n=40" in out, True)
check("latency reaches HTML", "35.7s" in out, True)
check("blank marker for absent totalRisk", 'title="no source field in our schema"' in out, True)
check("trace card insight title present", "Beaconing to rare domain" in out, True)
check("trace card risk chip", "risk 90" in out, True)
check("no hand-edited placeholder numbers", "PLACEHOLDER" not in out, True)

MISSING_AGG = json.loads(json.dumps(BASE))
MISSING_AGG["modelCount"] = 2
rc2, out2 = render(MISSING_AGG, missing=({"model": "ghost-model", "reason": "no EIS connector"},))
check("render with missing rows exits 0", rc2, 0)
check("missing model named on board", "ghost-model" in out2, True)
check("missing reason rides the row", "no EIS connector" in out2, True)

EMPTY = json.loads(json.dumps(BASE))
EMPTY["models"] = []
rc3, _ = render(EMPTY)
check("empty aggregate refused", rc3 != 0, True)

VACUOUS = json.loads(json.dumps(BASE))
VACUOUS["models"][0]["discoveryCount"]["mean"] = None
rc4, _ = render(VACUOUS)
check("all-null discovery board refused", rc4 != 0, True)


if failures:
    print(f"\n{len(failures)} failure(s)")
    sys.exit(1)
print("\nall checks passed")
