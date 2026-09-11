/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
import { ToolingLog } from '@kbn/tooling-log';
import type { EvaluationExperimentSummary, EvaluationScoreDocument } from '@kbn/evals-common';
import type { EvalsClient, ExperimentStats } from '@kbn/evals';
import { describeJudge } from './judge_provenance';
import {
  pickLatestExperimentPerModel,
  experimentStatsToDatasets,
  queryMatrixScores,
  scoresByPrefixToDatasets,
} from './query_matrix_scores';

const experiment = (
  overrides: Partial<EvaluationExperimentSummary> & { modelId?: string }
): EvaluationExperimentSummary => {
  const { modelId, ...rest } = overrides;
  return {
    experiment_id: 'exp',
    timestamp: '2026-06-10T00:00:00.000Z',
    task_model: modelId ? { id: modelId, family: 'fam', provider: 'prov' } : undefined,
    ...rest,
  } as EvaluationExperimentSummary;
};

describe('pickLatestExperimentPerModel', () => {
  it('records self-judged per experiment from the judge and task ids', () => {
    // D4: a hardcoded `true` here would flag every row in an opted-out column
    // and no build_matrix test would notice -- the derivation only shows up
    // against live golden data. Pin it where it is computed.
    expect(describeJudge('google-gemini-3.1-pro', 'google-gemini-3.1-pro').selfJudged).toBe(true);
    // Same family, different model: gemini-3.0-flash graded by gemini-3.1-pro
    // is arm's-length and must NOT be disclosed as self-judged.
    expect(describeJudge('google-gemini-3.1-pro', 'google-gemini-3.0-flash').selfJudged).toBe(
      false
    );
    expect(describeJudge('google-gemini-3.1-pro', 'openai-gpt-5.4').selfJudged).toBe(false);
  });

  it('keeps a self-judged experiment when allowSelfJudged is set', () => {
    const experiments = [
      {
        experiment_id: 'newer-self-judged',
        task_model: { id: 'google-gemini-3.1-pro' },
        evaluator_model: { id: 'google-gemini-3.1-pro' },
        timestamp: '2026-09-01T00:00:00.000Z',
      },
    ] as unknown as Parameters<typeof pickLatestExperimentPerModel>[0];

    // Default policy drops it: a self-judged run must not silently win selection.
    expect(pickLatestExperimentPerModel(experiments).size).toBe(0);

    // Opting in recovers the row rather than leaving the cell blank.
    const kept = pickLatestExperimentPerModel(experiments, { allowSelfJudged: true });
    expect(kept.get('google-gemini-3.1-pro')?.experiment_id).toBe('newer-self-judged');
  });

  it('ignores experiments newer than asOf for every model alike', () => {
    const experiments = [
      experiment({ experiment_id: 'clean', modelId: 'm1', timestamp: '2026-08-22T00:00:00.000Z' }),
      experiment({ experiment_id: 'bad', modelId: 'm1', timestamp: '2026-09-05T00:00:00.000Z' }),
      experiment({ experiment_id: 'clean2', modelId: 'm2', timestamp: '2026-08-22T00:00:00.000Z' }),
      experiment({ experiment_id: 'bad2', modelId: 'm2', timestamp: '2026-09-05T00:00:00.000Z' }),
    ];

    // Without a cutoff the newest run wins, even when its instrumentation was
    // broken -- that is the whole reason the cutoff exists.
    expect(pickLatestExperimentPerModel(experiments).get('m1')?.experiment_id).toBe('bad');

    const asOf = Date.parse('2026-09-01T00:00:00.000Z');
    const selected = pickLatestExperimentPerModel(experiments, { now: asOf });
    // The cutoff must move BOTH models back, never one: a matrix that mixes a
    // pre-cutoff row with a post-cutoff row is not comparable across rows.
    expect(selected.get('m1')?.experiment_id).toBe('clean');
    expect(selected.get('m2')?.experiment_id).toBe('clean2');
  });

  it('reports the judge that graded the surviving run', () => {
    // Rejecting a self-judged run falls back to an older run -- which may have
    // been graded by a different judge. Sonnet 4.6 published a fleet-leading
    // 7.12 that way: its sonnet-judged runs were correctly rejected, and the
    // haiku-judged survivor scored it ~1 point higher than the judge every
    // other row was measured with. The swap has to be visible.
    const experiments = [
      {
        experiment_id: 'self-judged-newer',
        task_model: { id: 'm1' },
        evaluator_model: { id: 'm1' },
        timestamp: '2026-08-29T00:00:00.000Z',
      },
      {
        experiment_id: 'other-judge-older',
        task_model: { id: 'm1' },
        evaluator_model: { id: 'judge-b' },
        timestamp: '2026-08-22T00:00:00.000Z',
      },
    ] as unknown as Parameters<typeof pickLatestExperimentPerModel>[0];

    const selected = pickLatestExperimentPerModel(experiments);
    expect(selected.get('m1')?.experiment_id).toBe('other-judge-older');
    expect(selected.get('m1')?.evaluator_model?.id).toBe('judge-b');
  });

  it('keeps the most recent experiment per model', () => {
    const result = pickLatestExperimentPerModel([
      experiment({ experiment_id: 'old', modelId: 'm1', timestamp: '2026-06-01T00:00:00.000Z' }),
      experiment({ experiment_id: 'new', modelId: 'm1', timestamp: '2026-06-09T00:00:00.000Z' }),
      experiment({ experiment_id: 'other', modelId: 'm2', timestamp: '2026-06-05T00:00:00.000Z' }),
    ]);

    expect(result.get('m1')?.experiment_id).toBe('new');
    expect(result.get('m2')?.experiment_id).toBe('other');
  });

  it('skips a self-judged experiment so an older independent run still counts', () => {
    const result = pickLatestExperimentPerModel([
      experiment({
        experiment_id: 'clean',
        modelId: 'm1',
        timestamp: '2026-06-01T00:00:00.000Z',
        evaluator_models: [{ id: 'judge', family: 'f', provider: 'p' }],
      }),
      experiment({
        experiment_id: 'self',
        modelId: 'm1',
        timestamp: '2026-06-09T00:00:00.000Z',
        evaluator_models: [{ id: 'm1', family: 'f', provider: 'p' }],
      }),
    ]);

    expect(result.get('m1')?.experiment_id).toBe('clean');
  });

  it('ignores experiments without a task model id', () => {
    const result = pickLatestExperimentPerModel([
      experiment({ experiment_id: 'no-model', modelId: undefined }),
    ]);
    expect(result.size).toBe(0);
  });

  it('drops experiments older than the lookback window', () => {
    const now = Date.parse('2026-06-15T00:00:00.000Z');
    const result = pickLatestExperimentPerModel(
      [
        experiment({
          experiment_id: 'stale',
          modelId: 'm1',
          timestamp: '2026-05-01T00:00:00.000Z',
        }),
        experiment({
          experiment_id: 'fresh',
          modelId: 'm2',
          timestamp: '2026-06-14T00:00:00.000Z',
        }),
      ],
      { lookbackDays: 14, now }
    );

    expect(result.has('m1')).toBe(false);
    expect(result.get('m2')?.experiment_id).toBe('fresh');
  });

  it('drops experiments with unparseable timestamps instead of treating them as epoch 0', () => {
    const now = Date.parse('2026-06-15T00:00:00.000Z');
    const result = pickLatestExperimentPerModel(
      [
        experiment({ experiment_id: 'broken', modelId: 'm1', timestamp: 'not-a-date' }),
        experiment({
          experiment_id: 'fresh',
          modelId: 'm1',
          timestamp: '2026-06-14T00:00:00.000Z',
        }),
      ],
      { lookbackDays: 14, now }
    );

    expect(result.get('m1')?.experiment_id).toBe('fresh');
  });
});

