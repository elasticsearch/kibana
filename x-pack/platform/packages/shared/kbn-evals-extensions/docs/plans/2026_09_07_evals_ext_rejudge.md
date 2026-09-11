# `evals ext rejudge` — judge-only replay

## Problem

The published matrix is graded by three different judges: 17 rows by
`anthropic-claude-4.6-sonnet`, 1 by `anthropic-claude-4.5-haiku`
(Claude Sonnet 4.6, which the self-judge guard correctly diverted), and 1 by
`google-gemini-3.1-pro` (GPT-OSS 120B). Rows graded by different judges are not
comparable, and both headline claims — the #1 model and the OSS separation —
rest on the two minority-judge rows.

Re-running the sweep to unify the judge costs ~68min and 25 VMs, ~83% of which
is provisioning. It also confounds the judge change with run-to-run variance.

## Shape

Re-judge from stored trajectories. Every input a judge reads is already durable
in golden score documents (`example.input.question`, `task.output.messages`);
the dataset supplies `reference`. Verified: all 20 models have 21/21 examples
with non-empty stored outputs (Sonnet 4.5 has 19).

**In scope**: recompute the LLM-judged evaluators — `CorrectnessAnalysis` and
`GroundednessAnalysis`, and the deterministic scores derived from them
(`Factuality`, `Relevance`, `Sequence Accuracy`, `Groundedness`).

**Carried forward unchanged**: trace-based evaluators (`SkillInvoked`, Input/
Output Tokens, Latency, Tool Calls). These read spans, not outputs, and a judge
swap cannot change them. They are copied from the source run, not recomputed
and not dropped.

**Out of scope**: re-running agents; changing prompts; writing to golden in this
change (local artifact first).

## Decisions

- Two passes per model: **non-blind** (parity with existing sonnet scores) and
  **blind** (model identity stripped, as the original eval bundle does via
  `obfuscate_agent_eval.py`). Running both makes identity bias measurable
  instead of assumed.
- Output to a local JSON artifact for review. Golden write is a follow-up,
  gated on inspecting the deltas.
- Re-judged scores keyed by `replayExecutionId()` = `<execId>::rejudge-<tag>`
  so a judge's verdicts never merge into the source execution's cell.

## Steps

1. **Reference join** — `--dataset` flag loading the suite dataset, mapping
   `exampleId -> reference`. Prove: a plan built without it reports every cell
   as skipped (`missing dataset reference`) rather than grading against empty
   ground truth.
2. **Anonymizer** — `anonymizeCell()` stripping model identity from judge-visible
   text. Prove: unit test asserting a known model id/name/vendor string does not
   survive into the judge payload, including inside the agent response body.
3. **Judge runner** — drive `createCorrectnessAnalysisEvaluator` +
   `createGroundednessAnalysisEvaluator` over plan cells with bounded
   concurrency; recompute quantitative scores from the returned analyses.
4. **CLI** — `rejudgeCmd` registered in `cli/index.ts`; flags `--config`,
   `--judge`, `--dataset`, `--blind`, `--out`, `--concurrency`, `--as-of`,
   `--models`, `--dry-run`.
5. **Validate** — jest for kbn-evals-extensions; mutation-test each new guard.
6. **Smoke** — `--dry-run` on real golden data: plan size must equal the 20×21
   cells measured, skipped must be 0.
7. **E2E** — real haiku judge over all 20 models, both passes, real inference.

## Verification

- Plan cell count matches the independently measured 419 (20 models × 21, minus
  2 missing Sonnet 4.5 examples).
- `--dry-run` costs nothing and writes nothing.
- Blind pass: assert no model identifier appears in any judge payload.
- Deltas reported per model as haiku-vs-sonnet on identical trajectories.
