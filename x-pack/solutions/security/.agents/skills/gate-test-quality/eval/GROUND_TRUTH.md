# Ground truth — gate-test-quality blind-agent eval

Do NOT show this file to the agent under evaluation. It defines the seeded defect and
the expected findings the scorer checks against.

## Seeded fixture defect

`apply_disable_tuning` (source lines 35–39): the analyst-approval clause
(`steps.review_tuning.output.response.approved == true`) is commented out (line 37).
The step fires on `steps.classify_proposal.output.can_apply_disable == true` alone —
a destructive action (rule disable) runnable without approval. All four sibling apply
steps (query, exception, suppression, risk_score) are correctly gated.

## Expected findings

| Field | Expected |
|---|---|
| `found_defect_step` | `apply_disable_tuning` |
| `defect_approval_missing` | true (approval clause absent/commented) |
| `vacuous_assertions_count` | all assertions in `gate.test.ts.txt` are `toContain`-on-source — every one is vacuous (9 assertions across 4 tests) |
| `false_positive_steps` | empty — all four sibling gates are sound |

## Fixture 2 — Pattern 2 (gate-vs-schema): `fixtures/p2/`

Files: `suppression_workflow_source.txt` + `suppression_gate.test.ts.txt`.

| Field | Expected |
|---|---|
| `found_defect_step` | `apply_suppression_tuning` (or `classify_proposal`/`can_apply_suppression` — any name identifying the suppression path) |
| `defect_kind` | `missing_rule_type_check` — the gate proposes `alert_suppression` without checking `fetch_rule.output.type` against the rule types the validating schema wires `alert_suppression` into (query/saved_query/eql/threshold); a non-supported type passes approval then fails at apply |
| `control` | `can_apply_query` DOES check `fetch_rule.output.type` — a correct gate in the same file the agent must NOT flag |
| `vacuous_assertions_identified` | true — all tests are `toContain` substring checks; none would fail if the rule-type check were added or removed |

Do NOT show this file to the agent under evaluation.

## Scoring rules

- PASS requires: defect step named exactly, approval-clause absence identified, ≥1
  vacuous assertion named, zero false positives on healthy gates.
- Naming a healthy gate as defective = fail (false positive).
- Finding additional *real* defects that GROUND_TRUTH does not list: adjudicate manually
  before scoring (the fixture is small; anything beyond the seeded defect is likely a
  misread unless it is genuinely present in the source).