describe('experimentStatsToDatasets', () => {
  it('groups evaluator stats by dataset with mean + count', () => {
    const stats: ExperimentStats = {
      taskModel: { id: 'm1' },
      evaluatorModel: { id: 'judge' },
      totalRepetitions: 1,
      stats: [
        {
          datasetId: 'd1',
          datasetName: 'D1',
          evaluatorName: 'correctness',
          stats: { mean: 0.9, median: 0.9, stdDev: 0, min: 0.9, max: 0.9, count: 10 },
        },
        {
          datasetId: 'd1',
          datasetName: 'D1',
          evaluatorName: 'groundedness',
          stats: { mean: 0.8, median: 0.8, stdDev: 0, min: 0.8, max: 0.8, count: 10 },
        },
        {
          datasetId: 'd2',
          datasetName: 'D2',
          evaluatorName: 'correctness',
          stats: { mean: 0.7, median: 0.7, stdDev: 0, min: 0.7, max: 0.7, count: 5 },
        },
      ],
    };

    expect(experimentStatsToDatasets(stats)).toEqual([
      {
        datasetId: 'd1',
        datasetName: 'D1',
        evaluators: [
          { evaluatorName: 'correctness', mean: 0.9, count: 10, min: 0.9, max: 0.9 },
          { evaluatorName: 'groundedness', mean: 0.8, count: 10, min: 0.8, max: 0.8 },
        ],
      },
      {
        datasetId: 'd2',
        datasetName: 'D2',
        evaluators: [{ evaluatorName: 'correctness', mean: 0.7, count: 5, min: 0.7, max: 0.7 }],
      },
    ]);
  });
});

