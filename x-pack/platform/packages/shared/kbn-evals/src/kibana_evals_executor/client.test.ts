/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('@kbn/inference-tracing', () => ({
  // Avoid initializing tracing in unit tests (can keep Jest alive).
  withInferenceContext: (fn: () => unknown) => fn(),
}));
jest.mock('../utils/tracing', () => ({
  withTaskSpan: jest.fn((_name: string, _opts: unknown, cb: () => unknown) => cb()),
  withEvaluatorSpan: jest.fn((_name: string, _opts: unknown, cb: () => unknown) => cb()),
  getCurrentTraceId: jest.fn(),
}));

import { ModelFamily, ModelProvider } from '@kbn/inference-common';
import type { Model } from '@kbn/inference-common';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvaluationDataset, Evaluator } from '../types';
import { getCurrentTraceId, withEvaluatorSpan, withTaskSpan } from '../utils/tracing';
import { KibanaEvalsClient } from './client';

describe('KibanaEvalsClient', () => {
  const mockLog: jest.Mocked<SomeDevLog> = {
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  } as any;

  const model: Model = {
    id: 'gpt-4',
    family: ModelFamily.GPT,
    provider: ModelProvider.OpenAI,
  };

  const createClient = (overrides?: Partial<ConstructorParameters<typeof KibanaEvalsClient>[0]>) =>
    new KibanaEvalsClient({
      log: mockLog,
      model,
      executionId: 'build-run-1',
      repetitions: 1,
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentTraceId as jest.Mock).mockReturnValue('default-trace-id');
  });

  it('computes a stable datasetId for datasets with the same name', async () => {
    const client = createClient();

    const datasetA: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [
        { input: { q: 1 }, metadata: {} },
        { input: { q: 2 }, output: { a: 2 } },
      ],
    };

    const datasetB: EvaluationDataset = {
      name: 'ds',
      description: 'different description',
      examples: [{ input: { q: 99 }, output: { a: 99 } }],
    };

    const [expA] = await client.runExperiment(
      { datasets: [datasetA], task: async () => ({ ok: true }) },
      []
    );
    const [expB] = await client.runExperiment(
      { datasets: [datasetB], task: async () => ({ ok: true }) },
      []
    );

    expect(expA.datasetId).toBe(expB.datasetId);
  });

  it('produces different datasetIds for datasets with different names', async () => {
    const client = createClient();

    const datasetA: EvaluationDataset = {
      name: 'dataset-alpha',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { a: 1 } }],
    };

    const datasetB: EvaluationDataset = {
      name: 'dataset-beta',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { a: 1 } }],
    };

    const [expA] = await client.runExperiment(
      { datasets: [datasetA], task: async () => ({ ok: true }) },
      []
    );
    const [expB] = await client.runExperiment(
      { datasets: [datasetB], task: async () => ({ ok: true }) },
      []
    );

    expect(expA.datasetId).not.toBe(expB.datasetId);
  });

  it('respects repetitions and produces expected DatasetRunResult shape', async () => {
    const client = createClient({ repetitions: 2 });

    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [
        { input: { q: 1 }, output: { expected: 1 } },
        { input: { q: 2 }, output: { expected: 2 } },
      ],
    };

    let taskCalls = 0;
    const task = async () => {
      taskCalls++;
      return { value: taskCalls };
    };

    const evaluators: Array<Evaluator<EvaluationDataset['examples'][number], { value: number }>> = [
      {
        name: 'AlwaysOne',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async () => ({ score: 1 }),
      },
      {
        name: 'HasValue',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ output }) => ({ score: typeof output?.value === 'number' ? 1 : 0 }),
      },
    ];

    const [exp] = await client.runExperiment(
      { datasets: [dataset], task, metadata: { foo: 'bar' } },
      evaluators
    );

    expect(taskCalls).toBe(4); // 2 examples * 2 repetitions
    expect(exp.datasetName).toBe('ds');
    expect(exp.datasetDescription).toBe('desc');
    expect(typeof exp.id).toBe('string');
    expect(exp.id.length).toBeGreaterThan(0);

    const runEntries = Object.values(exp.runs);
    expect(runEntries).toHaveLength(4);
    expect(runEntries.map((r) => r.exampleIndex).sort()).toEqual([0, 0, 1, 1]);
    expect(runEntries.map((r) => r.repetition).sort()).toEqual([0, 0, 1, 1]);
    runEntries.forEach((run) => {
      expect(run).toEqual(
        expect.objectContaining({
          input: expect.any(Object),
          output: expect.any(Object),
        })
      );
    });

    expect(exp.evaluationRuns).toHaveLength(4 * evaluators.length);
    expect(exp.evaluationRuns.map((r) => r.name).sort()).toEqual([
      'AlwaysOne',
      'AlwaysOne',
      'AlwaysOne',
      'AlwaysOne',
      'HasValue',
      'HasValue',
      'HasValue',
      'HasValue',
    ]);

    expect(exp.experimentMetadata).toMatchObject({
      foo: 'bar',
      model,
      executionId: 'build-run-1',
    });

    const all = await client.getDatasetRunResults();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(exp.id);
  });

  it('captures and stores trace IDs for tasks and evaluators', async () => {
    const client = createClient();
    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { expected: 1 } }],
    };
    const task = async () => ({ value: 1 });
    const evaluators: Array<Evaluator<EvaluationDataset['examples'][number], { value: number }>> = [
      {
        name: 'HasValue',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ output }) => ({ score: typeof output?.value === 'number' ? 1 : 0 }),
      },
    ];

    const mockTaskTraceId = 'task-trace-id';
    const mockEvalTraceId = 'evaluator-trace-id';
    (getCurrentTraceId as jest.Mock)
      .mockReturnValueOnce(mockTaskTraceId)
      .mockReturnValueOnce(mockEvalTraceId);

    const [exp] = await client.runExperiment({ datasets: [dataset], task }, evaluators);
    const [firstRun] = Object.values(exp.runs);
    expect(firstRun).toBeDefined();
    expect(firstRun.traceId).toBe(mockTaskTraceId);

    expect(exp.evaluationRuns).toHaveLength(1);
    expect(exp.evaluationRuns[0].traceId).toBe(mockEvalTraceId);

    expect(withTaskSpan).toHaveBeenCalled();
    expect(withEvaluatorSpan).toHaveBeenCalled();
    expect(getCurrentTraceId).toHaveBeenCalled();
  });

  it('handles missing trace IDs gracefully', async () => {
    const client = createClient();
    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { expected: 1 } }],
    };
    const task = async () => ({ value: 1 });
    const evaluators: Array<Evaluator<EvaluationDataset['examples'][number], { value: number }>> = [
      {
        name: 'HasValue',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ output }) => ({ score: typeof output?.value === 'number' ? 1 : 0 }),
      },
    ];

    (getCurrentTraceId as jest.Mock).mockReturnValue(null);

    const [exp] = await client.runExperiment({ datasets: [dataset], task }, evaluators);
    const runKeys = Object.keys(exp.runs);
    const firstRun = exp.runs[runKeys[0]];
    expect(firstRun.traceId).toBeNull();
    expect(exp.evaluationRuns[0].traceId).toBeNull();
    expect(exp.evaluationRuns.length).toBeGreaterThan(0);
  });

  it('copies evaluator.direction onto each EvaluationRun', async () => {
    const client = createClient();
    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { expected: 1 } }],
    };
    const task = async () => ({ value: 1 });
    const evaluators: Array<Evaluator<EvaluationDataset['examples'][number], { value: number }>> = [
      {
        name: 'Latency',
        kind: 'CODE',
        direction: 'minimize',
        evaluate: async () => ({ score: 100 }),
      },
      {
        name: 'Quality',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async () => ({ score: 1 }),
      },
    ];

    const [exp] = await client.runExperiment({ datasets: [dataset], task }, evaluators);
    const byName = Object.fromEntries(exp.evaluationRuns.map((run) => [run.name, run]));

    expect(byName.Latency.direction).toBe('minimize');
    expect(byName.Quality.direction).toBe('maximize');
  });

  it('prefers a task-provided traceId over the client task-span id for the stored run and evaluator output', async () => {
    const client = createClient();
    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { expected: 1 } }],
    };
    const task = async () => ({ value: 1, traceId: 'task-response-trace' });

    let seenOutputTraceId: string | undefined;
    const evaluators: Array<
      Evaluator<EvaluationDataset['examples'][number], { value: number; traceId?: string }>
    > = [
      {
        name: 'CapturesTraceId',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ output }) => {
          seenOutputTraceId = output?.traceId;
          return { score: 1 };
        },
      },
    ];

    (getCurrentTraceId as jest.Mock).mockReturnValue('client-task-span-trace');

    const [exp] = await client.runExperiment({ datasets: [dataset], task }, evaluators);

    expect(seenOutputTraceId).toBe('task-response-trace');

    const [firstRun] = Object.values(exp.runs);
    expect(firstRun.traceId).toBe('task-response-trace');
  });

  it('falls back to the client task-span id when the task does not surface a traceId', async () => {
    const client = createClient();
    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { expected: 1 } }],
    };
    const task = async () => ({ value: 1 });

    let seenOutputTraceId: string | undefined;
    const evaluators: Array<
      Evaluator<EvaluationDataset['examples'][number], { value: number; traceId?: string }>
    > = [
      {
        name: 'CapturesTraceId',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ output }) => {
          seenOutputTraceId = output?.traceId;
          return { score: 1 };
        },
      },
    ];

    (getCurrentTraceId as jest.Mock).mockReturnValue('client-task-span-trace');

    await client.runExperiment({ datasets: [dataset], task }, evaluators);

    expect(seenOutputTraceId).toBe('client-task-span-trace');
  });

  it('falls back to the client task-span id when the task surfaces an empty-string traceId', async () => {
    const client = createClient();
    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [{ input: { q: 1 }, output: { expected: 1 } }],
    };
    const task = async () => ({ value: 1, traceId: '' });

    let seenOutputTraceId: string | undefined;
    const evaluators: Array<
      Evaluator<EvaluationDataset['examples'][number], { value: number; traceId?: string }>
    > = [
      {
        name: 'CapturesTraceId',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ output }) => {
          seenOutputTraceId = output?.traceId;
          return { score: 1 };
        },
      },
    ];

    (getCurrentTraceId as jest.Mock).mockReturnValue('client-task-span-trace');

    await client.runExperiment({ datasets: [dataset], task }, evaluators);

    expect(seenOutputTraceId).toBe('client-task-span-trace');
  });

  it('limits concurrent task execution using the concurrency option', async () => {
    const client = createClient();

    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [
        { input: { i: 1 } },
        { input: { i: 2 } },
        { input: { i: 3 } },
        { input: { i: 4 } },
      ],
    };

    let inFlight = 0;
    let maxInFlight = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const task = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate;
      inFlight--;
      return { ok: true };
    };

    const promise = client.runExperiment({ datasets: [dataset], task, concurrency: 2 }, []);

    // Wait until the limiter allows 2 tasks to start (and then blocks).
    for (let i = 0; i < 200; i++) {
      if (inFlight === 2) break;
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(inFlight).toBe(2);
    expect(maxInFlight).toBe(2);

    release();
    await promise;

    expect(maxInFlight).toBe(2);
  });

  it('upserts dataset and resolves upstream dataset when trustUpstreamDataset=true', async () => {
    const getDatasetByName = jest.fn().mockResolvedValue({
      id: 'upstream-dataset-id',
      name: 'external-dataset',
      description: 'resolved from ES',
      examples: [{ input: { q: 'resolved' }, output: { expected: 'answer' } }],
    });
    const upsertDataset = jest.fn().mockResolvedValue('server-assigned-id');
    const client = createClient({ getDatasetByName, upsertDataset });

    const task = jest.fn(async () => ({ ok: true }));
    const evaluator: Evaluator<EvaluationDataset['examples'][number], { ok: boolean }> = {
      name: 'AlwaysOne',
      kind: 'CODE',
      direction: 'maximize',
      evaluate: async () => ({ score: 1 }),
    };

    const [result] = await client.runExperiment(
      {
        datasets: [
          {
            name: 'external-dataset',
            description: 'local placeholder',
            examples: [],
          },
        ],
        task,
        trustUpstreamDataset: true,
      },
      [evaluator]
    );

    expect(getDatasetByName).toHaveBeenCalledWith('external-dataset');
    expect(upsertDataset).toHaveBeenCalledWith({
      name: 'external-dataset',
      description: 'resolved from ES',
      tags: undefined,
      maturity: undefined,
      examples: [{ input: { q: 'resolved' }, output: { expected: 'answer' } }],
    });
    expect(task).toHaveBeenCalledTimes(1);
    expect(result.datasetName).toBe('external-dataset');
    expect(result.datasetDescription).toBe('resolved from ES');
    expect(Object.values(result.runs)).toHaveLength(1);
  });

  it('stamps scores with the dataset id the server assigned', async () => {
    const onEvaluationComplete = jest.fn().mockResolvedValue(undefined);
    const client = createClient({
      repetitions: 1,
      onEvaluationComplete,
      upsertDataset: jest.fn().mockResolvedValue('server-assigned-id'),
    });

    const [exp] = await client.runExperiment(
      {
        datasets: [{ name: 'ds', description: 'desc', examples: [{ input: { q: 1 } }] }],
        task: async () => ({ ok: true }),
      },
      [
        {
          name: 'AlwaysOne',
          kind: 'CODE',
          direction: 'maximize',
          evaluate: async () => ({ score: 1 }),
        },
      ]
    );

    expect(exp.datasetId).toBe('server-assigned-id');
    expect(onEvaluationComplete.mock.calls[0][0].datasetId).toBe('server-assigned-id');
  });

  it('falls back to the upstream dataset id when nothing persists the dataset', async () => {
    const client = createClient({
      repetitions: 1,
      getDatasetByName: jest.fn().mockResolvedValue({
        id: 'upstream-dataset-id',
        name: 'ds',
        description: 'desc',
        examples: [{ input: { q: 1 } }],
      }),
    });

    const [exp] = await client.runExperiment(
      {
        datasets: [{ name: 'ds', description: 'placeholder', examples: [] }],
        task: async () => ({ ok: true }),
        trustUpstreamDataset: true,
      },
      []
    );

    expect(exp.datasetId).toBe('upstream-dataset-id');
  });

  it('throws when trustUpstreamDataset=true without getDatasetByName', async () => {
    const client = createClient();

    await expect(
      client.runExperiment(
        {
          datasets: [
            {
              name: 'external-dataset',
              description: 'placeholder',
              examples: [],
            },
          ],
          task: async () => ({ ok: true }),
          trustUpstreamDataset: true,
        },
        []
      )
    ).rejects.toThrow(
      'KibanaEvalsClient runExperiment called with trustUpstreamDataset=true, but getDatasetByName is not configured'
    );
  });

  describe('onEvaluationComplete callback', () => {
    const dataset: EvaluationDataset = {
      name: 'ds',
      description: 'desc',
      examples: [
        { id: 'ex-1', input: { q: 1 }, output: { expected: 1 } },
        { id: 'ex-2', input: { q: 2 }, output: { expected: 2 } },
      ],
    };

    const evaluators: Array<Evaluator<EvaluationDataset['examples'][number], { value: number }>> = [
      {
        name: 'AlwaysOne',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async () => ({ score: 1 }),
      },
      {
        name: 'HasValue',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ output }) => ({ score: typeof output?.value === 'number' ? 1 : 0 }),
      },
    ];

    it('invokes the callback once per evaluator per example per repetition', async () => {
      const onEvaluationComplete = jest.fn().mockResolvedValue(undefined);
      const client = createClient({ repetitions: 2, onEvaluationComplete });

      await client.runExperiment(
        { datasets: [dataset], task: async () => ({ value: 42 }) },
        evaluators
      );

      // 2 examples * 2 repetitions * 2 evaluators = 8 calls
      expect(onEvaluationComplete).toHaveBeenCalledTimes(8);
    });

    it('passes correct event data to the callback', async () => {
      const onEvaluationComplete = jest.fn().mockResolvedValue(undefined);
      const client = createClient({ repetitions: 1, onEvaluationComplete });

      const [exp] = await client.runExperiment(
        {
          datasets: [{ ...dataset, examples: [dataset.examples[0]] }],
          task: async () => ({ value: 1 }),
        },
        [evaluators[0]]
      );

      expect(onEvaluationComplete).toHaveBeenCalledTimes(1);
      const event = onEvaluationComplete.mock.calls[0][0];

      expect(event.experimentId).toBe(exp.id);
      expect(event.datasetId).toBe(exp.datasetId);
      expect(event.datasetName).toBe('ds');
      expect(event.exampleId).toBe('ex-1');
      expect(event.taskRun).toEqual(
        expect.objectContaining({
          exampleIndex: 0,
          repetition: 0,
          output: { value: 1 },
        })
      );
      expect(event.evaluationRun).toEqual(
        expect.objectContaining({
          name: 'AlwaysOne',
          result: { score: 1 },
        })
      );
    });

    it('reports each evaluator kind and judge model on the event', async () => {
      const onEvaluationComplete = jest.fn().mockResolvedValue(undefined);
      const client = createClient({ repetitions: 1, onEvaluationComplete });
      const judgeModel = { id: 'gpt-4o', family: 'GPT', provider: 'OpenAI' };

      await client.runExperiment(
        {
          datasets: [{ ...dataset, examples: [dataset.examples[0]] }],
          task: async () => ({ value: 1 }),
        },
        [
          {
            name: 'Judge',
            kind: 'LLM',
            direction: 'maximize',
            evaluate: async () => ({ score: 1 }),
            getModel: () => judgeModel,
          },
          evaluators[0],
        ]
      );

      expect(
        onEvaluationComplete.mock.calls.map(([{ evaluationRun }]) => ({
          name: evaluationRun.name,
          kind: evaluationRun.kind,
          model: evaluationRun.model,
        }))
      ).toEqual([
        { name: 'Judge', kind: 'LLM', model: judgeModel },
        { name: 'AlwaysOne', kind: 'CODE', model: undefined },
      ]);
    });

    it('reads the judge model only after the evaluator resolves', async () => {
      const onEvaluationComplete = jest.fn().mockResolvedValue(undefined);
      const client = createClient({ repetitions: 1, onEvaluationComplete });
      // Mirrors EvaluatorApiClient, which only learns its model from the response.
      let lateModel: { id: string } | undefined;

      await client.runExperiment(
        {
          datasets: [{ ...dataset, examples: [dataset.examples[0]] }],
          task: async () => ({ value: 1 }),
        },
        [
          {
            name: 'LateJudge',
            kind: 'LLM',
            direction: 'maximize',
            evaluate: async () => {
              lateModel = { id: 'resolved-late' };
              return { score: 1 };
            },
            getModel: () => lateModel,
          },
        ]
      );

      expect(onEvaluationComplete.mock.calls[0][0].evaluationRun.model).toEqual({
        id: 'resolved-late',
      });
    });

    it('reads the evaluator version after the evaluator resolves', async () => {
      const onEvaluationComplete = jest.fn().mockResolvedValue(undefined);
      const client = createClient({ repetitions: 1, onEvaluationComplete });
      let resolvedVersion: string | undefined;

      await client.runExperiment(
        {
          datasets: [{ ...dataset, examples: [dataset.examples[0]] }],
          task: async () => ({ value: 1 }),
        },
        [
          {
            name: 'VersionedJudge',
            kind: 'LLM',
            direction: 'maximize',
            evaluate: async () => {
              resolvedVersion = '1.2.0';
              return { score: 1 };
            },
            getVersion: () => resolvedVersion,
          },
        ]
      );

      expect(onEvaluationComplete.mock.calls[0][0].evaluationRun.version).toBe('1.2.0');
    });

    it('uses stringified exampleIndex when example has no id', async () => {
      const onEvaluationComplete = jest.fn().mockResolvedValue(undefined);
      const client = createClient({ repetitions: 1, onEvaluationComplete });

      const noIdDataset: EvaluationDataset = {
        name: 'no-ids',
        description: 'desc',
        examples: [{ input: { q: 1 } }],
      };

      await client.runExperiment({ datasets: [noIdDataset], task: async () => ({ value: 1 }) }, [
        evaluators[0],
      ]);

      const event = onEvaluationComplete.mock.calls[0][0];
      expect(event.exampleId).toBe('0');
    });

    it('does not abort the experiment when the callback throws', async () => {
      const onEvaluationComplete = jest.fn().mockRejectedValue(new Error('ES write failed'));
      const client = createClient({ repetitions: 1, onEvaluationComplete });

      const [exp] = await client.runExperiment(
        { datasets: [dataset], task: async () => ({ value: 1 }) },
        evaluators
      );

      // 2 examples * 1 rep * 2 evaluators = 4 calls, all throwing
      expect(onEvaluationComplete).toHaveBeenCalledTimes(4);
      expect(mockLog.warning).toHaveBeenCalledWith(
        expect.stringContaining('Incremental score export failed')
      );

      // Experiment still completes and accumulates all results
      expect(exp.evaluationRuns).toHaveLength(4);
      expect(Object.values(exp.runs)).toHaveLength(2);
    });

    it('is not invoked when no callback is provided', async () => {
      const client = createClient({ repetitions: 1 });

      const [exp] = await client.runExperiment(
        { datasets: [dataset], task: async () => ({ value: 1 }) },
        evaluators
      );

      expect(exp.evaluationRuns).toHaveLength(4);
    });
  });

  it('passes example identity to evaluators so per-example readouts can key on it', async () => {
    const client = createClient({ repetitions: 2 });

    const dataset: EvaluationDataset = {
      name: 'identity-ds',
      description: 'desc',
      examples: [
        { id: 'ex-a', input: { q: 'a' }, output: { ok: true } },
        { input: { q: 'b' }, output: { ok: true } },
      ],
    };

    const seen: Array<{
      exampleId?: string;
      exampleIndex?: number;
      repetition?: number;
    }> = [];
    const evaluators: Array<Evaluator<EvaluationDataset['examples'][number], { value: number }>> = [
      {
        name: 'Identity',
        kind: 'CODE',
        direction: 'maximize',
        evaluate: async ({ exampleId, exampleIndex, repetition }) => {
          seen.push({ exampleId, exampleIndex, repetition });
          return { score: 1 };
        },
      },
    ];

    await client.runExperiment(
      { datasets: [dataset], task: async () => ({ value: 1 }) },
      evaluators
    );

    // Without this an evaluator can only re-derive identity by hashing `input`,
    // which breaks whenever a dataset edits an input string (#288243).
    expect(seen).toEqual([
      { exampleId: 'ex-a', exampleIndex: 0, repetition: 0 },
      { exampleId: undefined, exampleIndex: 1, repetition: 0 },
      { exampleId: 'ex-a', exampleIndex: 0, repetition: 1 },
      { exampleId: undefined, exampleIndex: 1, repetition: 1 },
    ]);
  });
});
