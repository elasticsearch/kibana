/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvalsClient } from '@kbn/evals';
import type { EvaluationScoreDocument } from '@kbn/evals-common';
import type { AggregatedModelScores } from './query_matrix_scores';
import type { MatrixTraceData, MatrixTraceEntry, TraceStep } from './trace_types';
import { traceKey } from './trace_types';
import type { PathContract } from './trajectory_agreement';
import { answersFromDocs, pathContractFromDocs, trailsFromDocs } from './trajectory_agreement';

/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving input
 * order in the returned array. Package intentionally has zero dependencies,
 * so this is a small local worker pool instead of p-limit.
 */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/**
 * Extracts trace data (initial question, tool trail, agent answer, step trace)
 * from a single evaluation score document.
 *
 * Score documents store the full `task.output` which contains:
 * - `steps`: array of `{ type: "reasoning"|"tool_call"|"relevant_skills", ... }`
 * - `messages`: array of `{ message: string }` (the agent's final answer)
 * And `example.input.question` holds the initial user question.
 */
const extractTraceFromScore = (score: EvaluationScoreDocument): MatrixTraceEntry => {
  const question = (score.example?.input as { question?: string } | null)?.question;
  const taskOutput = score.task?.output as
    | {
        steps?: Array<Record<string, unknown>>;
        messages?: Array<{ message?: string }>;
      }
    | null
    | undefined;

  const steps: TraceStep[] = [];
  const toolTrail: string[] = [];

  for (const step of taskOutput?.steps ?? []) {
    const stepType = step.type as string | undefined;
    if (stepType === 'tool_call') {
      const toolId = step.tool_id as string | undefined;
      if (toolId) {
        toolTrail.push(toolId);
      }
      // Live score docs store arguments under `params`. `args` is the name this
      // extractor originally guessed; 0/363 tool_call steps on golden carried it.
      const rawParams = step.params ?? step.args;
      steps.push({
        type: 'tool',
        toolId,
        toolParams: rawParams ? JSON.stringify(rawParams).slice(0, 300) : undefined,
      });
    } else if (stepType === 'reasoning') {
      steps.push({
        type: 'reasoning',
        text: (step.reasoning as string | undefined)?.slice(0, 500),
      });
    } else if (stepType === 'relevant_skills') {
      const skills = Array.isArray(step.skills)
        ? (step.skills as Array<{ id?: string }>)
            .map((s) => s.id)
            .filter((id): id is string => Boolean(id))
        : undefined;
      steps.push({ type: 'skill', skills });
    }
  }

  // The final answer is the last non-empty message
  let answer: string | undefined;
  for (const msg of taskOutput?.messages ?? []) {
    const content = msg.message;
    if (content && content.length > 50) {
      answer = content;
    }
  }

  return {
    question,
    toolTrail: toolTrail.length > 0 ? toolTrail : undefined,
    answer: answer || undefined,
    steps: steps.length > 0 ? steps : undefined,
    stepCount: steps.length,
    toolCount: toolTrail.length,
  };
};

/**
 * A score document is considered "complete" when:
 * - `evaluator.score` is non-null (the evaluator finished and produced a verdict)
 * - `task.output` is non-null (the agent produced output — steps and/or messages)
 *
 * Incomplete runs (e.g. worker SIGKILL, OOM, timeout) may still write partial
 * score documents with null scores or empty output. These should not pollute
 * the matrix because they don't represent a real evaluation.
 */
const isCompleteScore = (score: EvaluationScoreDocument): boolean => {
  if (score.evaluator?.score == null) return false;
  return score.task?.output != null;
};

/**
 * Per-evaluator mean scores for one example, computed over all of the
 * example's score documents in the experiment (one doc per evaluator per
 * repetition). Pure for unit testing.
 */
export const exampleScoresByEvaluator = (
  docs: EvaluationScoreDocument[]
): Record<string, number> => {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const doc of docs) {
    const name = doc.evaluator?.name;
    const score = doc.evaluator?.score;
    if (!name || typeof score !== 'number') {
      continue;
    }
    const agg = sums.get(name) ?? { sum: 0, count: 0 };
    agg.sum += score;
    agg.count += 1;
    sums.set(name, agg);
  }
  return Object.fromEntries([...sums.entries()].map(([name, agg]) => [name, agg.sum / agg.count]));
};