describe('queryMatrixScores', () => {
  const log = new ToolingLog() as unknown as SomeDevLog;

  const stats: ExperimentStats = {
    taskModel: { id: 'm1' },
    evaluatorModel: { id: 'judge' },
    totalRepetitions: 1,
    stats: [
      {
        datasetId: 'd1',
        datasetName: 'D1',
        evaluatorName: 'correctness',
        stats: { mean: 0.9, median: 0.9, stdDev: 0, min: 0.9, max: 0.9, count: 10 },
      },
    ],
  };

  const createClient = (
    experimentsByModel: Record<string, EvaluationExperimentSummary[]>
  ): { client: EvalsClient; listExperiments: jest.Mock; getExperimentStats: jest.Mock } => {
    const listExperiments = jest
      .fn()
      .mockImplementation(async ({ taskModelId }: { taskModelId?: string }) =>
        taskModelId ? experimentsByModel[taskModelId] ?? [] : []
      );
    const getExperimentStats = jest.fn().mockResolvedValue(stats);
    const client = { listExperiments, getExperimentStats } as unknown as EvalsClient;
    return { client, listExperiments, getExperimentStats };
  };

  it('merges every shard of a sharded sweep into one row', async () => {
    // A sharded sweep splits one model's examples across VMs, each writing its
    // own execution_id. Fetching only one of them renders a single shard and
    // blanks the examples the others covered.
    const shardStats = (datasetId: string, mean: number, count: number): ExperimentStats => ({
      taskModel: { id: 'm1' },
      evaluatorModel: { id: 'judge' },
      totalRepetitions: 1,
      stats: [
        {
          datasetId,
          datasetName: datasetId.toUpperCase(),
          evaluatorName: 'correctness',
          stats: { mean, median: mean, stdDev: 0, min: mean, max: mean, count },
        },
      ],
    });

    const listExperiments = jest.fn().mockResolvedValue([
      experiment({
        experiment_id: 'exp-s1',
        execution_id: 'sweep-9-s1of2::suite-a::m1',
        modelId: 'm1',
        timestamp: '2026-06-10T00:00:00.000Z',
      }),
      experiment({
        experiment_id: 'exp-s2',
        execution_id: 'sweep-9-s2of2::suite-a::m1',
        modelId: 'm1',
        timestamp: '2026-06-10T01:00:00.000Z',
      }),
    ]);
    const getExperimentStats = jest
      .fn()
      .mockImplementation(
        async (_experimentId: string, { executionId }: { executionId?: string }) =>
          executionId === 'sweep-9-s1of2::suite-a::m1'
            ? shardStats('d1', 0.9, 10)
            : shardStats('d2', 0.5, 5)
      );
    const client = { listExperiments, getExperimentStats } as unknown as EvalsClient;

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      branch: 'main',
    });

    // Both shards fetched, not just the newest.
    expect(getExperimentStats).toHaveBeenCalledTimes(2);

    const datasets = result[0].suites[0].datasets;
    expect(datasets.map((d) => d.datasetId).sort()).toEqual(['d1', 'd2']);
  });

  it('queries each (suite, model) pair through the route model_id filter', async () => {
    const { client, listExperiments, getExperimentStats } = createClient({
      m1: [experiment({ experiment_id: 'exp-m1', modelId: 'm1' })],
      m2: [experiment({ experiment_id: 'exp-m2', modelId: 'm2' })],
    });

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1', 'm2'],
      branch: 'main',
    });

    expect(listExperiments).toHaveBeenCalledTimes(2);
    expect(listExperiments).toHaveBeenCalledWith(
      expect.objectContaining({ suiteId: 'suite-a', taskModelId: 'm1', branch: 'main' })
    );
    expect(listExperiments).toHaveBeenCalledWith(
      expect.objectContaining({ suiteId: 'suite-a', taskModelId: 'm2', branch: 'main' })
    );
    expect(getExperimentStats).toHaveBeenCalledTimes(2);
    expect(result.map((model) => model.modelId).sort()).toEqual(['m1', 'm2']);
  });

  it("carries the graded run's commit onto the suite so rows can be traced to a codebase", async () => {
    // The artifact's top-level provenance is the GENERATOR's commit. When a
    // model is appended to an existing board months later, the only honest
    // answer to "which code was this row measured on" is the experiment's own
    // git_commit_sha -- so it has to survive the query layer.
    const { client } = createClient({
      m1: [
        experiment({
          experiment_id: 'exp-m1',
          modelId: 'm1',
          git_commit_sha: 'deadbeefcafe1234',
        }),
      ],
    });

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      branch: 'main',
    });

    expect(result[0].suites[0].commitSha).toBe('deadbeefcafe1234');
  });

  it('leaves the commit undefined when the experiment summary has none', async () => {
    const { client } = createClient({
      m1: [experiment({ experiment_id: 'exp-m1', modelId: 'm1' })],
    });

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      branch: 'main',
    });

    expect(result[0].suites[0].commitSha).toBeUndefined();
  });

  it('reports self-judged exclusions so a rejected model is not mistaken for one that never ran', async () => {
    // Reproduces the 2026-08-29 persona-matrix incident: claude-4.6-sonnet was
    // its own judge, so every score was dropped by `excludeSelfJudged` and the
    // row rendered blank — indistinguishable from a model that never ran. That
    // ambiguity triggered a full re-sweep which could not, even in principle,
    // fill the cells.
    const selfJudgedScore = (index: number) =>
      ({
        task: { model: { id: 'm1' } },
        evaluator: { model: { id: 'm1' }, name: 'Factuality', score: 1 },
        example: { id: `entity-analytics-${index}` },
      } as unknown as EvaluationScoreDocument);

    const { client } = createClient({
      m1: [experiment({ experiment_id: 'exp-m1', modelId: 'm1' })],
    });
    (client as unknown as { getExperimentScores: jest.Mock }).getExperimentScores = jest
      .fn()
      .mockResolvedValue([selfJudgedScore(1), selfJudgedScore(2)]);

    const warn = jest.spyOn(log, 'warning');
    const [model] = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      branch: 'main',
      prefixesBySuite: { 'suite-a': ['entity-analytics'] },
      scoring: { excludeSelfJudged: true },
    });

    expect(model.excluded?.selfJudged).toBe(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropped 2 self-judged'));

    // No per-prefix dataset survived the policy, so the cells stay empty — but
    // the exclusion tally proves the emptiness is a judge defect, not absent data.
    expect(model.suites[0].datasets.some((d) => d.datasetId.startsWith('prefix:'))).toBe(false);
  });

  it('warns when a model ran fewer examples than its peers', async () => {
    // A short run still produces a score, and that score renders identically to
    // a complete one. 4.5-sonnet published 7.49 off 18 of 21 examples this way.
    const score = (modelId: string, exampleIndex: number) =>
      ({
        task: { model: { id: modelId }, repetition_index: 0 },
        evaluator: { model: { id: 'judge' }, name: 'Factuality', score: 1 },
        example: { id: `ex-${exampleIndex}` },
      } as unknown as EvaluationScoreDocument);

    const { client } = createClient({
      complete: [experiment({ experiment_id: 'exp-complete', modelId: 'complete' })],
      short: [experiment({ experiment_id: 'exp-short', modelId: 'short' })],
    });
    (client as unknown as { getExperimentScores: jest.Mock }).getExperimentScores = jest
      .fn()
      .mockImplementation(async (experimentId: string) =>
        experimentId === 'exp-complete'
          ? [score('complete', 1), score('complete', 2), score('complete', 3)]
          : [score('short', 1)]
      );

    const warn = jest.spyOn(log, 'warning');
    await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['complete', 'short'],
      branch: 'main',
      prefixesBySuite: { 'suite-a': ['ex'] },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('short scored on 1 of 3 examples in suite-a')
    );
  });

  it('warns when one model was measured with more repetitions than the rest', async () => {
    // Repetitions shrink judge variance, so a 3-rep row has a tighter error bar
    // than a 1-rep row. Both render as one number, so the mismatch is invisible
    // unless it is stated.
    const score = (modelId: string, exampleIndex: number, repetitionIndex: number) =>
      ({
        task: { model: { id: modelId }, repetition_index: repetitionIndex },
        evaluator: { model: { id: 'judge' }, name: 'Factuality', score: 1 },
        example: { id: `ex-${exampleIndex}` },
      } as unknown as EvaluationScoreDocument);

    const { client } = createClient({
      once: [experiment({ experiment_id: 'exp-once', modelId: 'once' })],
      thrice: [experiment({ experiment_id: 'exp-thrice', modelId: 'thrice' })],
    });
    (client as unknown as { getExperimentScores: jest.Mock }).getExperimentScores = jest
      .fn()
      .mockImplementation(async (experimentId: string) =>
        experimentId === 'exp-once'
          ? [score('once', 1, 0), score('once', 2, 0)]
          : [
              score('thrice', 1, 0),
              score('thrice', 1, 1),
              score('thrice', 1, 2),
              score('thrice', 2, 0),
            ]
      );

    const warn = jest.spyOn(log, 'warning');
    await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['once', 'thrice'],
      branch: 'main',
      prefixesBySuite: { 'suite-a': ['ex'] },
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Repetition imbalance in suite-a'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('thrice'));
  });

  it('unions a suite across several branches so no branch-local model is lost', async () => {
    // Real golden data for one suite is split across branches by model: the
    // weekly-matrix branch holds six models, while a seventh (4.5-sonnet) only
    // ever ran on the feature branch. Pinning to either single branch silently
    // discards the other's rows, so a branch LIST has to be unioned.
    const listExperiments = jest
      .fn()
      .mockImplementation(
        async ({ taskModelId, branch }: { taskModelId?: string; branch?: string }) => {
          if (branch === 'weekly' && taskModelId === 'm1') {
            return [experiment({ experiment_id: 'exp-weekly-m1', modelId: 'm1' })];
          }
          if (branch === 'feature' && taskModelId === 'm2') {
            return [experiment({ experiment_id: 'exp-feature-m2', modelId: 'm2' })];
          }
          return [];
        }
      );
    const client = {
      listExperiments,
      getExperimentStats: jest.fn().mockResolvedValue(stats),
    } as unknown as EvalsClient;

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['migrations-suite'],
      modelIds: ['m1', 'm2'],
      branch: 'main',
      branchBySuite: { 'migrations-suite': ['weekly', 'feature'] },
    });

    // Both branch-local models survive the union.
    expect(result.map((model) => model.modelId).sort()).toEqual(['m1', 'm2']);
  });

  it('prefers the newest run when the same model ran on several unioned branches', async () => {
    // Union must not resurrect a stale run: when a model exists on both
    // branches, selection still picks the most recent experiment.
    const listExperiments = jest
      .fn()
      .mockImplementation(async ({ branch }: { branch?: string }) => {
        if (branch === 'old') {
          return [
            experiment({
              experiment_id: 'exp-old',
              modelId: 'm1',
              timestamp: '2026-01-01T00:00:00.000Z',
            }),
          ];
        }
        return [
          experiment({
            experiment_id: 'exp-new',
            modelId: 'm1',
            timestamp: '2026-06-01T00:00:00.000Z',
          }),
        ];
      });
    const getExperimentStats = jest.fn().mockResolvedValue(stats);
    const client = { listExperiments, getExperimentStats } as unknown as EvalsClient;

    await queryMatrixScores(client, log, {
      suiteIds: ['migrations-suite'],
      modelIds: ['m1'],
      branch: 'main',
      branchBySuite: { 'migrations-suite': ['old', 'new'] },
    });

    // Only the newer run is fetched; the stale branch's run is never scored.
    expect(getExperimentStats).toHaveBeenCalledTimes(1);
    expect(getExperimentStats).toHaveBeenCalledWith(
      'exp-new',
      expect.objectContaining({ executionId: 'exp-new' })
    );
  });

  it('reports a fully self-judged suite as withheld, not as never-run', async () => {
    // Selection drops the self-judged experiment BEFORE scores are fetched,
    // so `latest` is undefined and the model silently vanishes from the
    // suite. A build_matrix unit test with a hand-made suite record cannot
    // catch this: the real pipeline never produces that record. Drive the
    // query layer end to end instead.
    const selfJudged = experiment({
      experiment_id: 'exp-self',
      modelId: 'm1',
      timestamp: '2026-06-10T00:00:00.000Z',
    }) as EvaluationExperimentSummary & { evaluator_model?: { id: string } };
    selfJudged.evaluator_model = { id: 'm1' };

    const { client, getExperimentStats } = createClient({ m1: [selfJudged] });
    getExperimentStats.mockResolvedValue({
      stats: [
        {
          datasetId: 'd',
          datasetName: 'd',
          evaluatorName: 'Rubric',
          stats: { mean: 0.7, median: 0.7, stdDev: 0, min: 0, max: 1, count: 4794 },
        },
      ],
      taskModel: { id: 'm1' },
      totalRepetitions: 1,
    });

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      branch: 'main',
      scoring: { excludeSelfJudged: true },
    });

    const suite = result[0]?.suites.find((entry) => entry.suiteId === 'suite-a');
    // The suite is present, carries no datasets, and states how much was
    // withheld -- the three facts a cell needs to say 'excluded' not 'missing'.
    expect(suite).toBeDefined();
    expect(suite!.datasets).toHaveLength(0);
    expect(suite!.excludedSelfJudged).toBe(4794);
  });

  it('reads a suite from its branch override instead of the global branch', async () => {
    const { client, listExperiments } = createClient({
      m1: [experiment({ experiment_id: 'exp-m1', modelId: 'm1' })],
    });

    await queryMatrixScores(client, log, {
      suiteIds: ['persona-suite', 'migrations-suite'],
      modelIds: ['m1'],
      branch: 'main',
      branchBySuite: { 'migrations-suite': 'feat/matrix-v3' },
    });

    expect(listExperiments).toHaveBeenCalledWith(
      expect.objectContaining({ suiteId: 'persona-suite', branch: 'main' })
    );
    expect(listExperiments).toHaveBeenCalledWith(
      expect.objectContaining({ suiteId: 'migrations-suite', branch: 'feat/matrix-v3' })
    );
  });

  it('picks the newest experiment within the lookback window per model', async () => {
    const now = Date.now();
    const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { client, getExperimentStats } = createClient({
      // Route returns newest first; the stale one would be picked by a naive per_page: 1
      // request if the newest ever fell outside the window.
      m1: [
        experiment({ experiment_id: 'recent', modelId: 'm1', timestamp: recent }),
        experiment({ experiment_id: 'stale', modelId: 'm1', timestamp: stale }),
      ],
    });

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      lookbackDays: 7,
    });

    expect(getExperimentStats).toHaveBeenCalledWith(
      'recent',
      expect.objectContaining({ suiteId: 'suite-a', taskModelId: 'm1' })
    );
    expect(result[0].suites[0].experimentId).toBe('recent');
  });

  it('omits models with no experiment inside the lookback window', async () => {
    const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { client, getExperimentStats } = createClient({
      m1: [experiment({ experiment_id: 'stale', modelId: 'm1', timestamp: stale })],
    });

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      lookbackDays: 7,
    });

    expect(getExperimentStats).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe('scoresByPrefixToDatasets', () => {
  const score = (exampleId: string, evaluatorName: string, s: number) =>
    ({
      example: { id: exampleId, index: 0, dataset: { id: 'ds', name: 'DS' } },
      task: { model: { id: 'm1' }, trace_id: 't' },
      evaluator: { name: evaluatorName, score: s },
      metadata: {},
    } as unknown as EvaluationScoreDocument);

  it('buckets docs by example.id prefix and computes per-evaluator means', () => {
    const datasets = scoresByPrefixToDatasets(
      [
        score('alert-analysis-a', 'correctness', 1),
        score('alert-analysis-b', 'correctness', 0),
        score('threat-hunting-a', 'correctness', 0.5),
        score('threat-hunting-b', 'groundedness', 0.8),
      ],
      ['alert-analysis', 'threat-hunting']
    );

    const byId = new Map(datasets.map((d) => [d.datasetId, d]));
    expect(byId.get('prefix:alert-analysis')?.evaluators).toEqual([
      { evaluatorName: 'correctness', mean: 0.5, count: 2 },
    ]);
    expect(byId.get('prefix:threat-hunting')?.evaluators).toEqual(
      expect.arrayContaining([
        { evaluatorName: 'correctness', mean: 0.5, count: 1 },
        { evaluatorName: 'groundedness', mean: 0.8, count: 1 },
      ])
    );
  });

  it('drops non-quality evaluators using evaluator.direction', () => {
    // Latency is minimize and Tool Calls is neutral upstream (#284027). Averaging
    // either into a 0-10 quality score is meaningless, and the name allowlist only
    // approximates it -- a renamed evaluator silently slips back in.
    const withDirection = (id: string, name: string, s: number, direction: string) =>
      ({
        example: { id, index: 0, dataset: { id: 'ds', name: 'DS' } },
        task: { model: { id: 'm1' }, trace_id: 't' },
        evaluator: { name, score: s, direction },
        metadata: {},
      } as unknown as EvaluationScoreDocument);

    const datasets = scoresByPrefixToDatasets(
      [
        withDirection('alert-analysis-a', 'correctness', 1, 'maximize'),
        withDirection('alert-analysis-b', 'Latency', 900, 'minimize'),
        withDirection('alert-analysis-c', 'Tool Calls', 42, 'neutral'),
      ],
      ['alert-analysis']
    );

    // Only the maximize evaluator survives; 900 and 42 would wreck the mean.
    expect(datasets[0].evaluators).toEqual([{ evaluatorName: 'correctness', mean: 1, count: 1 }]);
  });

  it('matches exact example ids and prefix-dash boundaries only', () => {
    const datasets = scoresByPrefixToDatasets(
      [score('alert-analysis', 'correctness', 1), score('alert-analysisx', 'correctness', 0)],
      ['alert-analysis']
    );
    // 'alert-analysisx' must NOT match prefix 'alert-analysis'
    expect(datasets).toHaveLength(1);
    expect(datasets[0].evaluators[0].count).toBe(1);
  });

  it('skips docs without evaluator score', () => {
    const datasets = scoresByPrefixToDatasets(
      [
        {
          ...score('alert-analysis-a', 'correctness', 1),
          evaluator: { name: 'x' },
        } as EvaluationScoreDocument,
      ],
      ['alert-analysis']
    );
    expect(datasets).toEqual([]);
  });
});

