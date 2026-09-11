/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvaluationExperimentSummary, EvaluationScoreDocument } from '@kbn/evals-common';
import { MAX_LIST_EXPERIMENTS, type EvalsClient, type ExperimentStats } from '@kbn/evals';
import { mergeShardDatasets, pickShardExperiments } from './merge_shard_experiments';
import { isEisBacked, describeJudge } from './judge_provenance';
import { resolveVerdictScore } from './scoring_policy';

/**
 * Counts of score documents dropped by the provenance/verdict policy, so the
 * report can state what was excluded instead of silently shrinking its own
 * sample.
 */
export interface ExcludedScoreCounts {
  /** Dropped because evaluator.direction is minimize/neutral, not a quality score. */
  nonQuality: number;
  nonEis: number;
  selfJudged: number;
  unmappedVerdict: number;
}

export interface ScoreAggregationOptions {
  /** Drop scores from judges that are not EIS-backed connectors. */
  requireEisJudge?: boolean;
  /** Drop scores where the judge and the graded model are the same id. */
  excludeSelfJudged?: boolean;
  /**
   * Score the judge's categorical verdict via an ordinal ladder instead of its
   * continuous value. Measured on the persona matrix: judged-score flip across
   * identical repetitions drops from 83.3% to 33.3%, because the agent's prose
   * changes every run while its verdict does not.
   */
  useVerdictLadder?: boolean;
  onExcluded?: (counts: ExcludedScoreCounts) => void;
}

/** Aggregated evaluator score for a single dataset within a suite. */
export interface AggregatedEvaluatorScore {
  evaluatorName: string;
  mean: number;
  count: number;
  /** Observed spread across the experiment's examples (used by the token axis). */
  min?: number;
  max?: number;
}

export interface AggregatedDatasetScores {
  datasetId: string;
  datasetName: string;
  evaluators: AggregatedEvaluatorScore[];
  /**
   * Evaluators that produced `label=error` documents for this dataset and no
   * numeric score at all. Their absence from `evaluators` would otherwise be
   * invisible, letting the dataset's mean rest on whichever evaluators
   * survived a broken instrument.
   */
  erroredOutEvaluators?: string[];
}

export interface AggregatedSuiteScores {
  suiteId: string;
  /** Primary execution id retained for backward compatibility. */
  experimentId: string;
  /**
   * Every execution contributing to this suite row. Sharded sweeps have one
   * execution per VM; trace and per-prefix readers must query all of them.
   */
  executionIds?: string[];
  timestamp?: string;
  /**
   * Commit the graded run executed against, straight from the experiment
   * summary. The artifact's top-level provenance records the *generator's*
   * commit; this records the *subject's*. They diverge as soon as a model is
   * added to an existing matrix, which is the normal way this board grows.
   */
  commitSha?: string;
  /**
   * True when the admitted scores for this suite were graded by the model
   * being graded. Only possible when the suite opted out of
   * `excludeSelfJudged`; carries the fact to the artifact so a published
   * self-judged score can be disclosed per row rather than per column.
   */
  selfJudged?: boolean;
  /**
   * Judge that graded this suite's run, for cross-row comparability checks.
   * Left undefined when the run carries more than one judge -- see
   * `judgeModelIds`, which is the honest form for suites whose columns ran as
   * separate experiments.
   */
  judgeModelId?: string;
  /** Every judge that graded this suite's admitted runs. */
  judgeModelIds?: string[];
  /**
   * Number of experiments withheld because the grader was the graded model.
   * Set only when the withholding emptied the suite, so a cell can say
   * "withheld for self-judging" instead of rendering identically to a model
   * that never ran the suite at all.
   */
  excludedSelfJudged?: number;
  datasets: AggregatedDatasetScores[];
}

export interface AggregatedModelScores {
  modelId: string;
  family?: string;
  provider?: string;
  suites: AggregatedSuiteScores[];
  /**
   * Scores that existed for this model but were rejected by judge policy.
   * Present only when at least one score was dropped. A model with `suites`
   * empty AND this set ran successfully — its grades were untrustworthy — so
   * re-running it is wasted compute until the judge assignment is fixed.
   */
  excluded?: ExcludedScoreCounts;
}