/**
 * Per-evaluator spread (max - min) across the repetitions of one example.
 *
 * The mean returned by `exampleScoresByEvaluator` hides volatility: 10/10/10
 * and 0/10/20 both average to 10. Reporting the spread alongside the mean is
 * what makes a repeated run more informative than a single one. Returns only
 * evaluators seen more than once — a single observation has no measurable
 * spread, and emitting 0 for it would claim a stability that was never tested.
 * Pure for unit testing.
 */
export const exampleSpreadByEvaluator = (
  docs: EvaluationScoreDocument[]
): Record<string, number> => {
  const seen = new Map<string, { min: number; max: number; count: number }>();
  for (const doc of docs) {
    const name = doc.evaluator?.name;
    const score = doc.evaluator?.score;
    if (!name || typeof score !== 'number') {
      continue;
    }
    const agg = seen.get(name);
    if (!agg) {
      seen.set(name, { min: score, max: score, count: 1 });
      continue;
    }
    agg.min = Math.min(agg.min, score);
    agg.max = Math.max(agg.max, score);
    agg.count += 1;
  }
  return Object.fromEntries(
    [...seen.entries()]
      .filter(([, agg]) => agg.count > 1)
      .map(([name, agg]) => [name, agg.max - agg.min])
  );
};

/**
 * Number of distinct repetitions present in a batch of score documents.
 * Pure for unit testing.
 */
export const countRepetitions = (docs: EvaluationScoreDocument[]): number =>
  new Set(docs.map((doc) => doc.task?.repetition_index ?? 0)).size;

/**
 * The weekly board stores one repetition per (model, example). The 3-rep
 * reliability pilots live on older execution ids in the same cache. Overlay
 * those genuine repeats onto the example-id trace key without concatenating
 * separate 1-rep weekly runs, which would invent false agreement.
 *
 * Cache keys are `${executionId}::${exampleId}`. executionId itself contains
 * `::`, so the example id is the substring after the last `::`.
 */
export const overlayRepeatedCacheTrails = (
  traces: MatrixTraceData,
  traceCache?: Record<string, EvaluationScoreDocument[]>
): void => {
  if (!traceCache) {
    return;
  }
  interface RepeatedCell {
    trails: string[][];
    answers: string[];
    pathContract?: PathContract;
    executionId: string;
  }
  const best = new Map<string, RepeatedCell>();
  for (const [cacheKey, docs] of Object.entries(traceCache)) {
    const split = cacheKey.lastIndexOf('::');
    if (split < 0 || docs.length === 0) {
      continue;
    }
    const exampleId = cacheKey.slice(split + 2);
    const modelId = docs[0].task?.model?.id;
    if (!modelId || !exampleId) {
      continue;
    }
    const trails = trailsFromDocs(docs);
    if (trails.length <= 1) {
      continue;
    }
    const combo = `${modelId}\0${exampleId}`;
    const previous = best.get(combo);
    if (!previous || trails.length > previous.trails.length) {
      best.set(combo, {
        trails,
        answers: answersFromDocs(docs),
        pathContract: pathContractFromDocs(docs),
        executionId: cacheKey.slice(0, split),
      });
    }
  }
  for (const [combo, cell] of best) {
    const sep = combo.indexOf('\0');
    const modelId = combo.slice(0, sep);
    const exampleId = combo.slice(sep + 1);
    const key = traceKey(modelId, exampleId);
    const measured = {
      repTrails: cell.trails,
      repAnswers: cell.answers,
      pathContract: cell.pathContract,
      repExecutionIds: [cell.executionId],
    };
    const existing = traces[key];
    if (existing) {
      Object.assign(existing, measured);
    } else {
      traces[key] = measured;
    }
  }
};