describe('queryMatrixScores with examplePrefixes', () => {
  const log = new ToolingLog() as unknown as SomeDevLog;

  const stats: ExperimentStats = {
    taskModel: { id: 'm1' },
    evaluatorModel: { id: 'judge' },
    totalRepetitions: 1,
    stats: [
      {
        datasetId: 'd1',
        datasetName: 'D1',
        evaluatorName: 'correctness',
        stats: { mean: 0.9, median: 0.9, stdDev: 0, min: 0.9, max: 0.9, count: 10 },
      },
    ],
  };

  const createClient = (): { client: EvalsClient; getExperimentScores: jest.Mock } => {
    const listExperiments = jest.fn().mockResolvedValue([
      {
        experiment_id: 'e1',
        execution_id: 'x1',
        timestamp: new Date().toISOString(),
        task_model: { id: 'm1' },
      },
    ]);
    const getExperimentStats = jest.fn().mockResolvedValue(stats);
    const getExperimentScores = jest.fn().mockResolvedValue([
      {
        example: { id: 'alert-analysis-a', index: 0, dataset: { id: 'd1', name: 'D1' } },
        task: { model: { id: 'm1' }, trace_id: 't' },
        evaluator: { name: 'correctness', score: 0.6 },
        metadata: {},
      },
    ]);
    const client = {
      listExperiments,
      getExperimentStats,
      getExperimentScores,
    } as unknown as EvalsClient;
    return { client, getExperimentScores };
  };

  it('fetches per-example scores and appends synthetic prefix datasets when prefixes requested', async () => {
    const { client, getExperimentScores } = createClient();

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      prefixesBySuite: { 'suite-a': ['alert-analysis'] },
    });

    expect(getExperimentScores).toHaveBeenCalledWith('e1', expect.anything());
    const datasetIds = result[0].suites[0].datasets.map((d) => d.datasetId);
    expect(datasetIds).toContain('d1');
    expect(datasetIds).toContain('prefix:alert-analysis');
  });

  it('applies the per-suite scoring policy, not the global one, to prefix scores', async () => {
    // The graded model IS the judge. Globally self-judged scores are dropped;
    // the audited suite opts out via scoringBySuite and must keep its cell.
    const selfJudged = [
      {
        example: { id: 'alert-analysis-a', index: 0, dataset: { id: 'd1', name: 'D1' } },
        task: { model: { id: 'm1' }, trace_id: 't' },
        evaluator: { name: 'correctness', score: 0.6, model: { id: 'm1' } },
        metadata: {},
      },
    ];

    const build = () => {
      const listExperiments = jest.fn().mockResolvedValue([
        {
          experiment_id: 'e1',
          execution_id: 'x1',
          timestamp: new Date().toISOString(),
          task_model: { id: 'm1' },
          // The judge IS the graded model here; the aggregation must derive
          // that from these two ids so the artifact can disclose it per row.
          evaluator_model: { id: 'm1' },
        },
      ]);
      return {
        listExperiments,
        getExperimentStats: jest.fn().mockResolvedValue(stats),
        getExperimentScores: jest.fn().mockResolvedValue(selfJudged),
      } as unknown as EvalsClient;
    };

    const prefixIds = (r: Awaited<ReturnType<typeof queryMatrixScores>>) =>
      r[0].suites[0].datasets.map((d) => d.datasetId);

    // Strict global policy: the self-judged experiment is dropped outright,
    // so the model yields no scores at all.
    const strict = await queryMatrixScores(build(), log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      prefixesBySuite: { 'suite-a': ['alert-analysis'] },
      scoring: { excludeSelfJudged: true },
    });
    // The suite is now RECORDED as withheld rather than vanishing, but it
    // still yields no datasets, so no score can be published from it.
    const strictSuite = strict[0]?.suites.find((entry) => entry.suiteId === 'suite-a');
    expect(strictSuite?.datasets ?? []).toHaveLength(0);
    expect(strictSuite?.excludedSelfJudged).toBeGreaterThan(0);

    // Same global policy, but this suite opted out -> the cell survives.
    const opted = await queryMatrixScores(build(), log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      prefixesBySuite: { 'suite-a': ['alert-analysis'] },
      scoring: { excludeSelfJudged: true },
      scoringBySuite: { 'suite-a': { excludeSelfJudged: false } },
    });
    expect(prefixIds(opted)).toContain('prefix:alert-analysis');
    // ...carrying the disclosure derived from the experiment's own ids.
    expect(opted[0].suites[0].selfJudged).toBe(true);

    // An arm's-length judge in the same opted-out suite must NOT be flagged,
    // or the artifact libels every other row in the column.
    const armsLength = build() as unknown as {
      listExperiments: jest.Mock;
    };
    armsLength.listExperiments.mockResolvedValue([
      {
        experiment_id: 'e1',
        execution_id: 'x1',
        timestamp: new Date().toISOString(),
        task_model: { id: 'm1' },
        evaluator_model: { id: 'some-other-judge' },
      },
    ]);
    const independent = await queryMatrixScores(armsLength as unknown as EvalsClient, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      prefixesBySuite: { 'suite-a': ['alert-analysis'] },
      scoring: { excludeSelfJudged: true },
      scoringBySuite: { 'suite-a': { excludeSelfJudged: false } },
    });
    expect(independent[0].suites[0].selfJudged).toBe(false);
  });

  it('does not fetch per-example scores when no prefixes requested', async () => {
    const { client, getExperimentScores } = createClient();

    await queryMatrixScores(client, log, { suiteIds: ['suite-a'], modelIds: ['m1'] });

    expect(getExperimentScores).not.toHaveBeenCalled();
  });

  it('degrades gracefully when the scores route fails', async () => {
    const listExperiments = jest.fn().mockResolvedValue([
      {
        experiment_id: 'e1',
        execution_id: 'x1',
        timestamp: new Date().toISOString(),
        task_model: { id: 'm1' },
      },
    ]);
    const getExperimentStats = jest.fn().mockResolvedValue(stats);
    const getExperimentScores = jest.fn().mockRejectedValue(new Error('route down'));
    const client = {
      listExperiments,
      getExperimentStats,
      getExperimentScores,
    } as unknown as EvalsClient;

    const result = await queryMatrixScores(client, log, {
      suiteIds: ['suite-a'],
      modelIds: ['m1'],
      prefixesBySuite: { 'suite-a': ['alert-analysis'] },
    });

    expect(result[0].suites[0].datasets.map((d) => d.datasetId)).toEqual(['d1']);
  });
});

