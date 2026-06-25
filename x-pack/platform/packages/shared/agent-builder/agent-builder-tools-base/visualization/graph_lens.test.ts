/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { generateEsql } from '@kbn/agent-builder-genai-utils';
import type { ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { createVisualizationGraph } from './graph_lens';
import type { VisualizationConfig } from './types';

jest.mock('@kbn/agent-builder-genai-utils', () => ({
  generateEsql: jest.fn(),
}));

jest.mock('./chart_type_registry', () => ({
  chartTypeRegistry: new Proxy(
    {},
    {
      get: () => ({
        schema: {
          validate: (config: unknown) => config,
        },
        prompt: {
          selection: {
            description: 'Mock chart description',
            guideline: 'Mock chart guideline',
          },
        },
      }),
    }
  ),
}));

const mockedGenerateEsql = jest.mocked(generateEsql);

const createMockLogger = (): Logger =>
  ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger);

describe('createVisualizationGraph', () => {
  const logger = createMockLogger();
  const events = {} as ToolEventEmitter;
  const esClient = { asCurrentUser: {} } as IScopedClusterClient;

  // Returns a ModelProvider-shaped mock. `createVisualizationGraph` resolves the default model
  // via `getDefaultModel()` for the config / time-range nodes.
  const createMockModel = (invokeResult: string = '```json\n{"type":"metric"}\n```') => {
    const scopedModel = {
      chatModel: {
        // invoke resolves to a message-like object; graph_lens reads `.content` via
        // extractTextFromMessage.
        invoke: jest.fn().mockResolvedValue({ content: invokeResult }),
        withStructuredOutput: jest.fn(),
      },
    };
    return {
      getDefaultModel: jest.fn().mockResolvedValue(scopedModel),
    } as const;
  };

  beforeEach(() => {
    mockedGenerateEsql.mockReset();
  });

  it('uses the provided esql query without generating a new one', async () => {
    const graph = await createVisualizationGraph(
      createMockModel() as never,
      logger,
      events,
      esClient,
      false
    );
    const esqlQuery = 'FROM logs-* | WHERE response.code != 503 | STATS count = COUNT(*)';

    const finalState = await graph.invoke({
      nlQuery: 'Exclude 503 response codes',
      index: 'logs-*',
      chartType: SupportedChartType.Metric,
      schema: {},
      existingConfig: undefined,
      parsedExistingConfig: null,
      esqlQuery,
      currentAttempt: 0,
      actions: [],
      validatedConfig: null,
      error: null,
    });

    expect(mockedGenerateEsql).not.toHaveBeenCalled();
    expect(finalState.esqlQuery).toBe(esqlQuery);
  });

  it('regenerates esql for edits and includes the existing query as context', async () => {
    mockedGenerateEsql.mockResolvedValue({
      query: 'FROM logs-* | WHERE response.code != 503 | STATS count = COUNT(*)',
    } as Awaited<ReturnType<typeof generateEsql>>);

    const graph = await createVisualizationGraph(
      createMockModel() as never,
      logger,
      events,
      esClient,
      false
    );
    const parsedExistingConfig = {
      type: 'metric',
      data_source: {
        type: 'esql',
        query: 'FROM logs-* | STATS count = COUNT(*)',
      },
    } as unknown as VisualizationConfig;

    const finalState = await graph.invoke({
      nlQuery: 'Exclude 503 response codes',
      index: 'logs-*',
      chartType: SupportedChartType.Metric,
      schema: {},
      existingConfig: JSON.stringify(parsedExistingConfig),
      parsedExistingConfig,
      esqlQuery: '',
      currentAttempt: 0,
      actions: [],
      validatedConfig: null,
      error: null,
    });

    expect(mockedGenerateEsql).toHaveBeenCalledWith(
      expect.objectContaining({
        nlQuery: expect.stringContaining(
          'Existing esql query to modify: "FROM logs-* | STATS count = COUNT(*)"'
        ),
      })
    );
    expect(finalState.esqlQuery).toBe(
      'FROM logs-* | WHERE response.code != 503 | STATS count = COUNT(*)'
    );
  });

  it('injects the validated esql query, overwriting any query emitted by the config LLM', async () => {
    const canonicalQuery = 'TS metrics-* | STATS avg = AVG(cpu) BY host';
    // The config LLM corrupts the query (TS -> FROM) in the data_source it emits.
    const corruptedConfig =
      '```json\n' +
      JSON.stringify({
        type: 'metric',
        data_source: { type: 'esql', query: 'FROM metrics-* | STATS avg = AVG(cpu) BY host' },
      }) +
      '\n```';

    const graph = await createVisualizationGraph(
      createMockModel(corruptedConfig) as never,
      logger,
      events,
      esClient,
      false
    );

    const finalState = await graph.invoke({
      nlQuery: 'Average cpu by host',
      index: 'metrics-*',
      chartType: SupportedChartType.Metric,
      schema: {},
      existingConfig: undefined,
      parsedExistingConfig: null,
      esqlQuery: canonicalQuery,
      currentAttempt: 0,
      actions: [],
      validatedConfig: null,
      error: null,
    });

    const validated = finalState.validatedConfig as {
      data_source?: { type: string; query: string };
    };
    expect(validated.data_source).toEqual({ type: 'esql', query: canonicalQuery });
  });

  it('injects data_source when the config LLM omits it (single-dataset config)', async () => {
    const canonicalQuery = 'FROM logs-* | STATS count = COUNT(*)';
    const configWithoutDataSource = '```json\n' + JSON.stringify({ type: 'metric' }) + '\n```';

    const graph = await createVisualizationGraph(
      createMockModel(configWithoutDataSource) as never,
      logger,
      events,
      esClient,
      false
    );

    const finalState = await graph.invoke({
      nlQuery: 'Count logs',
      index: 'logs-*',
      chartType: SupportedChartType.Metric,
      schema: {},
      existingConfig: undefined,
      parsedExistingConfig: null,
      esqlQuery: canonicalQuery,
      currentAttempt: 0,
      actions: [],
      validatedConfig: null,
      error: null,
    });

    const validated = finalState.validatedConfig as {
      data_source?: { type: string; query: string };
    };
    expect(validated.data_source).toEqual({ type: 'esql', query: canonicalQuery });
  });

  it('injects data_source into every layer when the config LLM omits it (XY multi-layer)', async () => {
    const canonicalQuery =
      'FROM logs-* | STATS count = COUNT(*) BY bucket = BUCKET(@timestamp, 75, ?_tstart, ?_tend)';
    const xyConfigWithoutDataSource =
      '```json\n' +
      JSON.stringify({
        type: 'xy',
        layers: [{ type: 'series' }, { type: 'series' }],
      }) +
      '\n```';

    const graph = await createVisualizationGraph(
      createMockModel(xyConfigWithoutDataSource) as never,
      logger,
      events,
      esClient,
      false
    );

    const finalState = await graph.invoke({
      nlQuery: 'Count logs over time',
      index: 'logs-*',
      chartType: SupportedChartType.XY,
      schema: {},
      existingConfig: undefined,
      parsedExistingConfig: null,
      esqlQuery: canonicalQuery,
      currentAttempt: 0,
      actions: [],
      validatedConfig: null,
      error: null,
    });

    const validated = finalState.validatedConfig as {
      layers?: Array<{ data_source?: { type: string; query: string } }>;
    };
    expect(validated.layers).toHaveLength(2);
    for (const layer of validated.layers ?? []) {
      expect(layer.data_source).toEqual({ type: 'esql', query: canonicalQuery });
    }
  });
});