/**
 * Merges a batch of full (unstripped) score documents for one example into
 * `traces`. Documents arrive in unknown order and span every experiment and
 * repetition that ever scored this example, so this filters to the requested
 * model + execution and keeps the newest complete document.
 */
const processExampleBatch = (
  scores: EvaluationScoreDocument[],
  modelId: string,
  suiteId: string,
  executionId: string,
  traces: MatrixTraceData,
  examplePrefixes: ReadonlySet<string> = new Set()
): boolean => {
  // Filter to this model + this execution, newest first
  const relevant = scores
    .filter((score) => score.task?.model?.id === modelId)
    .filter((score) => score.metadata?.execution_id === executionId)
    .sort((a, b) => {
      const ta = Date.parse(a['@timestamp'] ?? '');
      const tb = Date.parse(b['@timestamp'] ?? '');
      return tb - ta;
    });

  if (relevant.length === 0) return false;

  const entry = extractTraceFromScore(relevant[0]);
  // Per-evaluator means over every repetition of this example — powers the
  // per-prompt score on trace cards, so cards no longer repeat the column
  // aggregate for every variant in a category.
  entry.scores = exampleScoresByEvaluator(relevant);
  // Spread across those same repetitions, so a volatile cell is visually
  // distinct from a stable one instead of hiding behind an identical mean.
  const spread = exampleSpreadByEvaluator(relevant);
  if (Object.keys(spread).length > 0) {
    entry.spread = spread;
  }
  // How many repetitions of this example fed the scores above — the report
  // badges it so 1-rep cells are visually distinguishable from 3-rep cells.
  entry.repetitions = countRepetitions(relevant);
  const exampleId = relevant[0].example?.id;

  const complete = isCompleteScore(relevant[0]);

  // Key by model:exampleId for per-prompt detail. This key — and only this key
  // — carries the per-repetition tool_id trails: the prefix and suite keys
  // below alias the SAME entry object, so writing trails on `entry` would make
  // one example's repetitions count once per alias in the reliability roll-up.
  if (exampleId) {
    const trails = trailsFromDocs(relevant);
    traces[traceKey(modelId, exampleId)] =
      trails.length > 0 ? { ...entry, repTrails: trails } : entry;
  }
  // Category columns slice the dataset by example.id prefix (examplePrefixes),
  // synthesizing `prefix:<name>` dataset ids. Emit one trace per matching
  // prefix — mirroring scoresByPrefixToDatasets' semantics exactly (equality
  // or boundary dash) — so every category card shows ITS OWN example's
  // conversation instead of falling through to the suite key (which
  // previously made all cards render the same, last-processed example).
  if (exampleId) {
    for (const prefix of examplePrefixes) {
      // Equality writes `prefix:<exampleId>`, a byte-duplicate of the direct
      // example key written above (also on the incomplete-fallback path
      // below). Per-example columns (`examplePrefixes: ['<example-id>']`)
      // would otherwise double the traces map with unread duplicates.
      if (prefix === exampleId) continue;
      if (exampleId.startsWith(`${prefix}-`)) {
        const key = traceKey(modelId, `prefix:${prefix}`);
        // First variant wins: all matching variants are valid examples of the
        // category, so keep the lookup deterministic across Set iteration order.
        if (traces[key] === undefined) traces[key] = entry;
      }
    }
  }
  // Deliberately NOT keyed by `example.dataset.id`: that key is overwritten on
  // every example, so it ends up holding whichever example happened to be
  // processed last, and no renderer reads it (HTML resolves a column via
  // examplePrefixes then `column.suites`). Writing it only added arbitrary
  // `model:<dataset-uuid>` entries that duplicate real cells' payload.
  // For the suite-level key, only complete runs qualify — and the FIRST
  // complete one wins. Overwriting on every example made the suite key
  // "last example processed", which every non-matching card then inherited.
  const suiteTraceKey = traceKey(modelId, suiteId);
  if (complete && traces[suiteTraceKey] === undefined) {
    traces[suiteTraceKey] = entry;
  }

  // If the newest doc is incomplete, fall back to the newest complete one
  if (!complete) {
    const firstComplete = relevant.find(isCompleteScore);
    if (firstComplete) {
      const fallbackEntry = extractTraceFromScore(firstComplete);
      fallbackEntry.scores = exampleScoresByEvaluator(relevant.filter(isCompleteScore));
      const fid = firstComplete.example?.id;
      if (fid) {
        const trails = trailsFromDocs(relevant.filter(isCompleteScore));
        traces[traceKey(modelId, fid)] =
          trails.length > 0 ? { ...fallbackEntry, repTrails: trails } : fallbackEntry;
      }
      if (traces[suiteTraceKey] === undefined) {
        traces[suiteTraceKey] = fallbackEntry;
      }
    }
  }

  return complete;
};

