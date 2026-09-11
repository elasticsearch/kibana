# Re-judging a golden column

A rejudge run re-grades **existing** model outputs with a different judge. It does
not re-run the models, and it does not write to the golden cluster: it produces a
local artifact that [`mergeRejudgedScores`](../src/matrix/merge_rejudged_scores.ts)
applies to a board, keyed on `experiment_id`.

The Attack Discovery column is the motivating case. It is graded by a mix of
judges while the persona columns are graded by others, and no model is graded by
more than one judge anywhere on the board — so judge severity cannot be separated
from model quality, and a rejudge under one pinned judge is what would make the
column comparable.

## Prerequisite: CCM must be enabled on the eval stack

EIS-backed judges resolve through the ES inference catalog, which is populated by
the cross-cluster model service. On a freshly booted stack it is **off**, and the
catalog holds only the built-in endpoints:

```
GET  /_inference/_ccm          -> {"enabled": false}
```

Every EIS judge id then fails connector resolution:

```
No connector or inference endpoint found for ID 'eis-google-gemini-3-1-pro'
```

This reads like broken jury wiring or a bad route, but it is neither — the judge
model was never reachable. Enable CCM and wait for the catalog to sync:

```
PUT  /_inference/_ccm          # with the EIS CCM key
GET  /_inference/_all          # expect .google-gemini-3.1-pro-chat_completion
```

CCM state is **in-memory**, so it does not survive a stack restart and must be
re-applied on every boot.

## Failure mode 1: selection admits zero documents

**Symptom.** The run completes without error and reports `0` cells written. Logs
show the planner selecting an execution, then no scores.

**Cause.** The rejudge selects a golden execution to re-grade, and admission is
narrower than selection: an execution can be picked whose documents are then all
rejected (no gradable output, or an evaluator set that does not match what the
rejudge computes). Selection succeeding is not evidence that anything is gradable.

**What to check.** Count admitted documents for the chosen `experiment_id` before
believing a `0`-cell result is a judge problem. A zero-count query needs a
known-positive control — confirm the same query returns documents for an
execution you know is gradable, otherwise "no documents" and "wrong query" look
identical.

## Failure mode 2: the jury does not produce its evaluators

**Symptom.** Cells are planned and the run reports no failures, but the artifact
carries no `Criteria` / `Rubric` scores — or carries them on one run and not the
next, from an unchanged input. Observed oscillating between 0 and 4 cells across
consecutive runs on the same execution.

**Cause.** Not established. The judge is reachable (CCM verified, endpoint
present) and the run does not error, so this is distinct from mode 1 and from a
connector failure. Do not attribute it to "judge flake" — that names a cause
which has not been demonstrated. What is established is that a clean exit code
does not imply the evaluators ran.

**What to check.** Assert on the evaluator names actually present in the artifact
rather than on the exit code or the planned cell count. A rejudge that writes an
artifact containing none of the expected evaluators has failed, however it exited.

## Why the merge is keyed on `experiment_id`

A model appears many times on a board across executions. Keying a merge on model
id — or on model plus column — lets a rejudge of one execution overwrite a
different, possibly newer, execution of the same cell. `experiment_id` identifies
the run whose outputs were actually re-graded, so a merge can only ever replace
the scores it re-computed.

Re-judged cells that match no golden cell are **reported, not appended**: a
rejudge can only re-grade outputs that already exist, so a non-matching cell means
the artifact and the board disagree about what was run. Appending it would
fabricate a cell the board never had.
