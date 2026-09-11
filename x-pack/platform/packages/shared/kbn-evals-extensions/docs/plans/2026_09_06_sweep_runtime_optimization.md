# Sweep runtime optimization — plan (2026-09-06)

## Problem (measured, A3 re-judge: 26 units, D8s_v5 eastus2)

| Phase | Time |
|---|---|
| sweep start -> first golden score doc | 39 min |
| median eval work per unit | 11.7 min |
| total wall clock | ~68 min |
| spot `az vm create` failures before Regular fallback | 30 / 60 |

~83% of wall clock is fixed per-VM overhead. Sharding divides only the 12-minute
slice, so past ~3 shards the curve is flat. Cut overhead, not example count.

## Shape

Four changes, ordered by payoff. Each is independently shippable and independently
verifiable. Out of scope: changing what is measured (evaluator logic, judge
prompts, example set) — a speedup that moves scores is a measurement change, not
an optimization.

### 1. `evals ext rejudge` — VM-free judge-only re-scoring  [biggest win]

A re-judge today re-runs the entire agent (fresh ES + Kibana + seed + 21 personas)
purely to change the final judge call. Golden score docs already carry everything
a judge needs:

- `example.input.question`, `example.metadata`
- `task.output.messages` (final answer)
- `task.output.steps` (~38 KB trajectory)
- `task.model.id`, `task.trace_id`, `metadata.execution_id`

`evaluate_dataset.ts` computes `correctnessAnalysis` / `groundednessAnalysis`
inside the task and the quantitative evaluators are pure functions of those
analyses. So a re-judge is: read golden docs -> re-run the two analyses + the
`criteria` evaluator against a new judge connector -> write new score docs under a
fresh `execution_id`.

Not portable to re-judge: trace-based evaluators (`Latency`, `Tokens`,
`Tool Calls`, `SkillInvoked`) read spans, not task output. They must be **carried
over unchanged** from the source docs, never recomputed and never silently
dropped.

Cost: ~2 h + full Azure quota -> ~5 min, zero VMs.

### 2. Warm deallocated VM pool

Deallocated VMs consume no vCPU quota (the RG held 85 VMs against a 43-VM quota
footprint). `az vm start` on a pre-baked VM is ~60-90 s vs ~6-8 min for
create + cloud-init + deploy. Fixed pool footprint also removes the quota cliff
that cost ~10 h.

### 3. Regular-first provisioning

Spot D8s_v5 in eastus2 has been exhausted for days; spot-first burns an ARM
roundtrip plus backoff per VM before falling back anyway (30/60 failures
measured). Probe spot once per sweep, not per VM.

### 4. Pre-flight quota gate + completeness-safe teardown

Refuse to launch when `requested_cores > free_cores`. And fix the teardown
matcher: golden ids are `sweep-<ts>-<suffix>-<shard>::<suite>::<model>` — the
shard sits BEFORE the suite, so a `sweep-*-<model>-<shard>` tail wildcard matches
nothing and completeness-gated teardown silently deletes zero VMs (this is what
exhausted quota twice today).

## Plan

| # | Step | Proof |
|---|---|---|
| 1 | `rejudge.ts`: read golden docs for a run/model, group by example | unit test on fixture docs |
| 2 | Re-run correctness+groundedness+criteria with `--judge`, carry trace evaluators verbatim | unit test: trace evaluators pass through unchanged; mutation test |
| 3 | Write new score docs w/ fresh `execution_id`, `evaluator.model.id` = new judge | unit test on emitted doc shape |
| 4 | Wire `rejudgeCmd` into `evals ext` CLI | `node scripts/evals ext rejudge --help` runs |
| 5 | `--regular-first` default in `persona_matrix_sweep.py` | unit test on the create-arg builder |
| 6 | Quota preflight gate refusing over-subscription | unit test: over-quota request refused, under-quota allowed |
| 7 | Teardown matcher fixed to the real id shape | unit test with a real id string (bites the bug that shipped) |
| 8 | Warm-pool start/stop path | `--pool` deallocate/start against a real VM |

## Validation

- Jest on both packages (`--maxWorkers=4`; Kibana's wrapper rejects
  `--workerIdleMemoryLimit`).
- Mutation-test every fix: revert -> observe red for the right reason -> restore.
- E2E: run `evals ext rejudge` against real golden data for a model whose haiku
  judgement is already known, and compare against the VM-produced scores for the
  same cells. Agreement on deterministic/pass-through columns must be exact;
  LLM columns compared as a distribution.

## Non-goals

- No change to evaluator semantics, judge prompts, or the example set.
- No new judge default (haiku remains judge of record).
- Trace evaluators are carried, never recomputed from a re-judge.
