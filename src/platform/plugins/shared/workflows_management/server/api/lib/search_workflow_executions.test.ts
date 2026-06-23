/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import {
  searchWorkflowExecutions,
  WORKFLOW_EXECUTION_LIST_SOURCE_INCLUDES,
} from './search_workflow_executions';

describe('searchWorkflowExecutions', () => {
  let mockEsClient: jest.Mocked<ElasticsearchClient>;
  let mockLogger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    mockEsClient = {
      search: jest.fn(),
    } as any;

    mockLogger = loggerMock.create();
    mockLogger.error = jest.fn();
  });

  describe('response transformation', () => {
    it('should include concurrencyGroupKey in list results when present', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'exec-1',
              _source: {
                spaceId: 'default',
                status: 'completed',
                error: null,
                isTestRun: false,
                startedAt: '2024-01-01T00:00:00Z',
                finishedAt: '2024-01-01T00:00:03Z',
                duration: 3000,
                workflowId: 'workflow-1',
                triggeredBy: 'manual',
                executedBy: 'elastic',
                concurrencyGroupKey: 'streams-ki-onboarding-my-stream',
              },
            },
          ],
        },
      } as any);

      const result = await searchWorkflowExecutions({
        esClient: mockEsClient,
        logger: mockLogger,
        workflowExecutionIndex: '.workflows-executions',
        query: { term: { workflowId: 'workflow-1' } },
        page: 1,
        size: 20,
      });

      expect(result.results[0]).toEqual(
        expect.objectContaining({
          id: 'exec-1',
          concurrencyGroupKey: 'streams-ki-onboarding-my-stream',
        })
      );
    });
  });

  describe('search options', () => {
    it('should request only list metadata fields from Elasticsearch', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          total: { value: 0 },
          hits: [],
        },
      } as any);

      await searchWorkflowExecutions({
        esClient: mockEsClient,
        logger: mockLogger,
        workflowExecutionIndex: '.workflows-executions',
        query: { term: { workflowId: 'workflow-1' } },
      });

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          _source: { includes: [...WORKFLOW_EXECUTION_LIST_SOURCE_INCLUDES] },
        })
      );
    });

    it('should forward collapse to Elasticsearch search', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          total: { value: 0 },
          hits: [],
        },
      } as any);

      await searchWorkflowExecutions({
        esClient: mockEsClient,
        logger: mockLogger,
        workflowExecutionIndex: '.workflows-executions',
        query: { term: { workflowId: 'workflow-1' } },
        collapse: { field: 'concurrencyGroupKey' },
      });

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          collapse: { field: 'concurrencyGroupKey' },
        })
      );
    });
  });

  describe('error handling', () => {
    it('should not log error when index_not_found_exception occurs (expected behavior)', async () => {
      mockLogger.error.mockClear();
      const indexNotFoundError = new errors.ResponseError({
        statusCode: 404,
        body: {
          error: {
            type: 'index_not_found_exception',
            reason: 'no such index [.workflows-executions]',
          },
        },
        headers: {},
        meta: {} as any,
        warnings: [],
      });

      mockEsClient.search.mockRejectedValue(indexNotFoundError);

      const result = await searchWorkflowExecutions({
        esClient: mockEsClient,
        logger: mockLogger,
        workflowExecutionIndex: '.workflows-executions',
        query: { term: { workflowId: 'workflow-1' } },
        page: 1,
        size: 20,
      });

      expect(result).toEqual({
        results: [],
        size: 20,
        page: 1,
        total: 0,
      });

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log error and throw when non-index_not_found_exception errors occur', async () => {
      mockLogger.error.mockClear();
      const otherError = new errors.ResponseError({
        statusCode: 500,
        body: {
          error: {
            type: 'internal_server_error',
            reason: 'Internal server error',
          },
        },
        headers: {},
        meta: {} as any,
        warnings: [],
      });

      mockEsClient.search.mockRejectedValue(otherError);

      await expect(
        searchWorkflowExecutions({
          esClient: mockEsClient,
          logger: mockLogger,
          workflowExecutionIndex: '.workflows-executions',
          query: { term: { workflowId: 'workflow-1' } },
        })
      ).rejects.toThrow(otherError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to search workflow executions')
      );
    });

    it('should log error and throw for non-ResponseError exceptions', async () => {
      mockLogger.error.mockClear();
      const genericError = new Error('Network error');

      mockEsClient.search.mockRejectedValue(genericError);

      await expect(
        searchWorkflowExecutions({
          esClient: mockEsClient,
          logger: mockLogger,
          workflowExecutionIndex: '.workflows-executions',
          query: { term: { workflowId: 'workflow-1' } },
        })
      ).rejects.toThrow('Network error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to search workflow executions')
      );
    });
  });
});
