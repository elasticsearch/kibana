/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { getErrorSource, TaskErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import { executeEsqlRequest } from './execute_esql_request';

describe('executeEsqlRequest', () => {
  const logger = loggingSystemMock.createLogger();
  const esClient = elasticsearchServiceMock.createElasticsearchClient();

  const esqlRequest = {
    query: 'FROM logs-* | WHERE host.name == "test"',
    filter: { match_all: {} },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed results when the query succeeds', async () => {
    esClient.esql.query.mockResolvedValueOnce({
      columns: [
        { name: '_source', type: 'object' },
        { name: '_id', type: 'keyword' },
      ],
      values: [[{ host: { name: 'test' } }, 'doc-1']],
    } as never);

    const results = await executeEsqlRequest({ esClient, esqlRequest, logger });

    expect(results).toEqual([{ _id: 'doc-1', _source: { host: { name: 'test' } } }]);
  });

  it('reconstructs documents from projected columns when _id/_source are missing (ES|QL view)', async () => {
    esClient.esql.query.mockResolvedValueOnce({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'host.name', type: 'keyword' },
        { name: 'message', type: 'text' },
      ],
      values: [['2026-06-18T12:30:06.566Z', 'mesos-slave-01', 'INFO signal handlers']],
    } as never);

    const results = await executeEsqlRequest({ esClient, esqlRequest, logger });

    expect(results).toHaveLength(1);
    expect(results[0]._source).toEqual({
      '@timestamp': '2026-06-18T12:30:06.566Z',
      'host.name': 'mesos-slave-01',
      message: 'INFO signal handlers',
    });
    // Synthetic id is a deterministic, non-empty hash of the reconstructed source.
    expect(typeof results[0]._id).toBe('string');
    expect(results[0]._id).not.toHaveLength(0);
  });

  it('derives stable synthetic ids: identical rows hash equal, different rows differ', async () => {
    const columns = [
      { name: '@timestamp', type: 'date' },
      { name: 'message', type: 'text' },
    ];
    esClient.esql.query.mockResolvedValueOnce({
      columns,
      values: [
        ['2026-06-18T12:30:06.566Z', 'a'],
        ['2026-06-18T12:30:06.566Z', 'a'],
        ['2026-06-18T12:30:07.000Z', 'b'],
      ],
    } as never);

    const results = await executeEsqlRequest({ esClient, esqlRequest, logger });

    expect(results[0]._id).toBe(results[1]._id);
    expect(results[0]._id).not.toBe(results[2]._id);
  });

  it('returns an empty array when no metadata and no data columns are present', async () => {
    esClient.esql.query.mockResolvedValueOnce({
      columns: [{ name: '_index', type: 'keyword' }],
      values: [['logs-a']],
    } as never);

    const results = await executeEsqlRequest({ esClient, esqlRequest, logger });

    expect(results).toEqual([]);
  });

  it('skips view rows whose projected columns are all null', async () => {
    esClient.esql.query.mockResolvedValueOnce({
      columns: [
        { name: '@timestamp', type: 'date' },
        { name: 'message', type: 'text' },
      ],
      values: [[null, null]],
    } as never);

    const results = await executeEsqlRequest({ esClient, esqlRequest, logger });

    expect(results).toEqual([]);
  });

  it('throws a user error when the ES|QL query fails', async () => {
    esClient.esql.query.mockRejectedValueOnce(
      new Error('verification_exception: Unknown index [logs.kafka]')
    );

    try {
      await executeEsqlRequest({ esClient, esqlRequest, logger });
      fail('Expected executeEsqlRequest to throw');
    } catch (e) {
      const error = e as Error;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Error executing ES|QL request');
      expect(error.message).toContain('verification_exception');
      expect(getErrorSource(error)).toBe(TaskErrorSource.USER);
    }
  });

  it('logs the error message at debug level', async () => {
    esClient.esql.query.mockRejectedValueOnce(new Error('some query error'));

    await expect(executeEsqlRequest({ esClient, esqlRequest, logger })).rejects.toThrow();

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Error executing ES|QL request: some query error')
    );
  });
});
