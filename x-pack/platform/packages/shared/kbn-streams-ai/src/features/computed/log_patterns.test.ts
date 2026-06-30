/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSigEventsLogPatternsEsql } from '@kbn/ai-tools';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { Streams } from '@kbn/streams-schema';
import { createTracedEsClient } from '@kbn/traced-es-client';
import { logPatternsGenerator, selectLogPatternsForLlm } from './log_patterns';

jest.mock('@kbn/ai-tools', () => ({
  getSigEventsLogPatternsEsql: jest.fn(),
}));

jest.mock('@kbn/traced-es-client', () => ({
  createTracedEsClient: jest.fn(),
}));

const getSigEventsLogPatternsEsqlMock = jest.mocked(getSigEventsLogPatternsEsql);
const createTracedEsClientMock = jest.mocked(createTracedEsClient);

const stream = { name: 'logs.test-default' } as Streams.all.Definition;
const esClient = {} as ElasticsearchClient;
const logger = {} as Logger;
const tracedClient = { traced: true };

describe('logPatternsGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createTracedEsClientMock.mockReturnValue(tracedClient as never);
  });

  it('uses the SigEvents ES|QL log-pattern helper and preserves output shape', async () => {
    getSigEventsLogPatternsEsqlMock.mockResolvedValueOnce([
      { field: 'message', pattern: 'common', count: 10, sample: 'common sample' },
    ]);

    const result = await logPatternsGenerator.generate({
      stream,
      start: 100,
      end: 200,
      esClient,
      logger,
    });

    expect(createTracedEsClientMock).toHaveBeenCalledWith({
      client: esClient,
      logger,
      plugin: 'streams',
    });
    expect(getSigEventsLogPatternsEsqlMock).toHaveBeenCalledWith({
      esClient: tracedClient,
      samplingSource: stream.name,
      start: 100,
      end: 200,
      fields: ['message', 'body.text'],
    });
    expect(result).toEqual({
      patterns: [{ field: 'message', pattern: 'common', count: 10, sample: 'common sample' }],
    });
  });
});

describe('selectLogPatternsForLlm', () => {
  it('returns the common head and rare tail with truncated samples', () => {
    const patterns = Array.from({ length: 12 }, (_, index) => ({
      field: 'message',
      pattern: `pattern-${index}`,
      count: 12 - index,
      sample: index === 0 ? 'x'.repeat(600) : `sample-${index}`,
    }));

    const result = selectLogPatternsForLlm(patterns);

    expect(result.map(({ pattern }) => pattern)).toEqual([
      'pattern-0',
      'pattern-1',
      'pattern-2',
      'pattern-3',
      'pattern-6',
      'pattern-7',
      'pattern-8',
      'pattern-9',
      'pattern-10',
      'pattern-11',
    ]);
    expect(result[0].sample).toHaveLength(501);
  });
});