export interface QueryMatrixScoresOptions {
  suiteIds: string[];
  /**
   * Task model ids to include (the config's `id` + `matchIds` per model).
   * Each (suite, model) pair is queried separately via the route's `model_id`
   * term filter, so a bounded single-page listing covers the full history for
   * that pair instead of paging an ever-growing cross-model aggregation.
   */
  modelIds: string[];
  branch?: string;
  /**
   * Per-suite branch overrides, keyed by suite id. A suite listed here is read
   * from its mapped branch instead of the global `branch`.
   */
  branchBySuite?: Record<string, string | string[]>;
  lookbackDays?: number;
  /**
   * Render the matrix as of this epoch-ms instant: experiments newer than it
   * are ignored for every model alike. Reproduces an earlier matrix, or
   * excludes a window of runs known to be instrumented wrong -- never a
   * per-model choice of which run to score.
   */
  asOf?: number;
  /**
   * When any config column sets `examplePrefixes`, per-example score documents
   * are fetched (stripped experiment-scores route — unbounded fields excluded)
   * and bucketed into synthetic per-prefix datasets alongside the dataset-level
   * stats, so columns can slice a single dataset by example category.
   */
  prefixesBySuite?: Record<string, string[]>;
  /**
   * Judged-evaluator scoring policy. Forwarded to `scoresByPrefixToDatasets`
   * for the per-prefix datasets. Omitted means the historical behaviour:
   * continuous scores, every judge counted.
   */
  scoring?: ScoreAggregationOptions;
  /**
   * Per-suite scoring overrides, keyed by suite id. A suite present here uses
   * its own policy instead of the global `scoring`; suites absent from the map
   * keep `scoring` unchanged. Mirrors `branchBySuite`.
   */
  scoringBySuite?: Record<string, ScoreAggregationOptions>;
}

/**
 * Buckets stripped per-example score documents into synthetic per-prefix
 * datasets. Each doc carries `example.id` (e.g. `alert-analysis-b`) and
 * `evaluator.{name,score}`; docs are grouped by prefix, then per-evaluator
 * means are computed the same way the server-side stats route would.
 * Pure for unit testing.
 */