/**
 * Queries evaluation score documents from the golden cluster via the evals
 * plugin and extracts trace data (initial question, tool trail, agent answer,
 * step trace) for each (model, column) pair.
 *
 * The per-experiment scores route (`getExperimentScores`) strips unbounded
 * fields (`task.output`, `example.input`, `example.metadata`) from responses,
 * which are exactly the fields the trace detail needs. This function instead
 * uses the per-example scores route (`getExampleScores`), which returns full
 * documents, and filters client-side by model and execution.
 *
 * Example IDs are enumerated from the stripped per-experiment response (which
 * still carries `example.id` and `example.dataset.id`), then each example is
 * fetched once and reused across all models that ran it.
 */

/**
 * Trace cells are keyed by `task.model.id` -- the id the *provider* reports.
 * For aliased rows (OpenRouter, gateways) that is the upstream slug
 * (`deepseek/deepseek-v4-pro-0813`) while the matrix row is keyed by the
 * connector id (`openrouter-deepseek-v4-pro`), so `traceKey(row.modelId, ...)`
 * misses every cell and the row renders "Trace unavailable" despite having a
 * full set of traces. Mirror each aliased cell onto the row's own id. EIS rows
 * are unaffected: their connector id and task.model.id are the same string.
 */
export const aliasTraceKeys = (
  traces: MatrixTraceData,
  modelAliases: ReadonlyMap<string, readonly string[]>
): void => {
  for (const [rowId, aliases] of modelAliases) {
    for (const alias of aliases) {
      if (alias === rowId) {
        continue;
      }
      const prefix = `${alias}:`;
      for (const [key, entry] of Object.entries(traces)) {
        if (!key.startsWith(prefix)) {
          continue;
        }
        const rowKey = traceKey(rowId, key.slice(prefix.length));
        // Never clobber a cell the row already resolved under its own id.
        if (traces[rowKey] === undefined) {
          traces[rowKey] = entry;
        }
      }
    }
  }
};

