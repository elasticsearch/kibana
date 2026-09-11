/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { generateEsql, executeEsql, validateEsqlQuery } from '@kbn/agent-builder-genai-utils';
import { VEGA_LITE_SCHEMA } from './normalize_spec';
import { buildVegaConfig } from './build_config';

// Stub only the LLM/ES boundaries; the real build_config + real graph run.
jest.mock('@kbn/agent-builder-genai-utils', () => ({
  generateEsql: jest.fn(),
  executeEsql: jest.fn(),
  validateEsqlQuery: jest.fn(),
}));

jest.mock('@kbn/agent-builder-genai-utils/tools/utils/esql', () => ({
  buildTimeRangeParams: jest.fn(() => undefined),
}));

jest.mock('@kbn/esql-server-utils', () => ({
  buildServerESQLCallbacks: jest.fn(() => ({})),
}));

jest.mock('../utils/extract_text_from_message', () => ({
  extractTextFromMessage: (message: unknown) => String(message),
}));

const mockedGenerateEsql = jest.mocked(generateEsql);
const mockedExecuteEsql = jest.mocked(executeEsql);
const mockedValidateEsqlQuery = jest.mocked(validateEsqlQuery);

// The real LangGraph compile+invoke can exceed the default 5s budget on first run under CI's parallel worker load.
jest.setTimeout(30_000);

const RECOVERED_ESQL = 'FROM kibana_sample_data_logs | STATS count = COUNT() BY response.keyword';

const existingSpec = JSON.stringify({
  $schema: VEGA_LITE_SCHEMA,
  mark: 'bar',
  data: { url: { '%type%': 'esql', query: RECOVERED_ESQL } },
  encoding: { x: { field: 'response.keyword', type: 'nominal' }, y: { field: 'count' } },
});

const createMockLogger = (): Logger =>
  ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as Logger);

describe('recover_esql end-to-end (real build_config + real graph)', () => {
  const events = {} as ToolEventEmitter;
  const esClient = { asCurrentUser: {} } as IScopedClusterClient;

  let logger: Logger;
  let invoke: jest.Mock;
  let modelProvider: ModelProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createMockLogger();
    // The author step returns a re-styled spec; normalization re-binds the ES|QL data source.
    invoke = jest.fn().mockResolvedValue(
      '```json\n' +
        JSON.stringify({
          authoring_note: 'Restyled the existing bar chart while preserving its data.',
          spec: {
            mark: { type: 'bar', color: 'steelblue' },
            encoding: { x: { field: 'response.keyword' } },
          },
        }) +
        '\n```'
    );
    // The default and low-effort models share a connector so the default-model
    // fallback in `generateVisualizationEsql` stays out of this test.
    const scopedModel = {
      connector: { connectorId: 'default-connector' },
      chatModel: { invoke },
    };
    modelProvider = {
      getDefaultModel: jest.fn().mockResolvedValue(scopedModel),
      selectModel: jest.fn().mockResolvedValue(scopedModel),
    } as unknown as ModelProvider;
    mockedValidateEsqlQuery.mockResolvedValue(undefined);
    // A visual-only edit: the generator keeps the seeded query unchanged and
    // returns its result columns so the graph never re-executes it.
    mockedGenerateEsql.mockResolvedValue({
      query: RECOVERED_ESQL,
      results: { columns: [{ name: 'response.keyword', type: 'keyword' }] },
    } as unknown as Awaited<ReturnType<typeof generateEsql>>);
    mockedExecuteEsql.mockResolvedValue({
      columns: [{ name: 'response.keyword', type: 'keyword' }],
      values: [],
    } as unknown as Awaited<ReturnType<typeof executeEsql>>);
  });

  it('seeds regeneration with the ES|QL embedded in the edited spec', async () => {
    const result = await buildVegaConfig({
      nlQuery: 'make the bars steelblue',
      existingSpec,
      modelProvider,
      logger,
      events,
      esClient,
    });

    // Recovery kicked in: the query embedded in the spec was recovered and fed
    // to the generator as edit context rather than reused verbatim, so a
    // data-changing edit can still modify it.
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Recovered ES|QL from the existing Vega spec')
    );
    expect(mockedGenerateEsql).toHaveBeenCalledWith(
      expect.objectContaining({
        nlQuery: expect.stringContaining(RECOVERED_ESQL),
      })
    );

    // The generator kept the query for this visual-only edit, so it is carried
    // into the output and bound back into the normalized spec's data source.
    expect(result.esqlQuery).toBe(RECOVERED_ESQL);
    expect(JSON.parse(result.spec).data).toEqual({
      url: { '%type%': 'esql', '%context%': true, query: RECOVERED_ESQL },
    });
  });
});