export const scoresByPrefixToDatasets = (
  scores: EvaluationScoreDocument[],
  prefixes: string[],
  options: ScoreAggregationOptions = {}
): AggregatedDatasetScores[] => {
  const byPrefix = new Map<string, Map<string, { sum: number; count: number }>>();
  // Evaluators that produced an error label but no score for a prefix. A
  // trace-metric evaluator erroring (Latency racing span ingestion) is noise;
  // a cell-relevant judge evaluator erroring out entirely (Trajectory,
  // SkillInvoked) means the cell's mean silently rests on the evaluators that
  // survived. Track the names so the builder can refuse to publish that cell.
  const erroredByPrefix = new Map<string, Map<string, { errored: number; scored: number }>>();
  const excluded: ExcludedScoreCounts = {
    nonQuality: 0,
    nonEis: 0,
    selfJudged: 0,
    unmappedVerdict: 0,
  };

  for (const doc of scores) {
    const exampleId = doc.example?.id ?? '';
    const prefix = prefixes.find((p) => exampleId === p || exampleId.startsWith(`${p}-`));
    if (!prefix) {
      continue;
    }
    // Upstream now persists evaluator polarity on the score doc (#284027):
    // maximize | minimize | neutral. Prefer it over guessing from the name.
    const evaluatorName = doc.evaluator?.name;
    const direction = (doc.evaluator as { direction?: string } | undefined)?.direction;
    if (!evaluatorName) {
      continue;
    }

    const judgeId = doc.evaluator?.model?.id;
    const taskModelId = doc.task?.model?.id;
    if (options.requireEisJudge && judgeId && !isEisBacked(judgeId)) {
      excluded.nonEis += 1;
      continue;
    }
    if (
      options.excludeSelfJudged &&
      judgeId &&
      taskModelId &&
      describeJudge(judgeId, taskModelId).selfJudged
    ) {
      excluded.selfJudged += 1;
      continue;
    }

    // A non-quality metric averaged into a 0-10 score is nonsense: Latency is
    // minimize, Tool Calls is neutral. The name allowlist only approximates this;
    // when the doc carries polarity, trust it and keep the average to maximize.
    if (direction && direction !== 'maximize') {
      excluded.nonQuality += 1;
      continue;
    }
    const score = options.useVerdictLadder
      ? resolveVerdictScore(evaluatorName, doc)
      : doc.evaluator?.score;

    // Record whether this evaluator ever errored or ever scored for the
    // prefix, so a judge evaluator that failed for every example is visible to
    // the builder instead of silently absent from the mean's denominator.
    let errTrack = erroredByPrefix.get(prefix);
    if (!errTrack) {
      errTrack = new Map();
      erroredByPrefix.set(prefix, errTrack);
    }
    const tally = errTrack.get(evaluatorName) ?? { errored: 0, scored: 0 };
    // 'unavailable' counts too: a trace evaluator that found no spans reports a
    // null score without ever calling itself an error, so gating on 'error'
    // alone let a model publish an overall built on the evaluators that did
    // survive -- ranked against peers who were graded on the full set.
    if (doc.evaluator?.label === 'error' || doc.evaluator?.label === 'unavailable') {
      tally.errored += 1;
      errTrack.set(evaluatorName, tally);
    }

    if (typeof score !== 'number') {
      if (options.useVerdictLadder && typeof doc.evaluator?.score === 'number') {
        excluded.unmappedVerdict += 1;
      }
      continue;
    }

    tally.scored += 1;
    errTrack.set(evaluatorName, tally);

    let evaluators = byPrefix.get(prefix);
    if (!evaluators) {
      evaluators = new Map();
      byPrefix.set(prefix, evaluators);
    }
    const agg = evaluators.get(evaluatorName) ?? { sum: 0, count: 0 };
    agg.sum += score;
    agg.count += 1;
    evaluators.set(evaluatorName, agg);
  }

  options.onExcluded?.(excluded);

  return [...byPrefix.entries()].map(([prefix, evaluators]) => {
    // Only evaluators that errored AND never scored count: one that recovered
    // on retry still produced a grade, so its partial history is noise, not a
    // broken instrument.
    const erroredOut = [...(erroredByPrefix.get(prefix)?.entries() ?? [])]
      .filter(([, tally]) => tally.errored > 0 && tally.scored === 0)
      .map(([name]) => name);
    return {
      datasetId: `prefix:${prefix}`,
      datasetName: prefix,
      evaluators: [...evaluators.entries()].map(([evaluatorName, agg]) => ({
        evaluatorName,
        mean: agg.sum / agg.count,
        count: agg.count,
      })),
      ...(erroredOut.length > 0 ? { erroredOutEvaluators: erroredOut } : {}),
    };
  });
};

/**
 * Selects, per task model, the most recent experiment from a list (typically
 * the newest experiments for one suite + model). Experiments without a model
 * id or timestamp older than the lookback window are ignored. Pure for unit
 * testing.
 */
export const pickLatestExperimentPerModel = (
  experiments: EvaluationExperimentSummary[],
  {
    lookbackDays,
    now = Date.now(),
    allowSelfJudged = false,
    onSelfJudgedRejected,
  }: {
    lookbackDays?: number;
    now?: number;
    allowSelfJudged?: boolean;
    /**
     * Called for each experiment skipped because the grader was the graded
     * model. Selection runs before scoring, so this is the ONLY place the
     * fact is observable -- downstream the model simply has no experiment,
     * indistinguishable from never having run.
     */
    onSelfJudgedRejected?: (experiment: EvaluationExperimentSummary) => void;
  } = {}
): Map<string, EvaluationExperimentSummary> => {
  const cutoff = lookbackDays ? now - lookbackDays * 24 * 60 * 60 * 1000 : undefined;
  const latestByModel = new Map<string, { experiment: EvaluationExperimentSummary; at: number }>();

  for (const experiment of experiments) {
    const modelId = experiment.task_model?.id;
    if (!modelId) {
      continue;
    }

    const at = Date.parse(experiment.timestamp);
    // An unparseable timestamp must not be treated as epoch 0, or stale
    // experiments would silently survive the lookback cutoff.
    if (!Number.isFinite(at) || (cutoff !== undefined && at < cutoff)) {
      continue;
    }

    // `now` doubles as the upper bound so a matrix can be rendered as of a
    // point in time. Applied to every model identically -- it reproduces an
    // older matrix, it does not let one model be scored on a different run
    // than its neighbours.
    if (at > now) {
      continue;
    }

    // Selection runs before scoring, so a self-judged experiment picked here
    // blanks the model outright: its scores are dropped downstream and the
    // older, independently judged runs are never reconsidered. Skip it now so
    // recency cannot silently cost a model every cell it earned.
    //
    // `allowSelfJudged` is the audited escape hatch: on a suite where the judge
    // demonstrably does not favour itself, dropping the run costs a real cell
    // to prevent a bias that was measured not to occur.
    const judges = experiment.evaluator_models?.length
      ? experiment.evaluator_models
      : [experiment.evaluator_model];
    if (
      !allowSelfJudged &&
      judges.some((judge) => judge?.id && describeJudge(judge.id, modelId).selfJudged)
    ) {
      onSelfJudgedRejected?.(experiment);
      continue;
    }

    const existing = latestByModel.get(modelId);
    if (!existing || at > existing.at) {
      latestByModel.set(modelId, { experiment, at });
    }
  }

  return new Map([...latestByModel].map(([modelId, { experiment }]) => [modelId, experiment]));
};

