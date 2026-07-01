/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { DefaultEvaluators, EvalsExecutorClient, Evaluator } from '@kbn/evals';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import type { EsqlRegressionAgentBuilderChatClient } from './chat_client';
import { createEvaluateEsqlGenerationDataset } from './evaluate_dataset';

function buildEvaluator(name: string): Evaluator {
  return {
    name,
    kind: 'CODE',
    evaluate: jest.fn().mockResolvedValue({ score: 0 }),
  };
}

function buildChatClient() {
  return {
    converse: jest.fn().mockResolvedValue({
      messages: [{ message: 'Here is the query.' }],
      steps: [],
      errors: [],
      traceId: 'trace-id-fixture',
    }),
  } as unknown as EsqlRegressionAgentBuilderChatClient;
}

function buildDeps() {
  const runExperiment = jest.fn().mockResolvedValue(undefined);
  const executorClient = { runExperiment } as unknown as EvalsExecutorClient;
  const chatClient = buildChatClient();
  const inferenceClient = {} as unknown as BoundInferenceClient;
  const esClient = {} as unknown as EsClient;
  const traceEsClient = {} as unknown as EsClient;
  const log = {} as unknown as ToolingLog;
  const evaluators = {
    traceBasedEvaluators: {
      inputTokens: buildEvaluator('Input tokens'),
      outputTokens: buildEvaluator('Output tokens'),
      cachedTokens: buildEvaluator('Cached tokens'),
      toolCalls: buildEvaluator('Tool calls'),
      latency: buildEvaluator('Latency'),
    },
  } as unknown as DefaultEvaluators;
  return {
    runExperiment,
    chatClient,
    evaluators,
    executorClient,
    inferenceClient,
    esClient,
    traceEsClient,
    log,
  };
}