export const queryMatrixTraces = async (
  evalsClient: EvalsClient,
  log: SomeDevLog,
  aggregated: AggregatedModelScores[],
  traceCache?: Record<string, EvaluationScoreDocument[]>,
  toolCallWarnAbove: number = 0,
  modelAliases: ReadonlyMap<string, readonly string[]> = new Map()
): Promise<MatrixTraceData> => {
  const traces: MatrixTraceData = {};

  // 1. Collect (suite, model, execution) tuples with the example IDs they ran,
  //    from the stripped experiment-scores responses (cheap, no heavy fields).
  interface RunRef {
    suiteId: string;
    modelId: string;
    executionId: string;
    exampleIds: Set<string>;
  }
  const runRefs: RunRef[] = [];

  const modelSuites: Array<{ modelId: string; suiteId: string; executionId: string }> = [];
  for (const modelScores of aggregated) {
    for (const suite of modelScores.suites) {
      // A sharded suite row carries every shard's execution id; each shard
      // owns a disjoint stride of examples and must be enumerated separately.
      // Unsharded rows carry only experimentId.
      const executionIds =
        suite.executionIds && suite.executionIds.length > 0
          ? suite.executionIds
          : [suite.experimentId];
      for (const executionId of executionIds) {
        modelSuites.push({ modelId: modelScores.modelId, suiteId: suite.suiteId, executionId });
      }
    }
  }

  const enumerated = await mapWithConcurrency(
    modelSuites,
    6,
    async ({ modelId, suiteId, executionId }) => {
      log.debug(
        `Enumerating examples for experiment ${executionId} (model ${modelId}, suite ${suiteId})`
      );

      const stripped = await evalsClient.getExperimentScores(executionId, {
        suiteId,
        taskModelId: modelId,
        executionId,
      });

      const exampleIds = new Set<string>();
      for (const score of stripped) {
        if (score.example?.id) exampleIds.add(score.example.id);
      }

      if (exampleIds.size === 0) {
        log.warning(
          `No example IDs found for suite ${suiteId} (model ${modelId}) — trace will be unavailable`
        );
        return null;
      }

      return { suiteId, modelId, executionId, exampleIds };
    }
  );

  for (const ref of enumerated) {
    if (ref) runRefs.push(ref);
  }

  // 2. Fetch full score documents per (run, example) with the execution filter
  //    applied server-side. The unfiltered route returns EVERY historical run
  //    of an example (tens of MB), which outgrew the HTTP transport and made
  //    traces silently disappear; the filtered fetch is ~one execution's docs.
  //    All (run, example) pairs go through one bounded-concurrency pool.
  //
  //    Backward compatibility: an older evals plugin ignores the unknown query
  //    params and returns all executions. The first pair is fetched alone so
  //    detection settles before fan-out; on a legacy server each example is
  //    then fetched exactly once (deduped while in flight) and shared across
  //    runs, instead of once per run.
  const exampleScores = new Map<string, EvaluationScoreDocument[]>();
  const cacheKey = (ref: RunRef, exampleId: string) => `${ref.executionId}::${exampleId}`;
  let serverSupportsFilter: boolean | undefined;
  // In-flight dedup: legacy servers get one request per example no matter how
  // many runs need it; filtered servers dedupe only identical (run, example)
  // repeats. Keyed differently per mode because the cache identity differs.
  const inflight = new Map<string, Promise<EvaluationScoreDocument[]>>();

  const fetchScores = (ref: RunRef, exampleId: string): Promise<EvaluationScoreDocument[]> => {
    const key = serverSupportsFilter === false ? exampleId : cacheKey(ref, exampleId);
    const pending = inflight.get(key);
    if (pending) return pending;
    // Concurrent heavy fetches can trip transient 502/503s on legacy servers;
    // one bounded retry keeps a flake from silently costing a cell its trace.
    const attempt = async (retriesLeft: number): Promise<EvaluationScoreDocument[]> => {
      try {
        return await evalsClient.getExampleScores(exampleId, {
          executionId: ref.executionId,
          modelId: ref.modelId,
        });
      } catch (error) {
        if (retriesLeft === 0) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return attempt(retriesLeft - 1);
      }
    };
    const request = attempt(1).finally(() => inflight.delete(key));
    inflight.set(key, request);
    return request;
  };

  const fetchExample = async (ref: RunRef, exampleId: string): Promise<void> => {
    // Local trace cache: docs pulled ahead of time (e.g. directly from ES,
    // bypassing an old evals plugin whose route ignores execution filters and
    // trips the transport cap on heavy examples). A cache hit means no server
    // round-trip at all for this cell.
    const cached = traceCache?.[cacheKey(ref, exampleId)];
    if (cached) {
      exampleScores.set(cacheKey(ref, exampleId), cached);
      return;
    }
    if (serverSupportsFilter === false) {
      const shared = exampleScores.get(exampleId);
      if (shared) {
        exampleScores.set(cacheKey(ref, exampleId), shared);
        return;
      }
    }
    const scores = await fetchScores(ref, exampleId);
    if (serverSupportsFilter === undefined && scores.length > 0) {
      // Only a NON-EMPTY response proves anything about filter support. An
      // empty one is ambiguous — it happens when the route rejects the filter
      // params, when the execution has no docs, or when the payload blew the
      // transport cap. Latching `true` on it (the previous behaviour) declared
      // the server healthy off the very response that signals it isn't, so the
      // fallback never armed and EVERY later cell returned empty: 442/442
      // traces rendered hollow while scores stayed intact.
      serverSupportsFilter = scores.every((s) => s.metadata?.execution_id === ref.executionId);
      if (!serverSupportsFilter) {
        log.warning(
          'Example-scores route ignores execution filters (older evals plugin) — falling back to shared per-example fetches; traces will be complete but slower'
        );
      }
    }
    if (serverSupportsFilter === false) {
      exampleScores.set(exampleId, scores);
    }
    exampleScores.set(cacheKey(ref, exampleId), scores);
  };

  const pairs: Array<{ ref: RunRef; exampleId: string }> = [];
  for (const ref of runRefs) {
    for (const exampleId of ref.exampleIds) {
      pairs.push({ ref, exampleId });
    }
  }

  const fetchPair = async ({
    ref,
    exampleId,
  }: {
    ref: RunRef;
    exampleId: string;
  }): Promise<void> => {
    try {
      await fetchExample(ref, exampleId);
    } catch (error) {
      // A single failed fetch must not abort the whole report: scores are
      // already aggregated, only this cell's trace detail is lost.
      log.warning(
        `Skipping trace details for example ${exampleId} (execution ${ref.executionId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      exampleScores.set(cacheKey(ref, exampleId), []);
    }
  };

  if (pairs.length > 0) {
    await fetchPair(pairs[0]);
    await mapWithConcurrency(pairs.slice(1), 8, fetchPair);
  }

  // Completeness gate. Per-cell failures are deliberately swallowed above so one
  // bad example cannot abort a report — but that also means a TOTAL fetch
  // failure is silent, and the matrix renders every trace card empty while the
  // score columns look perfect. Measured 2026-08-29: 442/442 cells hollow with
  // no error surfaced. Fetching nothing at all is never a valid outcome.
  const fetchedCells = [...exampleScores.values()].filter((docs) => docs.length > 0).length;
  if (pairs.length > 0 && fetchedCells === 0) {
    log.warning(
      `Trace fetch returned no documents for any of ${pairs.length} (execution, example) pairs — ` +
        `every trace card will render empty. The scores above are unaffected. ` +
        `Re-run with --trace-cache <path> to read score documents straight from ES.`
    );
  }

  // Category prefixes come from the same synthetic `prefix:*` dataset ids the
  // score aggregation created (scoresByPrefixToDatasets), so trace bucketing
  // always matches score bucketing — no separate config source to keep in sync.
  const examplePrefixes = new Set<string>();
  for (const modelScores of aggregated) {
    for (const suite of modelScores.suites) {
      for (const dataset of suite.datasets) {
        if (!dataset.datasetId?.startsWith('prefix:')) continue;
        examplePrefixes.add(dataset.datasetId.slice('prefix:'.length));
      }
    }
  }

  // 3. For each run, pick the newest complete document per example and merge
  //    into the traces map.
  const missingByRun: Array<{ ref: RunRef; missing: string[] }> = [];
  for (const ref of runRefs) {
    const missing: string[] = [];
    for (const exampleId of ref.exampleIds) {
      const scores = exampleScores.get(cacheKey(ref, exampleId)) ?? [];
      const ok = processExampleBatch(
        scores,
        ref.modelId,
        ref.suiteId,
        ref.executionId,
        traces,
        examplePrefixes
      );
      if (!ok) missing.push(exampleId);
    }
    if (missing.length === ref.exampleIds.size) {
      log.warning(
        `No complete score documents found for suite ${ref.suiteId} (model ${ref.modelId}, execution ${ref.executionId}) — trace will be unavailable`
      );
    } else if (missing.length > 0) {
      missingByRun.push({ ref, missing });
    }
  }

  // Pass-through verification: every (model, example) that produced a score in
  // the aggregation must also land in the traces map. A gap means the trace
  // fetch silently lost a scored cell — name each one loudly instead of
  // letting the HTML render "Trace unavailable" with no log trail.
  if (missingByRun.length > 0) {
    const details = missingByRun
      .map(
        ({ ref, missing }) =>
          `${ref.modelId} (execution ${ref.executionId}): ${missing.length}/${
            ref.exampleIds.size
          } missing [${missing.join(', ')}]`
      )
      .join('; ');
    log.warning(
      `Trace coverage incomplete — scores exist but no trace was resolved for: ${details}`
    );
  }

  // Runaway tool-loop report. `Tool Calls` is deliberately excluded from
  // quality scoring and thrashing cells do NOT score worse (measured 0.70 vs
  // 0.62 trajectory), so this is a COST signal, never a penalty: without it a
  // 44-call/3.78M-token cell is indistinguishable from an 8-call one in every
  // rendered artifact.
  if (toolCallWarnAbove > 0) {
    // Corroborate the score against the trail the same document recorded. The
    // evaluator counts OTel TOOL spans, which is a DIFFERENT source from
    // `task.output.steps`, so a score far above the trail is measurement error
    // (stale/duplicated spans), not a longer loop. Golden bears this out: over
    // 313 recent scored docs the ratio is median 1.00 / mean 0.98, yet one
    // 2026-08-22 cell reported 115 against a 29-call trail and became the
    // headline "worst offender" in every report built off this warning.
    // Reporting an uncorroborated count as a tool-loop length publishes a
    // number no trace supports, so those cells are named separately.
    const SUSPECT_RATIO = 2;
    const withTrail = Object.entries(traces).map(([key, trace]) => ({
      key,
      calls: trace.scores?.['Tool Calls'],
      trail: trace.toolTrail?.length ?? 0,
    }));

    const above = withTrail
      .filter(
        (c): c is { key: string; calls: number; trail: number } => typeof c.calls === 'number'
      )
      .filter((c) => c.calls > toolCallWarnAbove)
      .sort((a, b) => b.calls - a.calls);

    // A trail of 0 cannot corroborate or refute the count (the cell may simply
    // have no cached steps), so it stays in the reportable set.
    const suspect = above.filter((c) => c.trail > 0 && c.calls > c.trail * SUSPECT_RATIO);
    const runaway = above.filter((c) => !suspect.includes(c));

    if (runaway.length > 0) {
      log.warning(
        `Possible runaway tool loops (> ${toolCallWarnAbove} calls) in ${runaway.length} cell(s): ` +
          runaway
            .slice(0, 10)
            .map((c) => `${c.key}=${c.calls}`)
            .join(', ')
      );
    }

    if (suspect.length > 0) {
      log.warning(
        `'Tool Calls' exceeds the recorded tool trail by more than ${SUSPECT_RATIO}x in ` +
          `${suspect.length} cell(s): ` +
          suspect
            .slice(0, 10)
            .map((c) => `${c.key}=${c.calls} (trail ${c.trail})`)
            .join(', ') +
          ` — the count is not corroborated by the trace; do not cite these as tool-loop lengths`
      );
    }

    // A zero `Tool Calls` score on a cell whose trace shows real tool calls
    // means the metric is broken for that model, not that it used no tools.
    // Unreported, that renders as "this model uses no tools" in the published
    // matrix — a fabricated claim, and it hides genuine tool-loop failures.
    const brokenMetric = new Map<string, number>();
    for (const [key, trace] of Object.entries(traces)) {
      const trail = trace.toolTrail?.length ?? 0;
      const scored = trace.scores?.['Tool Calls'];
      if (trail > 0 && (scored === 0 || scored === undefined)) {
        const modelId = key.split(':')[0];
        brokenMetric.set(modelId, (brokenMetric.get(modelId) ?? 0) + 1);
      }
    }
    if (brokenMetric.size > 0) {
      log.warning(
        `'Tool Calls' reads 0 despite a non-empty tool trail for: ` +
          [...brokenMetric].map(([modelId, n]) => `${modelId}=${n}`).join(', ') +
          ` — the metric is broken for these models; do not publish their tool counts`
      );
    }
  }

  log.debug(`Matrix traces resolved ${Object.keys(traces).length} trace entries`);
  overlayRepeatedCacheTrails(traces, traceCache);
  aliasTraceKeys(traces, modelAliases);
  return traces;
};