/**
 * Converts the per-experiment stats returned by the evals plugin into the
 * dataset-grouped structure consumed by the matrix builder. Pure for testing.
 */
export const experimentStatsToDatasets = (stats: ExperimentStats): AggregatedDatasetScores[] => {
  const byDataset = new Map<string, AggregatedDatasetScores>();

  for (const stat of stats.stats) {
    let dataset = byDataset.get(stat.datasetId);
    if (!dataset) {
      dataset = { datasetId: stat.datasetId, datasetName: stat.datasetName, evaluators: [] };
      byDataset.set(stat.datasetId, dataset);
    }
    dataset.evaluators.push({
      evaluatorName: stat.evaluatorName,
      mean: stat.stats.mean,
      count: stat.stats.count,
      min: stat.stats.min,
      max: stat.stats.max,
    });
  }

  return [...byDataset.values()];
};

/**
 * Queries the evals plugin for the latest experiment per (model, suite) and
 * returns mean evaluator scores grouped by dataset, ready for `buildMatrix`.
 *
 * Each (suite, model) pair is listed separately through the route's `model_id`
 * term filter: the route answers with a terms aggregation whose bucket size
 * grows with `page * per_page`, so a bounded single page per pair is the only
 * query shape that scales. The newest experiment within the lookback window is
 * then picked client-side (a bare `per_page: 1` request could not express the
 * lookback fallback).
 */
/**
 * Normalises a branch override to a list.
 *
 * `branchBySuite` accepts either a single branch or several. A suite whose
 * models are split across branches needs the union; a suite pinned to one
 * branch keeps the plain-string form.
 */
const toBranchList = (branch: string | string[] | undefined): Array<string | undefined> => {
  if (Array.isArray(branch)) {
    return branch.length > 0 ? branch : [undefined];
  }
  return [branch];
};

