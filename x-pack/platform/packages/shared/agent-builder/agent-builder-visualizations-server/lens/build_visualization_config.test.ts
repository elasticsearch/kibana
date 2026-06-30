/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { validateEsqlQuery } from '@kbn/agent-builder-genai-utils';
import { buildServerESQLCallbacks } from '@kbn/esql-server-utils';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { createVisualizationGraph } from './graph_lens';
import { buildVisualizationConfig } from './build_visualization_config';

jest.mock('@kbn/agent-builder-genai-utils', () => ({
  validateEsqlQuery: jest.fn(),
}));

jest.mock('@kbn/esql-server-utils', () => ({
  buildServerESQLCallbacks: jest.fn(() => ({})),
}));

jest.mock('./graph_lens', () => ({
  createVisualizationGraph: jest.fn(),
}));

jest.mock('./schemas', () => ({
  getSchemaForChartType: jest.fn(() => ({})),
}));

jest.mock('./guess_chart_type', () => ({
  guessChartType: jest.fn(),
}));

const mockedValidateEsqlQuery = jest.mocked(validateEsqlQuery);
const mockedBuildCallbacks = jest.mocked(buildServerESQLCallbacks);
const mockedCreateGraph = jest.mocked(createVisualizationGraph);

const createMockLogger = (): Logger =>
  ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger);

describe('buildVisualizationConfig', () => {
  const events = {} as ToolEventEmitter;
  const esClient = { asCurrentUser: {} } as IScopedClusterClient;
  const modelProvider = {
    getDefaultModel: jest.fn().mockResolvedValue({}),
  } as unknown as ModelProvider;

  const PROVIDED_ESQL = 'FROM logs-* | STATS count = COUNT(*)';

  let logger: Logger;
  let invoke: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedValidateEsqlQuery.mockReset();
    mockedValidateEsqlQuery.mockResolvedValue(undefined); // default: query is valid
    logger = createMockLogger();
    invoke = jest.fn().mockResolvedValue({
      validatedConfig: { type: 'metric' },
      error: null,
      currentAttempt: 1,
      esqlQuery: PROVIDED_ESQL,
      timeRange: null,
    });
    mockedCreateGraph.mockReturnValue({ invoke } as unknown as ReturnType<
      typeof createVisualizationGraph
    >);
  });

  const run = (esql?: string) =>
    buildVisualizationConfig({
      nlQuery: 'count of logs',
      chartType: SupportedChartType.Metric, // pass a chartType so guessChartType is skipped
      esql,
      modelProvider,
      logger,
      events,
      esClient,
    });

  it('passes a valid provided ES|QL through to the graph verbatim', async () => {
    await run(PROVIDED_ESQL);

    expect(mockedBuildCallbacks).toHaveBeenCalledWith({ client: esClient.asCurrentUser });
    expect(mockedValidateEsqlQuery).toHaveBeenCalledWith(PROVIDED_ESQL, {});
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: PROVIDED_ESQL });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('drops an invalid provided ES|QL and warns, so the graph regenerates', async () => {
    mockedValidateEsqlQuery.mockResolvedValue('line 1, column 1: bad query');

    await run(PROVIDED_ESQL);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: '' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bad query'));
  });

  it('keeps the provided ES|QL when validation itself fails (inconclusive)', async () => {
    mockedValidateEsqlQuery.mockRejectedValue(new Error('ES unreachable'));

    await run(PROVIDED_ESQL);

    expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: PROVIDED_ESQL });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not validate when no ES|QL is provided', async () => {
    await run(undefined);

    expect(mockedValidateEsqlQuery).not.toHaveBeenCalled();
    expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: '' });
  });
});
