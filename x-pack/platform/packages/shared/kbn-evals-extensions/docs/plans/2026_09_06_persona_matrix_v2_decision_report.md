# Persona Matrix v2 — Decision-Oriented Model Comparison

**Date:** 2026-09-06
**Status:** shaped → planned → in execution
**Author:** agent (evals-ext-matrix)

## Problem

The v1 matrix renders 23 models × 24 prompt columns + an `Overall` mean, sorted by
`Overall`. It looks like a leaderboard, so readers use it as one. Measured against
the actual data in `target/llm_matrix_latest/matrix.json`, that reading is unsound.

### Finding 1 — the ranking is noise

Paired bootstrap over the 24 prompt columns (models face identical prompts, so the
comparison must be paired), 4000 resamples, 18 fully-measured models:

- **17 of 17 adjacent rank pairs are statistically indistinguishable** (95% CI of the
  paired difference contains 0).
- The **#1 model is significantly better than only 8 of 17** others.
- Mean 95% CI width per model is **1.24 points**; the entire spread between best and
  worst fully-measured model is **1.53 points**. Each model's own uncertainty is
  nearly as wide as the whole field.
- 16 of 22 adjacent `Overall` gaps are **< 0.10 points**.

Presenting rank 3 above rank 16 (6.87 vs 6.20) implies a distinction the evidence
does not support.

### Finding 2 — averaging destroys real signal

Every prompt discriminates well: per-prompt stdev across models ranges 0.52–2.47,
with per-prompt ranges up to 7.2 points. The signal is strong *per prompt* and is
cancelled by the mean.

Rank correlation between the 10 task families:

- **Mean off-diagonal Spearman r = 0.037** (essentially zero).
- **39 of 45 family pairs have r < 0.3** — largely independent skills.
- **20 of 45 pairs are negatively correlated** — genuine tradeoffs.

There is no general "good at security" axis to average toward. Consequences:

- **8 distinct models win the 10 families.**
- The `Overall` #1 (Claude Sonnet 4.6) **wins only 1 of 10 families**.
- Sonnet 4.6 is best at entity-analytics (9.26) and **last** at rule translation (4.57).
- DeepSeek V4 Pro is best at alert-analysis (8.18) and worst at attack-discovery (**1.11**).

A user who picks the `Overall` winner for rule translation gets the worst model in
the field for that job.

### Finding 3 — the deciding axis is missing

Cost and latency exist in the trace cache but are shown only as incidental
evaluator rows, for one column (`attack-discovery`) in `tokenCost`. Real values:

| Model | Quality | Latency | Input tokens |
|---|---|---|---|
| GPT-5.2 | 6.87 | 144.2s | 696,311 |
| Claude Haiku 4.5 | 6.76 | 24.9s | 129,775 |

A **0.11 quality difference — statistically zero — for 5.8× latency and 5.4× tokens.**

Across the field, `corr(quality, latency) = +0.24` and
`corr(quality, input tokens) = +0.36`: paying more buys little.

Pareto analysis (maximize quality, minimize latency and tokens) finds **only 4 of 21
models undominated**. The other 17 are strictly worse choices — some model is at
least as accurate while being both faster and cheaper.

### Finding 4 — partial rows rank as if complete

`Overall` is the mean of whatever cells exist. GLM-5.2 ranks **#2 overall on 4 of 24
cells**; GLM-5.3 Flash ranks #17 on **1** cell. Both outrank fully-measured models on
a fraction of the evidence.

## What users actually need

The matrix answers "which model is best?" — a question the data cannot support.
Users decide among three real questions:

1. *I run task X — which model should I use?* → per-family winners with uncertainty.
2. *What does it cost me?* → quality vs latency/tokens, Pareto frontier.
3. *Can I trust this number?* → CI, sample size, judge, coverage.

## Shape

Keep the existing per-prompt grid — it is the evidence, and it is sound. Change
what is emphasized and what is claimed.

### S1. Replace the ranked `Overall` with tiers
Cluster models into statistically indistinguishable tiers via paired bootstrap.
Within a tier, order alphabetically — never by an insignificant decimal. Every
tier boundary must be backed by a non-overlapping CI.

### S2. Lead with per-task recommendations
For each of the 10 families, show the winner set (all models whose CI overlaps the
best), not a single winner. Surface tradeoffs: "best at X, worst at Y."

### S3. Add the efficiency frontier
Quality vs cost, marking dominated models explicitly. This is the highest-value
view and is currently absent.

### S4. Honest uncertainty everywhere
Every aggregate carries CI and n. Partial rows are visually segregated and never
ranked against complete ones.

### S5. Suppress known-bad instruments
`Tool Calls = 0` rows are an instrument defect (user standing rule: never publish).
Suppress rather than render zero.

## Plan

| # | Step | Validation |
|---|---|---|
| 1 | `model_comparison.ts`: paired bootstrap, tiers, Pareto, family winners | unit tests + mutation |
| 2 | Golden contract test on real bundle | reproduces findings above |
| 3 | Render v2 sections into matrix HTML (dark mode) | geometry check |
| 4 | End-to-end on `llm_matrix_latest` | numbers match this doc |

## Non-goals

- No re-running of evals; v2 is a presentation change over existing data.
- No new judge; haiku remains judge of record.
- No score mutation — v2 must reproduce v1 cell values exactly.
