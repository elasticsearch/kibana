/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { SomeDevLog } from '@kbn/some-dev-log';
import {
  EVALS_DATASET_RESOLVE_URL,
  EVALS_DATASET_UPSERT_URL,
  EVALS_DATASET_URL,
  EVALS_EXPERIMENT_SCORES_URL,
  EVALS_EXPERIMENT_URL,
  EVALS_EXPERIMENTS_URL,
  EVALS_SCORES_URL,
  MAX_SCORES_PER_QUERY,
  type EvaluationScoreDocument,
  type IngestScoresRequestBodyInput,
} from '@kbn/evals-common';
import type { IngestScoresError, UpsertDatasetInput } from './evals_client';
import { EvalsClient } from './evals_client';

const createMockKbnClient = (): jest.Mocked<KbnClient> =>
  ({
    request: jest.fn(),
  } as unknown as jest.Mocked<KbnClient>);

const asKbnResponse = <T>(value: T, status = 200): Awaited<ReturnType<KbnClient['request']>> =>
  ({ data: value, status, statusText: 'OK', headers: new Headers() } as unknown as Awaited<
    ReturnType<KbnClient['request']>
  >);

const createLog = (): jest.Mocked<SomeDevLog> =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    trace: jest.fn(),
    success: jest.fn(),
    fatal: jest.fn(),
  } as unknown as jest.Mocked<SomeDevLog>);

const createIngestRequest = (): IngestScoresRequestBodyInput => ({
  experiment_id: 'experiment-1',
  task_model: { id: 'gpt-4', family: 'gpt', provider: 'openai' },
  evaluator_model: { id: 'gpt-4o-mini', family: 'gpt', provider: 'openai' },
  metadata: {
    execution_id: 'execution-1',
    suite_id: 'suite-a',
    total_repetitions: 2,
    hostname: 'ci-host',
    git: { branch: 'main', commit_sha: 'abc123' },
    ci: {
      build_id: 'bk-build',
      job_id: 'bk-job',
    },
  },
  scores: [
    {
      example: {
        id: 'example-1',
        index: 0,
        input: { question: 'How many alerts?' },
        dataset: {
          id: 'dataset-1',
          name: 'Dataset 1',
        },
      },
      task: {
        trace_id: 'trace-1',
        repetition_index: 0,
        output: { answer: '42' },
      },
      evaluator: {
        name: 'correctness',
        score: 0.95,
        label: 'pass',
        explanation: 'Good answer',
        metadata: { rationale: 'matched expected output' },
        trace_id: null,
      },
    },
  ],
});

const createScoreDocument = (id: string): EvaluationScoreDocument => ({
  '@timestamp': '2026-05-01T11:00:00.000Z',
  experiment_id: 'experiment-1',
  example: {
    id,
    index: 0,
    input: { question: 'How many alerts?' },
    dataset: {
      id: 'dataset-1',
      name: 'Dataset 1',
    },
  },
  task: {
    trace_id: 'trace-1',
    repetition_index: 0,
    output: { answer: '42' },
    model: { id: 'gpt-4', family: 'gpt', provider: 'openai' },
  },
  evaluator: {
    name: 'correctness',
    score: 0.95,
    label: 'pass',
    explanation: 'Good answer',
    metadata: { rationale: 'matched expected output' },
    trace_id: null,
    model: { id: 'gpt-4o-mini', family: 'gpt', provider: 'openai' },
  },
  metadata: {
    execution_id: 'execution-1',
    suite_id: 'suite-a',
    total_repetitions: 2,
    hostname: 'ci-host',
    git: { branch: 'main', commit_sha: 'abc123' },
  },
});

