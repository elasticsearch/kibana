/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import { runSearchTool } from '@kbn/agent-builder-genai-utils/tools';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import { DEFAULT_ALERTS_INDEX, ESSENTIAL_ALERT_FIELDS } from '../../../common/constants';
import {
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../__mocks__/test_helpers';
import { alertsTool, SECURITY_ALERTS_TOOL_ID } from './alerts_tool';

jest.mock('@kbn/agent-builder-genai-utils/tools', () => ({
  runSearchTool: jest.fn(),
}));

describe('alertsTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const mockModelProvider = agentBuilderMocks.createModelProvider();
  mockModelProvider.getDefaultModel.mockResolvedValue({ model: 'test-model' } as never);
  const mockEvents = {
    reportProgress: jest.fn(),
    sendUiEvent: jest.fn(),
  };
  const tool = alertsTool(mockCore, mockLogger);

  beforeEach(() => {
    jest.clearAllMocks();
    setupMockCoreStartServices(mockCore, mockEsClient);
  });

  describe('schema', () => {
    it('validates correct schema with required query', () => {
      const validInput = {
        query: 'find all alerts',
      };

      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('validates schema with optional index', () => {
      const validInput = {
        query: 'find alerts',
        index: '.alerts-security.alerts-default',
      };

      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('validates schema with optional isCount', () => {
      const validInput = {
        query: 'how many alerts',
        isCount: true,
      };

      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('rejects missing query', () => {
      const invalidInput = {};

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('rejects non-string query', () => {
      const invalidInput = {
        query: 123,
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('rejects non-boolean isCount', () => {
      const invalidInput = {
        query: 'test',
        isCount: 'yes',
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });
  });

  describe('tool properties', () => {
    it('returns correct tool id', () => {
      expect(tool.id).toBe(SECURITY_ALERTS_TOOL_ID);
    });

    it('has correct tags', () => {
      expect(tool.tags).toEqual(['security', 'alerts']);
    });
  });

  describe('handler', () => {
    it('calls runSearchTool with default index when index not provided', async () => {
      const mockResults = [{ type: ToolResultType.other, data: 'test results' }];
      (runSearchTool as jest.Mock).mockResolvedValue({ results: mockResults });
      const fieldsList = ESSENTIAL_ALERT_FIELDS.map((field) => `\`${field}\``).join(', ');

      await tool.handler(
        { query: 'find all alerts' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      expect(runSearchTool).toHaveBeenCalledWith({
        nlQuery: expect.stringContaining('find all alerts'),
        index: `${DEFAULT_ALERTS_INDEX}-default`,
        esClient: mockEsClient.asCurrentUser,
        modelProvider: mockModelProvider,
        events: mockEvents,
        logger: mockLogger,
      });
      const callArgs = (runSearchTool as jest.Mock).mock.calls[0][0];
      expect(callArgs.nlQuery).toContain('KEEP clause');
      expect(callArgs.nlQuery).toContain(fieldsList);
    });

    it('uses handler context spaceId when building default index', async () => {
      (runSearchTool as jest.Mock).mockResolvedValue({ results: [] });

      await tool.handler(
        { query: 'find all alerts' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
          spaceId: 'custom-space',
        })
      );

      const callArgs = (runSearchTool as jest.Mock).mock.calls[0][0];
      expect(callArgs.index).toBe(`${DEFAULT_ALERTS_INDEX}-custom-space`);
    });

    it('forwards time_window_hours to runSearchTool as a time range', async () => {
      (runSearchTool as jest.Mock).mockResolvedValue({ results: [] });

      await tool.handler(
        { query: 'find alerts', time_window_hours: 72 },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      const callArgs = (runSearchTool as jest.Mock).mock.calls[0][0];
      expect(callArgs.timeRange).toEqual({ from: 'now-72h', to: 'now' });
    });

    it('leaves the time range unset when time_window_hours is not provided (24h default preserved)', async () => {
      (runSearchTool as jest.Mock).mockResolvedValue({ results: [] });

      await tool.handler(
        { query: 'find alerts' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      const callArgs = (runSearchTool as jest.Mock).mock.calls[0][0];
      expect(callArgs.timeRange).toBeUndefined();
    });

    it('calls runSearchTool with explicit index when provided', async () => {
      const mockResults = [{ type: ToolResultType.other, data: 'test results' }];
      (runSearchTool as jest.Mock).mockResolvedValue({ results: mockResults });

      await tool.handler(
        { query: 'find alerts', index: '.alerts-security.alerts-custom' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      expect(runSearchTool).toHaveBeenCalledWith({
        nlQuery: expect.stringContaining('find alerts'),
        index: '.alerts-security.alerts-custom',
        esClient: mockEsClient.asCurrentUser,
        modelProvider: mockModelProvider,
        events: mockEvents,
        logger: mockLogger,
      });
    });

    it('enhances query with KEEP clause for alerts index', async () => {
      const mockResults = [{ type: ToolResultType.other, data: 'test results' }];
      (runSearchTool as jest.Mock).mockResolvedValue({ results: mockResults });
      const fieldsList = ESSENTIAL_ALERT_FIELDS.map((field) => `\`${field}\``).join(', ');

      await tool.handler(
        { query: 'find alerts', index: '.alerts-security.alerts-default' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      const callArgs = (runSearchTool as jest.Mock).mock.calls[0][0];
      expect(callArgs.nlQuery).toContain('find alerts');
      expect(callArgs.nlQuery).toContain('KEEP clause');
      expect(callArgs.nlQuery).toContain(fieldsList);
    });

    it('enhances query with count instructions when isCount is true', async () => {
      const mockResults = [{ type: ToolResultType.other, data: 'test results' }];
      (runSearchTool as jest.Mock).mockResolvedValue({ results: mockResults });

      await tool.handler(
        { query: 'how many alerts', index: '.alerts-security.alerts-default', isCount: true },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      const callArgs = (runSearchTool as jest.Mock).mock.calls[0][0];
      expect(callArgs.nlQuery).toContain('how many alerts');
      expect(callArgs.nlQuery).toContain('count query');
      expect(callArgs.nlQuery).toContain('STATS count = COUNT(*)');
    });

    it('does not enhance query for non-alerts index', async () => {
      const mockResults = [{ type: ToolResultType.other, data: 'test results' }];
      (runSearchTool as jest.Mock).mockResolvedValue({ results: mockResults });

      await tool.handler(
        { query: 'find documents', index: 'custom-index' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      const callArgs = (runSearchTool as jest.Mock).mock.calls[0][0];
      expect(callArgs.nlQuery).toBe('find documents');
      expect(callArgs.nlQuery).not.toContain('KEEP clause');
    });

    it('logs debug message with correct parameters', async () => {
      const mockResults = [{ type: ToolResultType.other, data: 'test results' }];
      (runSearchTool as jest.Mock).mockResolvedValue({ results: mockResults });

      await tool.handler(
        { query: 'test query', index: '.alerts-security.alerts-default', isCount: true },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'alerts tool called with query: test query, index: .alerts-security.alerts-default, isCount: true, timeWindowHours: default'
      );
    });

    it('returns results from runSearchTool', async () => {
      const mockResults = [{ type: ToolResultType.other, data: 'test results' }];
      const runSearchToolResult = { results: mockResults };
      (runSearchTool as jest.Mock).mockResolvedValue(runSearchToolResult);

      const result = await tool.handler(
        { query: 'find alerts' },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents as ToolHandlerContext['events'],
        })
      );

      expect(result).toEqual({ results: runSearchToolResult });
    });
  });
});
