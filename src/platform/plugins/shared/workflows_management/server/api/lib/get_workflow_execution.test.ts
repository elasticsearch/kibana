/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { getWorkflowExecution } from './get_workflow_execution';

describe('getWorkflowExecution', () => {
  let mockEsClient: jest.Mocked<ElasticsearchClient>;
  let mockLogger: ReturnType<typeof loggerMock.create>;

  const baseParams = {
    workflowExecutionIndex: '.workflows-executions',
    stepsExecutionIndex: '.workflows-steps',
    workflowExecutionId: 'exec-1',
    spaceId: 'default',
  };

  const baseExecutionDoc = {
    spaceId: 'default',
    workflowId: 'workflow-1',
    status: 'completed',
    billable: true,
    startedAt: '2024-01-01T00:00:00Z',
    stepExecutionIds: ['step-doc-1', 'step-doc-2'],
    workflowDefinition: { version: '1', name: 'test', enabled: true, triggers: [], steps: [] },
    concurrencyGroupKey: 'streams-ki-onboarding-my-stream',
  };

  beforeEach(() => {
    mockEsClient = {
      get: jest.fn(),
      mget: jest.fn(),
      search: jest.fn(),
    } as any;
    mockLogger = loggerMock.create();
    jest.clearAllMocks();
  });

  describe('source excludes with mget (stepExecutionIds present)', () => {
    beforeEach(() => {
      mockEsClient.get.mockResolvedValue({
        _source: baseExecutionDoc,
      } as any);
      mockEsClient.mget.mockResolvedValue({
        docs: [
          { found: true, _source: { stepId: 's1', status: 'completed', globalExecutionIndex: 0 } },
          { found: true, _source: { stepId: 's2', status: 'completed', globalExecutionIndex: 1 } },
        ],
      } as any);
    });

    it('should not pass _source_excludes when both includeInput and includeOutput are true', async () => {
      await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
        includeInput: true,
        includeOutput: true,
      });

      expect(mockEsClient.mget).toHaveBeenCalledWith(
        expect.not.objectContaining({ _source_excludes: expect.anything() })
      );
    });

    it('should pass _source_excludes: ["input", "output"] when both are false', async () => {
      await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
        includeInput: false,
        includeOutput: false,
      });

      expect(mockEsClient.mget).toHaveBeenCalledWith(
        expect.objectContaining({
          _source_excludes: ['input', 'output'],
        })
      );
    });

    it('should pass _source_excludes: ["input"] when only includeInput is false', async () => {
      await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
        includeInput: false,
        includeOutput: true,
      });

      expect(mockEsClient.mget).toHaveBeenCalledWith(
        expect.objectContaining({
          _source_excludes: ['input'],
        })
      );
    });

    it('should pass _source_excludes: ["output"] when only includeOutput is false', async () => {
      await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
        includeInput: true,
        includeOutput: false,
      });

      expect(mockEsClient.mget).toHaveBeenCalledWith(
        expect.objectContaining({
          _source_excludes: ['output'],
        })
      );
    });

    it('should default includeInput and includeOutput to false when omitted', async () => {
      await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
      });

      expect(mockEsClient.mget).toHaveBeenCalledWith(
        expect.objectContaining({
          _source_excludes: ['input', 'output'],
        })
      );
    });
  });

  describe('source excludes with search fallback (no stepExecutionIds)', () => {
    beforeEach(() => {
      mockEsClient.get.mockResolvedValue({
        _source: { ...baseExecutionDoc, stepExecutionIds: undefined },
      } as any);
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } } as any);
    });

    it('should pass _source excludes to search when includeInput/includeOutput are false', async () => {
      await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
        includeInput: false,
        includeOutput: false,
      });

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          _source: { excludes: ['input', 'output'] },
        })
      );
    });

    it('should not pass _source excludes when both flags are true', async () => {
      await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
        includeInput: true,
        includeOutput: true,
      });

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.not.objectContaining({
          _source: expect.anything(),
        })
      );
    });
  });

  describe('basic behavior', () => {
    it('should return null when document is not found (404)', async () => {
      const notFoundError = new Error('Not found');
      Object.assign(notFoundError, { meta: { statusCode: 404 } });
      mockEsClient.get.mockRejectedValue(notFoundError);

      const result = await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
      });

      expect(result).toBeNull();
    });

    it('should return null when spaceId does not match', async () => {
      mockEsClient.get.mockResolvedValue({
        _source: { ...baseExecutionDoc, spaceId: 'other-space' },
      } as any);

      const result = await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
      });

      expect(result).toBeNull();
    });

    it('should return the execution DTO with step executions', async () => {
      mockEsClient.get.mockResolvedValue({
        _source: baseExecutionDoc,
      } as any);
      mockEsClient.mget.mockResolvedValue({
        docs: [
          {
            found: true,
            _source: {
              stepId: 's1',
              status: 'completed',
              globalExecutionIndex: 1,
              output: { result: 'ok' },
            },
          },
          {
            found: true,
            _source: {
              stepId: 's2',
              status: 'completed',
              globalExecutionIndex: 0,
              input: { arg: 1 },
            },
          },
        ],
      } as any);

      const result = await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('exec-1');
      expect(result?.stepExecutions).toHaveLength(2);
      expect(result?.concurrencyGroupKey).toBe('streams-ki-onboarding-my-stream');
      expect(result).not.toHaveProperty('billable');
    });

    it('should include workflow document version when present on the execution', async () => {
      mockEsClient.get.mockResolvedValue({
        _source: { ...baseExecutionDoc, version: 7 },
      } as any);
      mockEsClient.mget.mockResolvedValue({ docs: [] } as any);

      const result = await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
      });

      expect(result?.version).toBe(7);
    });

    it('should omit workflow document version when absent on legacy executions', async () => {
      mockEsClient.get.mockResolvedValue({
        _source: baseExecutionDoc,
      } as any);
      mockEsClient.mget.mockResolvedValue({ docs: [] } as any);

      const result = await getWorkflowExecution({
        ...baseParams,
        esClient: mockEsClient,
        logger: mockLogger,
      });

      expect(result?.version).toBeUndefined();
    });
  });
});