describe('EvalsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ingestScores posts to the ingest route and returns parsed counts', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({ ingested: 1, conflicted: 0, failed: [] }, 200)
    );
    const client = new EvalsClient(kbnClient, log);
    const requestBody = createIngestRequest();

    await expect(client.ingestScores(requestBody)).resolves.toEqual({
      ingested: 1,
      conflicted: 0,
      failed: [],
    });

    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: EVALS_SCORES_URL,
        method: 'POST',
        body: requestBody,
        ignoreErrors: [400, 429, 500],
      })
    );
  });

  it('ingestScores returns partial success payloads without throwing on 207', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(
      asKbnResponse(
        {
          ingested: 1,
          conflicted: 0,
          failed: [{ index: 0, status: 400, reason: 'mapping rejected' }],
        },
        207
      )
    );
    const client = new EvalsClient(kbnClient, log);

    await expect(client.ingestScores(createIngestRequest())).resolves.toEqual({
      ingested: 1,
      conflicted: 0,
      failed: [{ index: 0, status: 400, reason: 'mapping rejected' }],
    });
  });

  it.each([400, 429, 500] as const)(
    'ingestScores throws structured error details on %s responses',
    async (statusCode) => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      const failureBody = {
        ingested: 0,
        conflicted: 0,
        failed: [{ index: 0, status: statusCode, reason: 'failed' }],
      };
      kbnClient.request.mockResolvedValue(asKbnResponse(failureBody, statusCode));
      const client = new EvalsClient(kbnClient, log);

      await expect(client.ingestScores(createIngestRequest())).rejects.toMatchObject({
        statusCode,
        body: failureBody,
      } satisfies Partial<IngestScoresError>);
    }
  );

  it('getExperimentStats maps API response to ExperimentStats shape', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({
        experiment_id: 'experiment-123',
        timestamp: '2026-05-01T11:00:00.000Z',
        task_model: { id: 'gpt-4', family: 'gpt', provider: 'openai' },
        evaluator_model: { id: 'gpt-4o-mini', family: 'gpt', provider: 'openai' },
        total_repetitions: 3,
        stats: [
          {
            dataset_id: 'dataset-1',
            dataset_name: 'Dataset 1',
            evaluator_name: 'correctness',
            example_count: 5,
            stats: {
              mean: 0.9,
              median: 0.95,
              std_dev: 0.03,
              min: 0.8,
              max: 1,
              count: 5,
            },
          },
        ],
      })
    );
    const client = new EvalsClient(kbnClient, log);

    const result = await client.getExperimentStats('experiment-123', {
      suiteId: 'suite-a',
      taskModelId: 'gpt-4',
    });

    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: EVALS_EXPERIMENT_URL.replace('{experimentId}', 'experiment-123'),
        method: 'GET',
        query: { suite_id: 'suite-a', model_id: 'gpt-4' },
      })
    );
    expect(result).toEqual({
      taskModel: { id: 'gpt-4', family: 'gpt', provider: 'openai' },
      evaluatorModel: { id: 'gpt-4o-mini', family: 'gpt', provider: 'openai' },
      totalRepetitions: 3,
      stats: [
        {
          datasetId: 'dataset-1',
          datasetName: 'Dataset 1',
          evaluatorName: 'correctness',
          stats: {
            mean: 0.9,
            median: 0.95,
            stdDev: 0.03,
            min: 0.8,
            max: 1,
            count: 5,
          },
        },
      ],
    });
  });

  it('getExperimentStats reports no judge model for an experiment scored only by code evaluators', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({
        experiment_id: 'experiment-123',
        timestamp: '2026-05-01T11:00:00.000Z',
        task_model: { id: 'gpt-4', family: 'gpt', provider: 'openai' },
        total_repetitions: 1,
        stats: [
          {
            dataset_id: 'dataset-1',
            dataset_name: 'Dataset 1',
            evaluator_name: 'latency',
            example_count: 5,
            stats: { mean: 0.9, median: 0.95, std_dev: 0.03, min: 0.8, max: 1, count: 5 },
          },
        ],
      })
    );
    const client = new EvalsClient(kbnClient, log);

    const result = await client.getExperimentStats('experiment-123');

    expect(result?.evaluatorModel).toBeUndefined();
    expect(result?.taskModel).toEqual({ id: 'gpt-4', family: 'gpt', provider: 'openai' });
  });

  it('getExperimentScores returns parsed score documents', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    const scores = [createScoreDocument('example-1'), createScoreDocument('example-2')];
    kbnClient.request.mockResolvedValue(asKbnResponse({ scores, total: scores.length }));
    const client = new EvalsClient(kbnClient, log);

    await expect(client.getExperimentScores('experiment-123')).resolves.toEqual(scores);

    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: EVALS_EXPERIMENT_SCORES_URL.replace('{experimentId}', 'experiment-123'),
        method: 'GET',
      })
    );
  });

  it('getExperimentScores omits filters it was not given', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(asKbnResponse({ scores: [], total: 0 }));
    const client = new EvalsClient(kbnClient, log);

    await client.getExperimentScores('experiment-123');

    // Sending them as undefined reaches the route as `suite_id=`, which matches no score at all.
    expect(kbnClient.request).toHaveBeenCalledWith(expect.objectContaining({ query: {} }));
  });

  it('getExperimentScores passes the filters it was given', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(asKbnResponse({ scores: [], total: 0 }));
    const client = new EvalsClient(kbnClient, log);

    await client.getExperimentScores('experiment-123', { suiteId: 'my-suite' });

    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: { suite_id: 'my-suite' } })
    );
  });

  it('getExperimentScores returns [] and logs when response exceeds MAX_SCORES_PER_QUERY', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({
        scores: [createScoreDocument('example-1')],
        total: MAX_SCORES_PER_QUERY + 1,
      })
    );
    const client = new EvalsClient(kbnClient, log);

    await expect(client.getExperimentScores('experiment-123')).resolves.toEqual([]);

    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('exceeds MAX_SCORES_PER_QUERY'));
  });

  it('upsertDataset posts to the upsert route', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({ dataset_id: 'ds-1', added: 2, removed: 0, unchanged: 0 })
    );
    const client = new EvalsClient(kbnClient, log);

    const dataset: UpsertDatasetInput = {
      name: 'My Dataset',
      description: 'Test dataset',
      examples: [
        { input: { question: 'What?' }, output: { answer: '42' } },
        { input: { question: 'Why?' } },
      ],
    };

    await expect(client.upsertDataset(dataset)).resolves.toBe('ds-1');
    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: EVALS_DATASET_UPSERT_URL,
        method: 'POST',
        body: {
          name: 'My Dataset',
          description: 'Test dataset',
          examples: dataset.examples,
        },
        retries: 0,
      })
    );
  });

  it('upsertDataset sends tags and maturity only when the suite declares them', async () => {
    const kbnClient = createMockKbnClient();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({ dataset_id: 'ds-1', added: 0, removed: 0, unchanged: 0 })
    );
    const client = new EvalsClient(kbnClient, createLog());

    await client.upsertDataset({
      name: 'My Dataset',
      description: 'Test dataset',
      tags: ['esql', 'golden'],
      maturity: 'golden',
      examples: [],
    });

    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          name: 'My Dataset',
          description: 'Test dataset',
          tags: ['esql', 'golden'],
          maturity: 'golden',
          examples: [],
        },
      })
    );
  });

  it('upsertDataset sends the requested spaces only when a run targets some', async () => {
    const kbnClient = createMockKbnClient();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({ dataset_id: 'ds-1', added: 0, removed: 0, unchanged: 0 })
    );
    const client = new EvalsClient(kbnClient, createLog());

    await client.upsertDataset({
      name: 'My Dataset',
      description: 'Test dataset',
      spaceIds: ['marketing', 'sales'],
      examples: [],
    });

    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ space_ids: ['marketing', 'sales'] }),
      })
    );

    kbnClient.request.mockClear();
    await client.upsertDataset({
      name: 'My Dataset',
      description: 'Test dataset',
      spaceIds: [],
      examples: [],
    });

    expect(kbnClient.request.mock.calls[0][0].body).not.toHaveProperty('space_ids');
  });

  it('upsertDataset propagates errors', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockRejectedValue(new Error('Server error'));
    const client = new EvalsClient(kbnClient, log);

    await expect(
      client.upsertDataset({ name: 'ds', description: '', examples: [] })
    ).rejects.toThrow('Server error');
  });

  it('getDatasetByName returns parsed dataset', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(
      asKbnResponse({
        id: 'ds-uuid',
        name: 'My Dataset',
        description: 'Test dataset',
        examples: [
          {
            id: 'ex-1',
            input: { question: 'What?' },
            output: { answer: '42' },
            metadata: {},
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      })
    );
    const client = new EvalsClient(kbnClient, log);

    const result = await client.getDatasetByName('My Dataset');

    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining(EVALS_DATASET_URL.split('{')[0]),
        method: 'GET',
        retries: 0,
      })
    );
    expect(result).toEqual({
      id: 'ds-uuid',
      name: 'My Dataset',
      description: 'Test dataset',
      examples: [
        { id: 'ex-1', input: { question: 'What?' }, output: { answer: '42' }, metadata: {} },
      ],
    });
  });

  it('getDatasetByName returns null on 404', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    const client = new EvalsClient(kbnClient, log);

    await expect(client.getDatasetByName('Nonexistent')).resolves.toBeNull();
  });

  it('getDatasetByName asks the server to resolve a name it cannot address directly', async () => {
    const kbnClient = createMockKbnClient();
    const dataset = {
      id: 'space-scoped-id',
      name: 'My Dataset',
      description: 'Test dataset',
      examples: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    kbnClient.request
      // The default-space id guess misses, because the dataset lives elsewhere.
      .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      .mockResolvedValueOnce(asKbnResponse({ ...dataset, examples_count: 0 }))
      .mockResolvedValueOnce(asKbnResponse(dataset));
    const client = new EvalsClient(kbnClient, createLog());

    const result = await client.getDatasetByName('My Dataset');

    expect(kbnClient.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: EVALS_DATASET_RESOLVE_URL,
        query: { name: 'My Dataset' },
      })
    );
    expect(result?.id).toBe('space-scoped-id');
  });

  it('getDatasetByName propagates non-404 errors', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockRejectedValue(
      Object.assign(new Error('Internal Server Error'), { status: 500 })
    );
    const client = new EvalsClient(kbnClient, log);

    await expect(client.getDatasetByName('Some Dataset')).rejects.toThrow('Internal Server Error');
  });

  it('assertPluginEnabled throws an error when plugin is disabled', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    const client = new EvalsClient(kbnClient, log);

    await expect(client.assertPluginEnabled()).rejects.toThrow(
      'Evaluations plugin is not enabled on the target Kibana. Ensure xpack.evals.enabled=true is set in the Kibana configuration.'
    );
  });

  it('assertPluginEnabled resolves when plugin is enabled', async () => {
    const kbnClient = createMockKbnClient();
    const log = createLog();
    kbnClient.request.mockResolvedValue(asKbnResponse({ datasets: [], total: 0 }));
    const client = new EvalsClient(kbnClient, log);

    await expect(client.assertPluginEnabled()).resolves.toBeUndefined();
    expect(kbnClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/internal/evals/datasets',
        method: 'GET',
        query: { page: 1, per_page: 1 },
        retries: 0,
      })
    );
  });

  describe('findLatestBaselineExperiment', () => {
    const makeExperiment = (
      executionId: string,
      overrides: Record<string, unknown> = {}
    ): Record<string, unknown> => ({
      execution_id: executionId,
      experiment_id: `exp-${executionId}`,
      timestamp: '2026-07-01T10:00:00.000Z',
      git_branch: 'main',
      git_commit_sha: 'abc1234',
      ...overrides,
    });

    it('returns the first experiment not matching excludeExecutionId', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({
          experiments: [
            makeExperiment('bk-current::smoke-tests::haiku'),
            makeExperiment('bk-older::smoke-tests::haiku'),
          ],
          total: 2,
        })
      );
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestBaselineExperiment({
        suiteId: 'smoke-tests',
        branch: 'main',
        excludeExecutionId: 'bk-current::smoke-tests::haiku',
      });

      expect(result).toEqual({
        executionId: 'bk-older::smoke-tests::haiku',
        timestamp: '2026-07-01T10:00:00.000Z',
        gitCommitSha: 'abc1234',
        gitBranch: 'main',
      });
    });

    it('returns undefined when all experiments match excludeExecutionId', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({
          experiments: [makeExperiment('bk-current::smoke-tests::haiku')],
          total: 1,
        })
      );
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestBaselineExperiment({
        suiteId: 'smoke-tests',
        branch: 'main',
        excludeExecutionId: 'bk-current::smoke-tests::haiku',
      });

      expect(result).toBeUndefined();
    });

    it('returns undefined when the experiments list is empty', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(asKbnResponse({ experiments: [], total: 0 }));
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestBaselineExperiment({
        suiteId: 'smoke-tests',
        branch: 'main',
      });

      expect(result).toBeUndefined();
    });

    it('forwards suite_id, branch, and model_id query params', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({ experiments: [makeExperiment('bk-old::smoke-tests::haiku')], total: 1 })
      );
      const client = new EvalsClient(kbnClient, log);

      await client.findLatestBaselineExperiment({
        suiteId: 'smoke-tests',
        branch: 'main',
        taskModelId: 'haiku',
      });

      expect(kbnClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: EVALS_EXPERIMENTS_URL,
          method: 'GET',
          query: expect.objectContaining({
            suite_id: 'smoke-tests',
            branch: 'main',
            model_id: 'haiku',
          }),
        })
      );
    });

    it('omits model_id from query when taskModelId is not provided', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({ experiments: [makeExperiment('bk-old::smoke-tests::haiku')], total: 1 })
      );
      const client = new EvalsClient(kbnClient, log);

      await client.findLatestBaselineExperiment({ suiteId: 'smoke-tests', branch: 'main' });

      const call = kbnClient.request.mock.calls[0][0] as { query: Record<string, unknown> };
      expect(call.query).not.toHaveProperty('model_id');
    });

    it('returns undefined and logs error on request failure', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockRejectedValue(new Error('network error'));
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestBaselineExperiment({
        suiteId: 'smoke-tests',
        branch: 'main',
      });

      expect(result).toBeUndefined();
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('network error'));
    });
  });

  describe('findLatestExperimentForBuild', () => {
    const makeExperiment = (
      executionId: string,
      overrides: Record<string, unknown> = {}
    ): Record<string, unknown> => ({
      execution_id: executionId,
      experiment_id: `exp-${executionId}`,
      timestamp: '2026-07-01T10:00:00.000Z',
      git_branch: 'main',
      git_commit_sha: 'def5678',
      ...overrides,
    });

    it('returns the first experiment whose execution_id starts with baseExecutionId::', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({
          experiments: [makeExperiment('bk-build-123::smoke-tests::haiku')],
          total: 1,
        })
      );
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestExperimentForBuild({
        suiteId: 'smoke-tests',
        baseExecutionId: 'bk-build-123',
      });

      expect(result).toEqual({
        executionId: 'bk-build-123::smoke-tests::haiku',
        timestamp: '2026-07-01T10:00:00.000Z',
        gitCommitSha: 'def5678',
        gitBranch: 'main',
      });
    });

    it('returns undefined when no experiment matches the baseExecutionId prefix', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({
          experiments: [makeExperiment('bk-different-build::smoke-tests::haiku')],
          total: 1,
        })
      );
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestExperimentForBuild({
        suiteId: 'smoke-tests',
        baseExecutionId: 'bk-build-123',
      });

      expect(result).toBeUndefined();
    });

    it('does not match a prefix that is a substring without the :: separator', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      // 'bk-build' is a prefix of 'bk-build-123' but the separator is missing
      kbnClient.request.mockResolvedValue(
        asKbnResponse({
          experiments: [makeExperiment('bk-build-123::smoke-tests::haiku')],
          total: 1,
        })
      );
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestExperimentForBuild({
        suiteId: 'smoke-tests',
        baseExecutionId: 'bk-build',
      });

      expect(result).toBeUndefined();
    });

    it('forwards suite_id and build_id query params, stripping the bk- prefix', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({ experiments: [makeExperiment('bk-123::obs::haiku')], total: 1 })
      );
      const client = new EvalsClient(kbnClient, log);

      await client.findLatestExperimentForBuild({
        suiteId: 'obs',
        baseExecutionId: 'bk-123',
      });

      expect(kbnClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: EVALS_EXPERIMENTS_URL,
          method: 'GET',
          query: expect.objectContaining({ suite_id: 'obs', build_id: '123' }),
        })
      );
    });

    it('passes baseExecutionId as-is to build_id when it has no bk- prefix', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({ experiments: [makeExperiment('rawid::obs::haiku')], total: 1 })
      );
      const client = new EvalsClient(kbnClient, log);

      await client.findLatestExperimentForBuild({
        suiteId: 'obs',
        baseExecutionId: 'rawid',
      });

      const call = kbnClient.request.mock.calls[0][0] as { query: Record<string, unknown> };
      expect(call.query).toMatchObject({ build_id: 'rawid' });
    });

    it('returns undefined and logs error on request failure', async () => {
      const kbnClient = createMockKbnClient();
      const log = createLog();
      kbnClient.request.mockRejectedValue(new Error('timeout'));
      const client = new EvalsClient(kbnClient, log);

      const result = await client.findLatestExperimentForBuild({
        suiteId: 'smoke-tests',
        baseExecutionId: 'bk-build-123',
      });

      expect(result).toBeUndefined();
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('timeout'));
    });
  });

  describe('deleteDataset', () => {
    it('deletes by id and reports that the dataset is gone', async () => {
      const kbnClient = createMockKbnClient();
      kbnClient.request.mockResolvedValue(asKbnResponse({ success: true, unshared: false }));
      const client = new EvalsClient(kbnClient, createLog());

      await expect(client.deleteDataset('ds-1')).resolves.toEqual({ unshared: false });
      expect(kbnClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: EVALS_DATASET_URL.replace('{datasetId}', 'ds-1'),
          method: 'DELETE',
        })
      );
    });

    it('reports a dataset that other spaces still use', async () => {
      // The server unshares instead of deleting, so a caller that reads this as
      // a delete would report data gone that other spaces can still see.
      const kbnClient = createMockKbnClient();
      kbnClient.request.mockResolvedValue(asKbnResponse({ success: true, unshared: true }));
      const client = new EvalsClient(kbnClient, createLog());

      await expect(client.deleteDataset('ds-1')).resolves.toEqual({ unshared: true });
    });

    it('escapes the id rather than letting it shape the path', async () => {
      const kbnClient = createMockKbnClient();
      kbnClient.request.mockResolvedValue(asKbnResponse({ success: true }));
      const client = new EvalsClient(kbnClient, createLog());

      await client.deleteDataset('../datasets');

      expect(kbnClient.request.mock.calls[0][0].path).toBe(
        EVALS_DATASET_URL.replace('{datasetId}', '..%2Fdatasets')
      );
    });
  });

  describe('space scoping', () => {
    const requestFor = async (spaceIds: string[] | undefined) => {
      const kbnClient = createMockKbnClient();
      kbnClient.request.mockResolvedValue(
        asKbnResponse({ dataset_id: 'ds-1', added: 0, removed: 0, unchanged: 0 })
      );
      const client = new EvalsClient(kbnClient, createLog(), { spaceIds });

      await client.upsertDataset({ name: 'ds', description: '', spaceIds, examples: [] });

      return kbnClient.request.mock.calls[0][0] as { path: string };
    };

    it('sends the run to the space its datasets are written to', async () => {
      // The id the server derives comes from the space the request lands in, so
      // a run targeting another space has to be made from there.
      await expect(requestFor(['marketing'])).resolves.toEqual(
        expect.objectContaining({ path: `/s/marketing${EVALS_DATASET_UPSERT_URL}` })
      );
      await expect(requestFor(['marketing', 'sales'])).resolves.toEqual(
        expect.objectContaining({ path: `/s/marketing${EVALS_DATASET_UPSERT_URL}` })
      );
    });

    it.each([
      ['no spaces are requested', undefined],
      ['the default space is the first listed', ['default', 'marketing']],
    ])('stays in the default space when %s', async (_, spaceIds) => {
      await expect(requestFor(spaceIds)).resolves.toEqual(
        expect.objectContaining({ path: EVALS_DATASET_UPSERT_URL })
      );
    });

    it('works from the first space listed, whichever it is', async () => {
      // A run widening an existing dataset to the default space has to be made
      // from the space already holding it, or it looks for a dataset by name
      // where there isn't one and collides with itself creating a second.
      await expect(requestFor(['marketing', 'default'])).resolves.toEqual(
        expect.objectContaining({ path: `/s/marketing${EVALS_DATASET_UPSERT_URL}` })
      );
    });

    it('leaves no request behind in the space the run was started from', async () => {
      const kbnClient = createMockKbnClient();
      // The responses don't matter: every call is only asked where it went.
      kbnClient.request.mockResolvedValue(asKbnResponse({}));
      const client = new EvalsClient(kbnClient, createLog(), { spaceIds: ['marketing'] });

      await Promise.allSettled([
        client.assertPluginEnabled(),
        client.ingestScores(createIngestRequest()),
        client.upsertDataset({ name: 'ds', description: '', examples: [] }),
        client.getDatasetByName('ds'),
        client.deleteDataset('ds-1'),
        client.getExperimentStats('experiment-1'),
        client.getExperimentScores('experiment-1'),
        client.findLatestBaselineExperiment({ suiteId: 'suite-a', branch: 'main' }),
        client.findLatestExperimentForBuild({ suiteId: 'suite-a', baseExecutionId: 'bk-1' }),
      ]);

      const paths = kbnClient.request.mock.calls.map(([{ path }]) => path as string);

      expect(paths.length).toBeGreaterThan(8);
      expect(paths.filter((path) => !path.startsWith('/s/marketing/'))).toEqual([]);
    });
  });

  describe('assertSpacesExist', () => {
    const clientFor = (spaceIds: string[], spaces: unknown) => {
      const kbnClient = createMockKbnClient();
      kbnClient.request.mockResolvedValue(asKbnResponse(spaces));

      return new EvalsClient(kbnClient, createLog(), { spaceIds });
    };

    it('refuses a run aimed at a space that does not exist', async () => {
      // Kibana serves the api under /s/<anything>, so a typo would otherwise
      // spend the run writing where nobody can read.
      const client = clientFor(['markting'], [{ id: 'default' }, { id: 'marketing' }]);

      await expect(client.assertSpacesExist()).rejects.toThrow(
        'Unknown space id(s): markting. --space-ids must name spaces that exist on the target Kibana.'
      );
    });

    it('names every space it could not find', async () => {
      const client = clientFor(['marketing', 'sails', 'legl'], [{ id: 'marketing' }]);

      await expect(client.assertSpacesExist()).rejects.toThrow('Unknown space id(s): sails, legl.');
    });

    it('lets a run through to the spaces it named', async () => {
      const client = clientFor(['marketing', 'sales'], [{ id: 'marketing' }, { id: 'sales' }]);

      await expect(client.assertSpacesExist()).resolves.toBeUndefined();
    });

    it('asks about the spaces outside any of them', async () => {
      // Asking through /s/<typo> would answer for the space it is checking.
      const kbnClient = createMockKbnClient();
      kbnClient.request.mockResolvedValue(asKbnResponse([{ id: 'marketing' }]));
      const client = new EvalsClient(kbnClient, createLog(), { spaceIds: ['marketing'] });

      await client.assertSpacesExist();

      expect(kbnClient.request).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/api/spaces/space' })
      );
    });

    it('says nothing when no spaces were asked for', async () => {
      const kbnClient = createMockKbnClient();
      const client = new EvalsClient(kbnClient, createLog());

      await expect(client.assertSpacesExist()).resolves.toBeUndefined();
      expect(kbnClient.request).not.toHaveBeenCalled();
    });

    it('warns and continues when the spaces cannot be read', async () => {
      // Credentials that cannot list spaces can't tell a missing one from a
      // hidden one, and failing those runs would cost more than it saves.
      const kbnClient = createMockKbnClient();
      kbnClient.request.mockRejectedValue(
        Object.assign(new Error('Forbidden'), { response: { status: 403 } })
      );
      const log = createLog();
      const client = new EvalsClient(kbnClient, log, { spaceIds: ['marketing'] });

      await expect(client.assertSpacesExist()).resolves.toBeUndefined();
      expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('--space-ids'));
    });
  });
});
