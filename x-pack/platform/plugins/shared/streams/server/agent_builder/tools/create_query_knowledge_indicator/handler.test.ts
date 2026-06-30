/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { createQueryKnowledgeIndicatorToolHandler } from './handler';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'generated-query-id'),
}));

jest.mock('../../../lib/significant_events/validate_esql_query', () => ({
  validateEsqlQueryForStreamOrThrow: jest.fn(),
}));

describe('createQueryKnowledgeIndicatorToolHandler', () => {
  const logger = loggingSystemMock.createLogger();
  const definition = {
    name: 'logs.test',
    ingest: {
      classic: { field_overrides: {} },
      processing: [],
      lifecycle: { inherit: {} },
      failure_store: { inherit: {} },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates query KI with provided id and upserts it', async () => {
    const kiClient = {
      upsertQuery: jest.fn().mockResolvedValue(undefined),
    };

    const result = await createQueryKnowledgeIndicatorToolHandler({
      kiClient: kiClient as never,
      definition: definition as never,
      queryInput: {
        id: 'provided-id',
        title: 'Suspicious query',
        description: 'Find suspicious events',
        esql: { query: 'FROM logs.test, logs.test.* | stats c = count()' },
        severity_score: 70,
      },
      logger,
    });

    expect(result).toEqual({ id: 'provided-id' });
    expect(kiClient.upsertQuery).toHaveBeenCalledWith(
      definition,
      expect.objectContaining({
        id: 'provided-id',
        type: 'stats',
        title: 'Suspicious query',
        description: 'Find suspicious events',
        esql: { query: 'FROM logs.test, logs.test.* | stats c = count()' },
        severity_score: 70,
      })
    );
  });

  it('generates id when missing', async () => {
    const kiClient = {
      upsertQuery: jest.fn().mockResolvedValue(undefined),
    };

    const result = await createQueryKnowledgeIndicatorToolHandler({
      kiClient: kiClient as never,
      definition: definition as never,
      queryInput: {
        title: 'Suspicious query',
        description: 'Find suspicious events',
        esql: { query: 'FROM logs.test, logs.test.* METADATA _id, _source' },
      },
      logger,
    });

    expect(result).toEqual({ id: 'generated-query-id' });
    expect(kiClient.upsertQuery).toHaveBeenCalledWith(
      definition,
      expect.objectContaining({
        id: 'generated-query-id',
      })
    );
  });

  it('throws when query upsert fails', async () => {
    const kiClient = {
      upsertQuery: jest.fn().mockRejectedValue(new Error('upsert failed')),
    };

    await expect(
      createQueryKnowledgeIndicatorToolHandler({
        kiClient: kiClient as never,
        definition: definition as never,
        queryInput: {
          title: 'Suspicious query',
          description: 'Find suspicious events',
          esql: { query: 'FROM logs.test, logs.test.* METADATA _id, _source' },
        },
        logger,
      })
    ).rejects.toThrow('upsert failed');

    expect(logger.debug).toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
