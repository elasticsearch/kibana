/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggerMock } from '@kbn/logging-mocks';
import { LogsRepository } from './logs_repository';

const createDataStreamClientMock = () => ({
  create: jest.fn().mockResolvedValue(undefined),
  search: jest.fn().mockResolvedValue({
    hits: {
      total: { value: 2 },
      hits: [
        { _source: { message: 'log-1' } },
        { _source: { message: 'log-2' } },
        { _source: undefined },
      ],
    },
  }),
});

jest.mock('./data_stream', () => ({
  initializeDataStreamClient: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initializeDataStreamClient } = require('./data_stream');

describe('LogsRepository', () => {
  let dataStreamClient: ReturnType<typeof createDataStreamClientMock>;
  let repo: LogsRepository;

  beforeEach(() => {
    dataStreamClient = createDataStreamClientMock();
    (initializeDataStreamClient as jest.Mock).mockResolvedValue(dataStreamClient);
    repo = new LogsRepository({} as any, loggerMock.create());
  });

  describe('createLogs', () => {
    it.each([true, false])(
      'handles partial bulk failures with strict mode %s',
      async (throwOnFailure) => {
        dataStreamClient.create.mockResolvedValue({
          errors: true,
          items: [
            {
              create: {
                status: 400,
                error: { type: 'mapper_parsing_exception', reason: 'invalid event' },
              },
            },
          ],
        });
        const result = repo.createLogs([], { throwOnFailure });
        if (throwOnFailure) {
          await expect(result).rejects.toThrow('Failed to index 1 workflow events: invalid event');
        } else {
          await expect(result).resolves.toBeUndefined();
        }
      }
    );

    it('delegates to dataStreamClient.create', async () => {
      const events = [{ message: 'hello' }];
      await repo.createLogs(events as any);
      expect(dataStreamClient.create).toHaveBeenCalledWith({ documents: events });
    });
  });

  describe('getRecentLogs', () => {
    it('returns logs with default limit', async () => {
      const result = await repo.getRecentLogs();
      expect(dataStreamClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 100,
          query: { match_all: {} },
        })
      );
      expect(result.total).toBe(2);
      expect(result.logs).toHaveLength(2);
    });

    it('uses custom limit', async () => {
      await repo.getRecentLogs(50);
      expect(dataStreamClient.search).toHaveBeenCalledWith(expect.objectContaining({ size: 50 }));
    });
  });

  describe('searchLogs', () => {
    it('constructs term queries for provided filter fields', async () => {
      await repo.searchLogs({
        executionId: 'exec-1',
        stepExecutionId: 'step-exec-1',
        stepId: 'step-1',
        level: 'error',
        spaceId: 'default',
      });

      const searchArg = dataStreamClient.search.mock.calls[0][0];
      expect(searchArg.query.bool.must).toEqual(
        expect.arrayContaining([
          { term: { 'workflow.execution_id': 'exec-1' } },
          { term: { 'workflow.step_execution_id': 'step-exec-1' } },
          { term: { 'workflow.step_id': 'step-1' } },
          { term: { level: 'error' } },
          { term: { spaceId: 'default' } },
        ])
      );
    });

    it('applies pagination and sorting defaults', async () => {
      await repo.searchLogs({});
      const searchArg = dataStreamClient.search.mock.calls[0][0];
      expect(searchArg.size).toBe(100);
      expect(searchArg.from).toBe(0);
      expect(searchArg.sort).toEqual([{ '@timestamp': 'desc' }]);
    });

    it('maps timestamp sortField to @timestamp', async () => {
      await repo.searchLogs({ sortField: 'timestamp', sortOrder: 'asc' });
      const searchArg = dataStreamClient.search.mock.calls[0][0];
      expect(searchArg.sort).toEqual([{ '@timestamp': 'asc' }]);
    });

    it('handles numeric total in response', async () => {
      dataStreamClient.search.mockResolvedValueOnce({
        hits: { total: 5, hits: [] },
      });
      const result = await repo.searchLogs({});
      expect(result.total).toBe(5);
      expect(result.logs).toHaveLength(0);
    });
  });
});
