# Example-level shard fanout for persona-matrix evals

**Date:** 2026-09-03
**Branch:** `feat/evals-extensions-matrix-v3` (PR #285833)
**Problem owner:** slow-model matrix rows take ~2–3 h wall clock and block local RAM.

## Shape

### The problem, measured

Two OSS candidates were run through the 21-example persona matrix today:

| Model | calls/example | evaluated | wall clock | outcome |
|---|---|---|---|---|
| Qwen3.8-27B | 121.8 | 14/21 | ~150 min | killed, 0 scores |
| GLM-5.3-flash | 80.8 | 11/21 | 99 min (killed at 20/21 dispatched) | killed, 0 scores |
| frontier (gemini/claude/gpt) | 5–25 | 21/21 | 4–15 min | complete |

The suite has exactly two env knobs (`PERSONA_MATRIX_CAPTURE`,
`PERSONA_MATRIX_CONCURRENCY`) — verified by grepping `process.env` in the suite
source. There is **no way to run a subset of examples**, so:

- a slow model must complete all 21 examples in one process or produce nothing
  (scores export only at run end);
- the only parallelism knob is in-suite `concurrency`, which shares one Kibana
  and one ES on one host;
- `PERSONA_MATRIX_WORKERS` is unsafe: `beforeAll` seeds shared indices that
  `afterAll` deletes, so a second worker tears down live fixtures.

### Root cause of the wall clock

Not the harness. `MODEL_ENV` in `persona_matrix_sweep.py:112-118` already
documents this for GLM-5.2: *"mean 341s per example, max 1198s… 21 examples
therefore need ~119 min"*. Slow models are inherently slow per example. The
lever is **spreading examples across machines**, not making each faster.

### Chosen shape

Add an example-selection knob to the suite, then fan shards out as separate
Azure VMs — one stack per shard, which is the only safe form of parallelism
given the `beforeAll`/`afterAll` fixture contract.

```
today:   1 VM  x 21 examples  = 21 x per-example cost
sharded: 4 VMs x  5-6 examples = ~6 x per-example cost  (+ ~19 min stack boot)
```

For GLM at ~4.7 min/example: 99+ min → ~28 min + boot. For frontier models
(already 4–15 min) sharding is off by default — it would add boot overhead for
no gain.

### Explicitly out of scope

- **Capping agent cycles per model.** Changes what is measured; a truncated
  model scores its own truncation. Rejected on eval-integrity grounds.
- **Lowering concurrency.** Strictly worse wall clock.
- **Per-example result caching / resume.** Genuinely valuable (11 completed GLM
  examples were discarded on kill) but it is a *second* change with its own
  storage-format design. Separate PR.
- **Changing any Kibana product code.** Suite + sweeper only.
- **Making sharding the default for all models.** Opt-in per model.

### Alternatives considered

1. **`PERSONA_MATRIX_WORKERS` > 1 on one stack** — rejected, unsafe fixture
   teardown (documented in the suite and re-verified today).
2. **More in-suite concurrency on a bigger VM** — hits the same single-Kibana
   bottleneck that produced 69 transport blips and 4 hard failures locally at
   concurrency=5.
3. **Shard by example, one stack each** — chosen. Matches the existing
   per-model VM fanout pattern the sweeper already implements.

## Plan

Each step names how it is proven. No step is done until its proof runs.

### 1. Suite: `PERSONA_MATRIX_SHARD` env knob

`x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/src/`

Add a pure helper `selectShard(examples, shard)` where `shard` is `"i/n"`
(1-based, e.g. `"2/4"`). Deterministic stride assignment so shard membership
never depends on ordering luck: example at index `k` belongs to shard
`k % n + 1`. Absent/empty env ⇒ all examples (exact current behaviour).

**Proof:** new jest tests — union of all shards equals the full 21 with no
overlap; `"1/1"` is identity; malformed values (`"0/4"`, `"5/4"`, `"x/y"`,
`"1/0"`) throw rather than silently running everything. Then mutate the stride
to `k < n` (contiguous) and confirm the union/disjoint test still passes but the
balance test fails — proving the tests bite.

### 2. Suite: wire the knob into the spec

Read `process.env.PERSONA_MATRIX_SHARD` where the dataset is built, and include
the shard in the logged run header so a shard's log is identifiable.

**Proof:** `node scripts/jest` on the suite package green; grep the built
dataset length under a stubbed env.

### 3. Sweeper: `--shards N`

`scripts/orca_vm/persona_matrix_sweep.py`

- Add `PERSONA_MATRIX_SHARD` to `FORWARDED_ENV_VARS` (trap 5 in
  `vm-sweep-suite-port.md`: an unforwarded var silently grades the wrong thing).
- `--shards N` provisions N VMs per model, VM name suffix `-s<i>`.
- **Gate arithmetic must change.** `check_golden` computes
  `n_examples * n_evaluators * reps` with `gate: "exact"`. A shard produces only
  its slice, so a per-shard exact gate must expect that shard's example count,
  and the model is complete only when the union across shards equals the full
  expected count. Implement as: per-shard expected = `len(shard) * evaluators *
  reps`; model-level assertion sums shards.

**Proof:** extend `--self-test` with cases for shard env forwarding, per-shard
expected-doc arithmetic, and the union assertion. Mutate each new check to
confirm it fails.

### 4. Validate

- `node scripts/jest <suite package>` — full package, not a hand-picked file.
- `python3 persona_matrix_sweep.py --self-test` — all checks, each mutated.
- Confirm no dataset-UUID literal regression (existing self-test guard).

### 5. Smoke

One model, `--shards 4`, on Azure. Assert:
- 4 VMs provisioned, each `ps aux | grep playwright` shows the right config;
- each shard's local score index holds only its slice;
- union on **golden** equals the full expected doc count (trap 2: a green run
  does not mean scores reached golden);
- teardown prints the zero line.

### 6. End-to-end

The real target: GLM-5.3-flash, 21 examples, 4 shards, judge
`eis-anthropic-claude-4-6-sonnet`, scores landing on golden and the matrix
regenerating with a populated GLM row. This is the first complete OSS row.

### 7. Deslop + land

`deslop`, `pre-pr-self-review`, commit into PR #285833. Sweeper/suite sharding
is infrastructure for that PR's matrix work, not an unrelated platform change.

## Risks

- **Shard imbalance.** Stride assignment spreads cost, but the measured
  per-example span distribution is skewed (median 75 calls, max 280). One shard
  may still straggle. Accepted: even a 2× straggler beats 21 serial examples.
- **N× stack boot cost.** ~19 min per VM, paid in parallel. Sharding is a loss
  for fast models — hence opt-in.
- **Golden write races.** N shards writing one model's execution concurrently;
  the union gate must tolerate eventual consistency (retry the count, don't
  assert once).
