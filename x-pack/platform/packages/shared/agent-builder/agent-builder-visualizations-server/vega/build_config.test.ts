/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { validateEsqlQuery } from '@kbn/agent-builder-genai-utils';
import { buildServerESQLCallbacks } from '@kbn/esql-server-utils';
import { createVegaGraph } from './graph';
import { buildVegaConfig } from './build_config';

jest.mock('@kbn/agent-builder-genai-utils', () => ({
  validateEsqlQuery: jest.fn(),
}));

jest.mock('@kbn/esql-server-utils', () => ({
  buildServerESQLCallbacks: jest.fn(() => ({})),
}));

jest.mock('./graph', () => ({
  createVegaGraph: jest.fn(),
}));

const mockedValidateEsqlQuery = jest.mocked(validateEsqlQuery);
const mockedBuildCallbacks = jest.mocked(buildServerESQLCallbacks);
const mockedCreateGraph = jest.mocked(createVegaGraph);

const createMockLogger = (): Logger =>
  ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as Logger);

const PROVIDED_ESQL = 'FROM logs-* | STATS count = COUNT(*)';
const SPEC = '{"$schema":"vega-lite","mark":"bar"}';

describe('buildVegaConfig', () => {
  const events = {} as ToolEventEmitter;
  const esClient = { asCurrentUser: {} } as IScopedClusterClient;
  const modelProvider = {} as ModelProvider;

  let logger: Logger;
  let invoke: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedValidateEsqlQuery.mockReset();
    mockedValidateEsqlQuery.mockResolvedValue(undefined); // default: query is valid
    logger = createMockLogger();
    invoke = jest.fn().mockResolvedValue({ spec: SPEC, error: null, esqlQuery: PROVIDED_ESQL });
    mockedCreateGraph.mockResolvedValue({ invoke } as unknown as Awaited<
      ReturnType<typeof createVegaGraph>
    >);
  });

  const run = (esql?: string) =>
    buildVegaConfig({
      nlQuery: 'small multiples by region',
      esql,
      modelProvider,
      logger,
      events,
      esClient,
    });

  it('passes a valid provided ES|QL through to the graph verbatim', async () => {
    const result = await run(PROVIDED_ESQL);

    expect(mockedBuildCallbacks).toHaveBeenCalledWith({ client: esClient.asCurrentUser });
    expect(mockedValidateEsqlQuery).toHaveBeenCalledWith(PROVIDED_ESQL, {});
    expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: PROVIDED_ESQL });
    expect(result).toEqual({ spec: SPEC, esqlQuery: PROVIDED_ESQL });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('drops an invalid provided ES|QL and warns, so the graph regenerates', async () => {
    mockedValidateEsqlQuery.mockResolvedValue('line 1, column 1: bad query');

    await run(PROVIDED_ESQL);

    expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: '' });
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

  it('throws with the graph error when no spec is produced', async () => {
    invoke.mockResolvedValue({ spec: null, error: 'authoring failed', esqlQuery: PROVIDED_ESQL });

    await expect(run(PROVIDED_ESQL)).rejects.toThrow('authoring failed');
  });

  describe('editing an existing spec', () => {
    const existingSpec = JSON.stringify({
      mark: 'bar',
      data: { url: { '%type%': 'esql', query: PROVIDED_ESQL } },
    });

    const edit = (esql?: string) =>
      buildVegaConfig({
        nlQuery: 'make the bars blue',
        esql,
        existingSpec,
        modelProvider,
        logger,
        events,
        esClient,
      });

    it('regenerates ES|QL when no query is provided, passing the existing spec through', async () => {
      await edit(undefined);

      expect(mockedValidateEsqlQuery).not.toHaveBeenCalled();
      expect(invoke.mock.calls[0][0]).toMatchObject({
        esqlQuery: '',
        existingSpec,
      });
    });

    it('passes a valid provided ES|QL through when editing', async () => {
      const newEsql = 'FROM metrics-* | STATS avg = AVG(value)';

      await edit(newEsql);

      expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: newEsql });
    });

    it('drops an invalid provided ES|QL and regenerates when editing', async () => {
      mockedValidateEsqlQuery.mockResolvedValue('line 1, column 1: bad query');

      await edit('INVALID QUERY');

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bad query'));
      expect(invoke.mock.calls[0][0]).toMatchObject({ esqlQuery: '' });
    });
  });
});
