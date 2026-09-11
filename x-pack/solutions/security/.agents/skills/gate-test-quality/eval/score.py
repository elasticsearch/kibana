#!/usr/bin/env python3
"""Score gate-test-quality blind-agent eval runs against GROUND_TRUTH.md.

Usage: python3 score.py <verdicts.json>
  verdicts.json: [{"fixture": "p1"|"p2", "run": 1, "model": "...",
                   "found_defect_step": "...", "defect_approval_missing": true,
                   "vacuous_assertions_identified": true, "false_positive_steps": [...]}]
  Fixture p1 additionally honors "defect_kind" absence (defaults handled below).
Prints per-run PASS/FAIL and the aggregate pass rate; exit 0 if all runs pass.
"""
import json
import sys
import pathlib

# --- Fixture 1 (Pattern 1: vacuous assertions / dropped approval clause) ---
P1_EXPECTED_STEP = "apply_disable_tuning"
P1_HEALTHY_STEPS = {
    "apply_query_tuning",
    "apply_exception_tuning",
    "apply_suppression_tuning",
    "apply_risk_score_tuning",
}

# --- Fixture 2 (Pattern 2: gate-vs-schema, missing rule-type check) ---
P2_EXPECTED_HINTS = (
    "suppression",  # any verdict naming the suppression path
)
P2_TYPE_CHECK_SIGNALS = (
    "type",
    "rule_type",
    "fetch_rule.output.type",
    "schema",
    "query/saved_query/eql/threshold",
)
P2_HEALTHY_GATES = {"can_apply_query", "apply_query_tuning"}


def score_p1(v: dict) -> list[str]:
    errs = []
    step = (v.get("found_defect_step") or "").strip().lower()
    if P1_EXPECTED_STEP not in step:
        errs.append(
            f"defect step mismatch: got {v.get('found_defect_step')!r}, want *{P1_EXPECTED_STEP}*"
        )
    if not v.get("defect_approval_missing"):
        errs.append("approval-clause absence not identified")
    if not v.get("vacuous_assertions_identified"):
        errs.append("no vacuous assertion identified")
    fp = [s for s in (v.get("false_positive_steps") or []) if str(s).strip().lower() in P1_HEALTHY_STEPS]
    if fp:
        errs.append(f"false positive(s) on healthy gates: {fp}")
    return errs


def score_p2(v: dict) -> list[str]:
    errs = []
    step = (v.get("found_defect_step") or "").strip().lower()
    if not any(h in step for h in P2_EXPECTED_HINTS):
        errs.append(
            f"defect step mismatch: got {v.get('found_defect_step')!r}, want a suppression-path step "
            f"(apply_suppression_tuning / can_apply_suppression / classify_proposal)"
        )
    detail = " ".join(
        str(v.get(k) or "") for k in ("defect_kind", "vacuous_assertions_detail", "notes")
    ).lower()
    type_check_named = any(sig in detail for sig in P2_TYPE_CHECK_SIGNALS)
    if not type_check_named:
        errs.append(
            "missing-rule-type-check not identified: verdict does not name the "
            "fetch_rule.output.type / schema precondition the suppression gate must assert"
        )
    if not v.get("vacuous_assertions_identified"):
        errs.append("no vacuous assertion identified")
    fp = [s for s in (v.get("false_positive_steps") or []) if str(s).strip().lower() in P2_HEALTHY_GATES]
    if fp:
        errs.append(f"false positive(s) on the healthy query gate: {fp}")
    return errs


def score_run(v: dict) -> tuple[bool, list[str]]:
    fixture = (v.get("fixture") or "p1").strip().lower()
    errs = score_p1(v) if fixture == "p1" else score_p2(v)
    return (not errs), errs


def main() -> int:
    raw = pathlib.Path(sys.argv[1]).read_text().strip()
    verdicts = json.loads(raw) if raw else []
    passes = 0
    for v in verdicts:
        ok, errs = score_run(v)
        passes += ok
        fx = (v.get("fixture") or "p1")
        status = "PASS" if ok else "FAIL"
        print(f"[{fx}] run {v.get('run', '?')} [{v.get('model', '?')}]: {status}")
        for e in errs:
            print(f"    - {e}")
    n = len(verdicts)
    print(f"\naggregate: {passes}/{n} pass ({passes / n:.0%})" if n else "no runs")
    return 0 if passes == n and n > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
