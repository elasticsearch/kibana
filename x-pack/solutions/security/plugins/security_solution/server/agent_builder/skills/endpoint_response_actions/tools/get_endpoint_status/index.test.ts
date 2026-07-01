/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable require-atomic-updates */
import {
  isToolHandlerStandardReturn,
  type ToolHandlerContext,
  type ToolHandlerReturn,
  type ToolHandlerStandardReturn,
} from '@kbn/agent-builder-server/tools';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';

import type { EndpointAppContextService } from '../../../../../endpoint/endpoint_app_context_services';
import { createMockEndpointAppContext } from '../../../../../endpoint/mocks';
import { GET_ENDPOINT_STATUS_TOOL_ID } from '../..';
import { getEndpointStatusTool } from '.';

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
const mockContext = { logger: mockLogger } as unknown as ToolHandlerContext;

function assertStandardReturn(result: unknown) {
  if (!isToolHandlerStandardReturn(result as ToolHandlerReturn)) {
    throw new Error('Expected standard tool return');
  }
  return (result as ToolHandlerStandardReturn).results;
}

describe('getEndpointStatusTool', () => {
  let mockEndpointAppContextService: EndpointAppContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEndpointAppContextService = createMockEndpointAppContext().service;
  });

  describe('tool definition', () => {
    it('returns a valid builtin tool definition', () => {
      const tool = getEndpointStatusTool(mockEndpointAppContextService);
      expect(tool.type).toBe(ToolType.builtin);
      expect(tool.id).toBe(GET_ENDPOINT_STATUS_TOOL_ID);
      expect(tool.description).toContain('Retrieves the current status');
      expect(tool.schema).toBeDefined();
    });

    it('has correct tool id format', () => {
      expect(GET_ENDPOINT_STATUS_TOOL_ID).toBe('endpoint-response-actions.get_endpoint_status');
    });
  });

  describe('handler', () => {
    let tool: ReturnType<typeof getEndpointStatusTool>;

    beforeEach(() => {
      tool = getEndpointStatusTool(mockEndpointAppContextService);
    });

    it('returns found: false with reason "endpoint_not_found" when no agent matches', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];

      try {
        const result = await tool.handler({ hostName: 'nonexistent-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.other);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.found).toBe(false);
        expect(data.reason).toBe('endpoint_not_found');
        expect(data.hostName).toBe('nonexistent-host');
        expect(data.isolated).toBe(false);
        expect(data.lastSeen).toBeNull();
        expect(data.status).toBe('offline');
        expect(mockLogger.error).not.toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
      }
    });

    it('calls agentService.list with the correct kuery filter', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];

      try {
        await tool.handler({ hostName: 'my-host' }, mockContext);

        expect(mockAgentService.listAgents).toHaveBeenCalledWith({
          showInactive: true,
          kuery: 'local_metadata.host.name: my-host',
          page: 1,
          perPage: 1,
        });
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
      }
    });

    it('returns found: true with correct data when agent and metadata lookups succeed', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({
          data: [
            {
              metadata: { Endpoint: { state: { isolation: true } } },
              last_checkin: '2024-01-01T00:00:00Z',
              host_status: 'healthy',
            },
          ],
          total: 1,
        }),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({ hostName: 'my-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.other);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.found).toBe(true);
        expect(data.hostName).toBe('my-host');
        expect(data.agentId).toBe('agent-123');
        expect(data.status).toBe('healthy');
        expect(data.isolated).toBe(true);
        expect(data.lastSeen).toBe('2024-01-01T00:00:00Z');

        expect(mockMetadataService.getHostMetadataList).toHaveBeenCalledWith({
          page: 0,
          pageSize: 1,
          kuery: 'agent.id: agent-123',
        });
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('returns found: true with non-isolated status when metadata shows isolation is false', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-456' }],
        }),
      };

      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({
          data: [
            {
              metadata: { Endpoint: { state: { isolation: false } } },
              last_checkin: '2024-06-01T12:00:00Z',
              host_status: 'healthy',
            },
          ],
          total: 1,
        }),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({ hostName: 'safe-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.found).toBe(true);
        expect(data.isolated).toBe(false);
        expect(data.status).toBe('healthy');
        expect(data.lastSeen).toBe('2024-06-01T12:00:00Z');
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('returns index_not_found when agent exists but metadata index does not exist', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [
            {
              id: 'agent-789',
              last_checkin: '2024-01-01T00:00:00Z',
              isolation: false,
              host_status: 'healthy',
            },
          ],
        }),
      };

      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      };

      const mockEsClient = {
        indices: {
          exists: jest.fn().mockResolvedValue(false),
        },
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;
      const originalGetInternalEsClient = mockEndpointAppContextService.getInternalEsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];
      mockEndpointAppContextService.getInternalEsClient = jest.fn(
        () => mockEsClient
      ) as unknown as EndpointAppContextService['getInternalEsClient'];

      try {
        const result = await tool.handler({ hostName: 'found-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.found).toBe(false);
        expect(data.reason).toBe('index_not_found');
        expect(data.hostName).toBe('found-host');

        expect(mockEsClient.indices.exists).toHaveBeenCalledWith({
          index: '.ds-metrics-endpoint.metadata-default',
        });
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
        mockEndpointAppContextService.getInternalEsClient = originalGetInternalEsClient;
      }
    });

    it('returns agent-level fallback when metadata service throws', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [
            {
              id: 'agent-fallback',
              last_checkin: '2024-03-15T08:00:00Z',
              isolation: true,
              host_status: 'unhealthy',
            },
          ],
        }),
      };

      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockRejectedValue(new Error('metadata service timeout')),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({ hostName: 'fallback-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.found).toBe(true);
        expect(data.hostName).toBe('fallback-host');
        expect(data.agentId).toBe('agent-fallback');
        expect(data.isolated).toBe(true);
        expect(data.lastSeen).toBe('2024-03-15T08:00:00Z');
        expect(data.status).toBe('unhealthy');

        expect(mockLogger.warn).toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('returns an error result when the agent service throws', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockRejectedValue(new Error('fleet service unavailable')),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];

      try {
        const result = await tool.handler({ hostName: 'my-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.error);
        expect(assertStandardReturn(result)[0].data).toHaveProperty('message');
        expect(mockLogger.error).toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
      }
    });

    it('falls back to agent-level data when metadata service throws, not an error type', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [
            {
              id: 'agent-fallback2',
              last_checkin: '2024-05-01T10:00:00Z',
              isolation: false,
              host_status: 'unhealthy',
            },
          ],
        }),
      };

      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockRejectedValue(new Error('metadata service timeout')),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({ hostName: 'fallback2-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.other);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.found).toBe(true);
        expect(data.isolated).toBe(false);
        expect(data.lastSeen).toBe('2024-05-01T10:00:00Z');
        expect(data.status).toBe('unhealthy');

        expect(mockLogger.warn).toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });
  });
});