export const queryMatrixScores = async (
  evalsClient: EvalsClient,
  log: SomeDevLog,
  {
    suiteIds,
    modelIds,
    branch,
    branchBySuite,
    lookbackDays,
    asOf,
    prefixesBySuite = {},
    scoring,
    scoringBySuite,
  }: QueryMatrixScoresOptions
): Promise<AggregatedModelScores[]> => {
  const byModel = new Map<string, AggregatedModelScores>();
  /**
   * Per-model tally of scores rejected by judge policy, keyed by model id.
   * Lets the renderer distinguish a never-run cell from one whose grades were
   * all thrown away — the two are indistinguishable otherwise.
   */
  const excludedByModel = new Map<string, ExcludedScoreCounts>();
  const exampleCoverage: Array<{
    modelId: string;
    suiteId: string;
    examples: number;
    repetitions: number;
  }> = [];

  for (const suiteId of suiteIds) {
    const suiteBranches = toBranchList(branchBySuite?.[suiteId] ?? branch);
    const suiteScoring = scoringBySuite?.[suiteId] ?? scoring;
    for (const modelId of modelIds) {
      // Golden data for one suite is split across branches by model: a weekly
      // matrix branch may hold six models while a seventh only ever ran on a
      // feature branch. Querying a single branch silently discards the rest,
      // so every configured branch is queried and the results unioned before
      // selection picks the newest run per model.
      const experiments = (
        await Promise.all(
          suiteBranches.map((suiteBranch) =>
            evalsClient.listExperiments({
              suiteId,
              taskModelId: modelId,
              branch: suiteBranch,
              limit: MAX_LIST_EXPERIMENTS,
            })
          )
        )
      ).flat();
      // Selection is where a self-judged run disappears, so record it here:
      // downstream this model looks like it never ran the suite.
      const selfJudgedRejected: EvaluationExperimentSummary[] = [];
      const [latest] = [
        ...pickLatestExperimentPerModel(experiments, {
          lookbackDays,
          ...(asOf !== undefined ? { now: asOf } : {}),
          // A suite that opted out of the exclusion must also keep its
          // self-judged runs through selection, or the cell stays blank no
          // matter what the scoring policy allows.
          allowSelfJudged: suiteScoring?.excludeSelfJudged === false,
          onSelfJudgedRejected: (rejected) => {
            selfJudgedRejected.push(rejected);
          },
        }).values(),
      ];

      log.debug(
        `Suite ${suiteId}, model ${modelId}: ${experiments.length} experiment(s)` +
          (latest ? '' : ', none within the lookback window')
      );

      if (!latest) {
        if (selfJudgedRejected.length > 0) {
          // The run exists and was deliberately withheld. Emit a suite record
          // with no datasets so the cell renders as "excluded", not "missing".
          // The renderer reports a SCORE count, so fetch the withheld run's
          // real size rather than passing an experiment tally that would
          // render as "1 score(s) rejected" for thousands of documents.
          const newest = selfJudgedRejected.reduce((a, b) =>
            Date.parse(b.timestamp) > Date.parse(a.timestamp) ? b : a
          );
          let withheldScores = 0;
          try {
            const withheldStats = await evalsClient.getExperimentStats(newest.experiment_id, {
              suiteId,
              taskModelId: modelId,
              executionId: newest.execution_id ?? newest.experiment_id,
            });
            // No total on the stats shape; sum the per-evaluator sample
            // counts, which is what "score(s) rejected" means to a reader.
            withheldScores = (withheldStats?.stats ?? []).reduce(
              (total, entry) => total + (entry.stats?.count ?? 0),
              0
            );
          } catch (error) {
            log.debug(
              `Could not size withheld self-judged run for ${modelId}/${suiteId}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
          let withheldModel = byModel.get(modelId);
          if (!withheldModel) {
            withheldModel = { modelId, suites: [] };
            byModel.set(modelId, withheldModel);
          }
          withheldModel.suites.push({
            suiteId,
            experimentId: newest.experiment_id,
            excludedSelfJudged: withheldScores,
            datasets: [],
          });
        }
        continue;
      }

      // The experiments listing returns `execution_id` as its grouping key; the
      // detail/stats route must be filtered by execution_id (+ suite + model),
      // since a bare experiment_id path lookup targets a different field and 404s.
      // A sharded sweep splits one model's examples across VMs, each with its
      // own execution_id. Selecting a single experiment would render one shard
      // and blank every example the others covered, so gather the whole sweep.
      // Shard gathering re-scans the raw listing, so the cutoff has to be
      // reapplied here. Without it selection honours `asOf` but the shard
      // union pulls the excluded runs straight back in.
      const shardMembers = pickShardExperiments(
        experiments.filter((candidate) => {
          if (candidate.task_model?.id !== modelId) {
            return false;
          }
          if (asOf === undefined) {
            return true;
          }
          const at = Date.parse(candidate.timestamp);
          return Number.isFinite(at) && at <= asOf;
        })
      );
      const shards = shardMembers.some(
        (member) => member.execution_id === (latest.execution_id ?? latest.experiment_id)
      )
        ? shardMembers
        : [latest];

      const perShardStats = await Promise.all(
        shards.map((shard) =>
          evalsClient.getExperimentStats(shard.experiment_id, {
            suiteId,
            taskModelId: modelId,
            executionId: shard.execution_id ?? shard.experiment_id,
          })
        )
      );

      if (!perShardStats.some((entry) => entry)) {
        log.warning(
          `No stats for experiment ${latest.experiment_id} (suite ${suiteId}, model ${modelId})`
        );
        continue;
      }

      let model = byModel.get(modelId);
      if (!model) {
        model = {
          modelId,
          family: latest.task_model?.family,
          provider: latest.task_model?.provider,
          suites: [],
        };
        byModel.set(modelId, model);
      }

      const datasets = mergeShardDatasets(
        perShardStats
          .filter((entry): entry is ExperimentStats => Boolean(entry))
          .map((entry) => experimentStatsToDatasets(entry))
      );
      // Per-prefix synthetic datasets: one extra stripped-scores fetch per
      // (suite, model). Cheap — unbounded fields are excluded server-side.
      const examplePrefixes = prefixesBySuite[suiteId] ?? [];
      if (examplePrefixes.length > 0) {
        try {
          // Per-prefix bucketing must see every shard's docs: fetching only the
          // newest execution would fill columns only for its stride of examples.
          const scores = (
            await Promise.all(
              shards.map((shard) =>
                evalsClient.getExperimentScores(shard.experiment_id, {
                  suiteId,
                  taskModelId: modelId,
                  executionId: shard.execution_id ?? shard.experiment_id,
                })
              )
            )
          ).flat();
          // Capture WHY scores were dropped. Without this the caller cannot tell
          // "model never ran" from "model ran and every grade was rejected" —
          // they render identically as a blank cell and invite a pointless
          // re-sweep. See references/self-judging-provenance-impact.md.
          const before = datasets.length;
          datasets.push(
            ...scoresByPrefixToDatasets(scores, examplePrefixes, {
              ...suiteScoring,
              onExcluded: (counts) => {
                if (counts.selfJudged + counts.nonEis + counts.unmappedVerdict > 0) {
                  excludedByModel.set(modelId, counts);
                }
              },
            })
          );
          if (datasets.length === before && excludedByModel.has(modelId)) {
            const c = excludedByModel.get(modelId)!;
            // A pure unmapped-verdict rejection is not a judge problem, so do
            // not send the operator to the judge config. Measured cause on
            // attack-discovery: every document carries `example.id` "0", so
            // prefix bucketing matches no column and every score falls out.
            const judgeIssue = c.selfJudged + c.nonEis;
            const remedy =
              judgeIssue === 0
                ? `no score carried a mappable verdict — check that this suite's example ids match the column's examplePrefixes (a suite that writes a constant example id cannot be bucketed) before blaming the judge.`
                : `Re-running this model will NOT fill these cells — fix the judge assignment first.`;
            log.warning(
              `All per-prefix scores rejected for model ${modelId} (suite ${suiteId}): ` +
                `${c.selfJudged} self-judged, ${c.nonEis} non-EIS judge, ${c.unmappedVerdict} unmapped verdict. ` +
                remedy
            );
          }

          // The sweep knows when a run stopped early (docs=252/294) but that
          // fact never reaches the score docs, so an incomplete experiment
          // publishes a headline score indistinguishable from a complete one:
          // 4.5-sonnet ranked 7.49 off 18 of 21 examples on 2026-08-29 while
          // its peers ran all 21. minCoverage only catches near-empty rows.
          // Count the examples this experiment actually carries and say so.
          const exampleIds = new Set(
            scores
              .map((doc) => doc.example?.id)
              .filter((id): id is string => typeof id === 'string')
          );
          if (exampleIds.size > 0) {
            // Repetitions average out judge variance, so a model measured once
            // carries a materially wider error bar than one measured three
            // times -- comparing them as equals overstates the precision of the
            // single-shot row. Track the reps actually present in the docs
            // rather than the configured intent, which can silently not apply.
            const repetitions = new Set(
              scores
                .map((doc) => doc.task?.repetition_index)
                .filter((index): index is number => typeof index === 'number')
            );
            exampleCoverage.push({
              modelId,
              suiteId,
              examples: exampleIds.size,
              repetitions: repetitions.size,
            });
          }
        } catch (error) {
          log.warning(
            `Per-prefix scores unavailable for experiment ${
              latest.experiment_id
            } (suite ${suiteId}, model ${modelId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      model.suites.push({
        suiteId,
        experimentId: latest.experiment_id,
        executionIds: shards.map((s) => s.execution_id ?? s.experiment_id),
        timestamp: latest.timestamp,
        commitSha: latest.git_commit_sha ?? undefined,
        // Derived from the experiment's own judge/task ids, NOT from the
        // column's opt-out: a column that admits self-judged scores still
        // contains rows the judge graded at arm's length, and flagging those
        // too would be a false accusation.
        selfJudged:
          latest.evaluator_model?.id && latest.task_model?.id
            ? describeJudge(latest.evaluator_model.id, latest.task_model.id).selfJudged
            : undefined,
        // Which judge graded this row. Rejecting a self-judged run silently
        // falls back to an older run graded by someone else, so a model can
        // end up measured with a different instrument than the rows it is
        // ranked against. Carry the id so that is visible instead of implied.
        judgeModelId: latest.evaluator_model?.id ?? undefined,
        // A suite whose scores were ALL rejected for self-judging is not the
        // same as a suite that never ran: the run exists and its size is
        // known. Carry the count so the cell can say which it is.
        excludedSelfJudged:
          datasets.length === 0 && (excludedByModel.get(modelId)?.selfJudged ?? 0) > 0
            ? excludedByModel.get(modelId)!.selfJudged
            : undefined,
        datasets,
      });
    }
  }

  // Treat the count most models reached as the suite's full size rather than
  // hardcoding it: the matrix reads score docs, and the expected example count
  // lives in the eval suite. 18 of 20 models covered all 21 examples on
  // 2026-08-29, so a model below that modal count ran short.
  const bySuite = new Map<string, number[]>();
  for (const entry of exampleCoverage) {
    const list = bySuite.get(entry.suiteId) ?? [];
    list.push(entry.examples);
    bySuite.set(entry.suiteId, list);
  }
  for (const [suiteId, sizes] of bySuite) {
    const tally = new Map<number, number>();
    for (const n of sizes) tally.set(n, (tally.get(n) ?? 0) + 1);
    let full = 0;
    let best = 0;
    for (const [n, c] of tally) {
      if (c > best || (c === best && n > full)) {
        full = n;
        best = c;
      }
    }
    for (const entry of exampleCoverage) {
      if (entry.suiteId === suiteId && entry.examples < full) {
        log.warning(
          `${entry.modelId} scored on ${entry.examples} of ${full} examples in ${suiteId} -- its score rests on an incomplete run and is not comparable to models that ran all ${full}`
        );
      }
    }

    // Same modal-count logic for repetitions. A row measured once sits on a
    // wider error bar than one measured three times, but both render as a
    // single number, so the imbalance is invisible in the published artifact
    // unless it is said out loud.
    const repTally = new Map<number, number>();
    for (const entry of exampleCoverage) {
      if (entry.suiteId === suiteId && entry.repetitions > 0) {
        repTally.set(entry.repetitions, (repTally.get(entry.repetitions) ?? 0) + 1);
      }
    }
    let modalReps = 0;
    let modalRepCount = 0;
    for (const [reps, count] of repTally) {
      // Tie-break toward the LOWER repetition count: with two models at 1 and 3
      // reps the baseline is the cheaper, more common shape, and the 3-rep row
      // is the outlier worth flagging. Preferring the higher count here would
      // make the advantaged row the baseline and silence the warning entirely.
      const unset = modalRepCount === 0;
      if (unset || count > modalRepCount || (count === modalRepCount && reps < modalReps)) {
        modalReps = reps;
        modalRepCount = count;
      }
    }
    const better = [...repTally.keys()].filter((reps) => reps > modalReps);
    if (better.length > 0) {
      const maxReps = Math.max(...better);
      const advantaged = exampleCoverage
        .filter((entry) => entry.suiteId === suiteId && entry.repetitions === maxReps)
        .map((entry) => entry.modelId);
      log.warning(
        `Repetition imbalance in ${suiteId}: most models were measured with ${modalReps} repetition(s), but ${advantaged.join(
          ', '
        )} ran ${maxReps} -- the higher-repetition rows carry a narrower error bar, so ranking them against the rest compares estimates of unequal precision`
      );
    }
  }

  for (const [modelId, counts] of excludedByModel) {
    if (counts.selfJudged > 0) {
      log.warning(
        `${modelId}: dropped ${counts.selfJudged} self-judged score doc(s). ` +
          `Excluding them is correct, but a model judged by itself is not evidence ` +
          `of quality — re-run it against an independent judge to fill those cells.`
      );
    }
  }
  log.debug(`Matrix query resolved ${byModel.size} model(s) across ${suiteIds.length} suite(s)`);
  return [...byModel.values()].map((model) => {
    const excluded = excludedByModel.get(model.modelId);
    return excluded ? { ...model, excluded } : model;
  });
};