describe('scoresByPrefixToDatasets errored-out tracking', () => {
  const doc = (exampleId: string, evaluatorName: string, s: number | undefined, label?: string) =>
    ({
      example: { id: exampleId, index: 0, dataset: { id: 'ds', name: 'DS' } },
      task: { model: { id: 'm1' }, trace_id: 't' },
      evaluator: {
        name: evaluatorName,
        ...(s !== undefined ? { score: s } : {}),
        ...(label ? { label } : {}),
      },
      metadata: {},
    } as unknown as EvaluationScoreDocument);

  it('names evaluators that errored on every example and never scored', () => {
    // The DeepSeek alert-analysis-a failure shape: Trajectory and SkillInvoked
    // wrote label=error docs for all examples, so they vanish from the mean.
    const datasets = scoresByPrefixToDatasets(
      [
        doc('alert-analysis-a', 'MinExpectedSteps', 1),
        doc('alert-analysis-a', 'FinalAnswerPresent', 1),
        doc('alert-analysis-a', 'Trajectory', undefined, 'error'),
        doc('alert-analysis-b', 'Trajectory', undefined, 'error'),
        doc('alert-analysis-a', 'SkillInvoked', undefined, 'error'),
      ],
      ['alert-analysis']
    );

    expect(datasets[0].erroredOutEvaluators).toEqual(
      expect.arrayContaining(['Trajectory', 'SkillInvoked'])
    );
    // Saturated survivors still score — the guard flags the broken ones.
    expect(datasets[0].evaluators).toHaveLength(2);
  });

  it('flags a trace evaluator that reported unavailable for every example', () => {
    // The Claude Sonnet 4.5 shape: SkillInvoked found no tool spans and wrote
    // label=unavailable with a null score for all 19 examples. That is not
    // "error", so the cell used to publish an overall built only on the
    // evaluators that survived -- ranked against peers graded on the full set.
    const datasets = scoresByPrefixToDatasets(
      [
        doc('alert-analysis-a', 'MinExpectedSteps', 1),
        doc('alert-analysis-a', 'FinalAnswerPresent', 1),
        doc('alert-analysis-a', 'SkillInvoked', undefined, 'unavailable'),
        doc('alert-analysis-b', 'SkillInvoked', undefined, 'unavailable'),
      ],
      ['alert-analysis']
    );

    expect(datasets[0].erroredOutEvaluators).toEqual(expect.arrayContaining(['SkillInvoked']));
  });

  it('does not flag an evaluator that errored once but recovered', () => {
    const datasets = scoresByPrefixToDatasets(
      [
        doc('alert-analysis-a', 'Latency', undefined, 'error'),
        doc('alert-analysis-b', 'Latency', 900),
        doc('alert-analysis-a', 'correctness', 1),
      ],
      ['alert-analysis']
    );

    expect(datasets[0].erroredOutEvaluators ?? []).toEqual([]);
  });

  it('omits the field when nothing errored out', () => {
    const datasets = scoresByPrefixToDatasets(
      [doc('alert-analysis-a', 'correctness', 1)],
      ['alert-analysis']
    );
    expect(datasets[0].erroredOutEvaluators).toBeUndefined();
  });
});