describe('createEvaluateEsqlGenerationDataset', () => {
  const ORIGINAL_OFFSET = process.env.ESQL_GENERATION_DATASET_OFFSET;
  const ORIGINAL_LIMIT = process.env.ESQL_GENERATION_DATASET_LIMIT;

  afterEach(() => {
    process.env.ESQL_GENERATION_DATASET_OFFSET = ORIGINAL_OFFSET;
    process.env.ESQL_GENERATION_DATASET_LIMIT = ORIGINAL_LIMIT;
    if (ORIGINAL_OFFSET === undefined) delete process.env.ESQL_GENERATION_DATASET_OFFSET;
    if (ORIGINAL_LIMIT === undefined) delete process.env.ESQL_GENERATION_DATASET_LIMIT;
  });

  it('registers the quality and trace-based evaluator stack in the expected order', async () => {
    const deps = buildDeps();

    const evaluateDataset = createEvaluateEsqlGenerationDataset(deps);
    await evaluateDataset();

    expect(deps.runExperiment).toHaveBeenCalledTimes(1);
    const [, evaluatorArray] = deps.runExperiment.mock.calls[0];
    expect(evaluatorArray).toHaveLength(10);

    expect(evaluatorArray[0].name).toBe('ES|QL Functional Equivalence');
    expect(evaluatorArray[0].kind).toBe('LLM');

    expect(evaluatorArray[1].name).toBe('ES|QL Validity');
    expect(evaluatorArray[1].kind).toBe('CODE');

    expect(evaluatorArray[2].name).toBe('ES|QL Execution Validity');
    expect(evaluatorArray[2].kind).toBe('CODE');

    expect(evaluatorArray[3].name).toBe('ES|QL Result Equivalence');
    expect(evaluatorArray[3].kind).toBe('CODE');

    // Trajectory — scores the agent's tool-call path (LLM-free).
    expect(evaluatorArray[4].name).toBe('Trajectory');

    // Observability tier — trace-based evaluators sourced from the framework.
    expect(evaluatorArray[5].name).toBe('Tool calls');
    expect(evaluatorArray[6].name).toBe('Latency');
    expect(evaluatorArray[7].name).toBe('Input tokens');
    expect(evaluatorArray[8].name).toBe('Output tokens');
    expect(evaluatorArray[9].name).toBe('Cached tokens');
  });

  it('drives the agent builder converse client for each example', async () => {
    process.env.ESQL_GENERATION_DATASET_LIMIT = '1';
    const deps = buildDeps();

    await createEvaluateEsqlGenerationDataset(deps)();

    const [
      {
        task,
        datasets: [dataset],
      },
    ] = deps.runExperiment.mock.calls[0];
    expect(dataset.examples).toHaveLength(1);

    const result = await task({ input: { question: 'show me top 10 hosts' } });

    expect(deps.chatClient.converse).toHaveBeenCalledTimes(1);
    expect(deps.chatClient.converse).toHaveBeenCalledWith({ message: 'show me top 10 hosts' });
    // No tool call result and no fenced block → extractor returns empty.
    expect(result.esql).toBe('');
    expect(result.traceId).toBe('trace-id-fixture');
    expect(result.messages).toEqual([{ message: 'Here is the query.' }]);
  });

  it('extracts ES|QL from a generate_esql tool result returned by the agent', async () => {
    const deps = buildDeps();
    (deps.chatClient.converse as jest.Mock).mockResolvedValue({
      messages: [{ message: 'Done.' }],
      steps: [
        {
          type: 'tool_call',
          tool_id: 'platform.core.generate_esql',
          results: [{ type: 'query', data: { esql: 'FROM logs-*\n| LIMIT 10' } }],
        },
      ],
      errors: [],
      traceId: 'trace-id-fixture',
    });

    process.env.ESQL_GENERATION_DATASET_LIMIT = '1';
    await createEvaluateEsqlGenerationDataset(deps)();
    const [{ task }] = deps.runExperiment.mock.calls[0];

    const result = await task({ input: { question: 'top 10 hosts' } });
    expect(result.esql).toBe('FROM logs-*\n| LIMIT 10');
  });

  it('passes the full dataset to runExperiment when no env vars are set', async () => {
    delete process.env.ESQL_GENERATION_DATASET_OFFSET;
    delete process.env.ESQL_GENERATION_DATASET_LIMIT;
    const deps = buildDeps();

    await createEvaluateEsqlGenerationDataset(deps)();

    const [
      {
        datasets: [dataset],
      },
    ] = deps.runExperiment.mock.calls[0];
    expect(dataset.examples).toHaveLength(31);
    expect(dataset.description).toContain('31 examples');
  });

  it('honors ESQL_GENERATION_DATASET_LIMIT to cap dataset size', async () => {
    process.env.ESQL_GENERATION_DATASET_LIMIT = '1';
    delete process.env.ESQL_GENERATION_DATASET_OFFSET;
    const deps = buildDeps();

    await createEvaluateEsqlGenerationDataset(deps)();

    const [
      {
        datasets: [dataset],
      },
    ] = deps.runExperiment.mock.calls[0];
    expect(dataset.examples).toHaveLength(1);
    expect(dataset.description).toContain('1 examples');
  });

  it('honors ESQL_GENERATION_DATASET_OFFSET combined with LIMIT', async () => {
    process.env.ESQL_GENERATION_DATASET_OFFSET = '5';
    process.env.ESQL_GENERATION_DATASET_LIMIT = '2';
    const deps = buildDeps();

    await createEvaluateEsqlGenerationDataset(deps)();

    const [
      {
        datasets: [dataset],
      },
    ] = deps.runExperiment.mock.calls[0];
    expect(dataset.examples).toHaveLength(2);
  });

  it('ignores non-numeric env values and falls back to the full dataset', async () => {
    process.env.ESQL_GENERATION_DATASET_LIMIT = 'not-a-number';
    process.env.ESQL_GENERATION_DATASET_OFFSET = '-3';
    const deps = buildDeps();

    await createEvaluateEsqlGenerationDataset(deps)();

    const [
      {
        datasets: [dataset],
      },
    ] = deps.runExperiment.mock.calls[0];
    expect(dataset.examples).toHaveLength(31);
  });
});
