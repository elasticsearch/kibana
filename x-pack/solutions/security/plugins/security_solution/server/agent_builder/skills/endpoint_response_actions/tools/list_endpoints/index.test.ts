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
import { LIST_ENDPOINTS_TOOL_ID } from '../..';
import { listEndpointsTool } from '.';

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
const mockContext = { logger: mockLogger } as unknown as ToolHandlerContext;

function assertStandardReturn(result: unknown) {
  if (!isToolHandlerStandardReturn(result as ToolHandlerReturn)) {
    throw new Error('Expected standard tool return');
  }
  return (result as ToolHandlerStandardReturn).results;
}

describe('listEndpointsTool', () => {
  let mockEndpointAppContextService: EndpointAppContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEndpointAppContextService = createMockEndpointAppContext().service;
  });

  describe('tool definition', () => {
    it('returns a valid builtin tool definition', () => {
      const tool = listEndpointsTool(mockEndpointAppContextService);
      expect(tool.type).toBe(ToolType.builtin);
      expect(tool.id).toBe(LIST_ENDPOINTS_TOOL_ID);
      expect(tool.description).toContain('endpoint');
      expect(tool.schema).toBeDefined();
    });

    it('has correct tool id format', () => {
      expect(LIST_ENDPOINTS_TOOL_ID).toBe('endpoint-response-actions.list_endpoints');
    });
  });

  describe('handler', () => {
    let tool: ReturnType<typeof listEndpointsTool>;

    beforeEach(() => {
      tool = listEndpointsTool(mockEndpointAppContextService);
    });

    it('returns a list of endpoints with status and isolation info', async () => {
      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({
          data: [
            {
              metadata: {
                host: { hostname: 'server-alpha', os: { name: 'Ubuntu', version: '22.04' } },
                agent: { id: 'agent-1' },
                Endpoint: { state: { isolation: false } },
              },
              last_checkin: '2024-06-01T12:00:00Z',
              host_status: 'healthy',
            },
            {
              metadata: {
                host: { hostname: 'server-bravo', os: { name: 'Windows', version: '11' } },
                agent: { id: 'agent-2' },
                Endpoint: { state: { isolation: true } },
              },
              last_checkin: '2024-06-01T10:00:00Z',
              host_status: 'unhealthy',
            },
          ],
          total: 2,
        }),
      };

      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({}, mockContext);
        const results = assertStandardReturn(result);
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe(ToolResultType.other);

        const data = results[0].data as {
          endpoints: Array<Record<string, unknown>>;
          total: number;
        };
        expect(data.total).toBe(2);
        expect(data.endpoints).toHaveLength(2);

        expect(data.endpoints[0]).toEqual(
          expect.objectContaining({
            hostName: 'server-alpha',
            status: 'healthy',
            isolated: false,
            os: 'Ubuntu 22.04',
          })
        );
        expect(data.endpoints[1]).toEqual(
          expect.objectContaining({
            hostName: 'server-bravo',
            status: 'unhealthy',
            isolated: true,
            os: 'Windows 11',
          })
        );
      } finally {
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('returns empty list when no endpoints exist', async () => {
      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({
          data: [],
          total: 0,
        }),
      };

      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({}, mockContext);
        const results = assertStandardReturn(result);
        const data = results[0].data as {
          endpoints: Array<Record<string, unknown>>;
          total: number;
        };
        expect(data.total).toBe(0);
        expect(data.endpoints).toHaveLength(0);
      } finally {
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('filters by hostname when hostNameFilter is provided', async () => {
      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({
          data: [
            {
              metadata: {
                host: { hostname: 'prod-web-01', os: { name: 'Ubuntu', version: '22.04' } },
                agent: { id: 'agent-1' },
                Endpoint: { state: { isolation: false } },
              },
              last_checkin: '2024-06-01T12:00:00Z',
              host_status: 'healthy',
            },
          ],
          total: 1,
        }),
      };

      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        await tool.handler({ hostNameFilter: 'prod-web' }, mockContext);

        expect(mockMetadataService.getHostMetadataList).toHaveBeenCalledWith(
          expect.objectContaining({
            kuery: expect.stringContaining('prod-web'),
          })
        );
      } finally {
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('returns an error result when the metadata service throws', async () => {
      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockRejectedValue(new Error('metadata service unavailable')),
      };

      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({}, mockContext);
        const results = assertStandardReturn(result);
        expect(results).toHaveLength(1);
        expect(results[0].type).toBe(ToolResultType.error);
        expect(results[0].data).toHaveProperty('message');
        expect(mockLogger.error).toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('handles missing os metadata gracefully', async () => {
      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({
          data: [
            {
              metadata: {
                host: { hostname: 'no-os-host' },
                agent: { id: 'agent-no-os' },
                Endpoint: { state: { isolation: false } },
              },
              last_checkin: '2024-06-01T12:00:00Z',
              host_status: 'healthy',
            },
          ],
          total: 1,
        }),
      };

      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        const result = await tool.handler({}, mockContext);
        const results = assertStandardReturn(result);
        const data = results[0].data as {
          endpoints: Array<Record<string, unknown>>;
          total: number;
        };
        expect(data.endpoints[0].os).toBe('Unknown');
      } finally {
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });

    it('caps results at pageSize 20 by default', async () => {
      const mockMetadataService = {
        getHostMetadataList: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      };

      const originalGetEndpointMetadataService =
        mockEndpointAppContextService.getEndpointMetadataService;
      mockEndpointAppContextService.getEndpointMetadataService = jest.fn(
        () => mockMetadataService
      ) as unknown as EndpointAppContextService['getEndpointMetadataService'];

      try {
        await tool.handler({}, mockContext);

        expect(mockMetadataService.getHostMetadataList).toHaveBeenCalledWith(
          expect.objectContaining({
            pageSize: 20,
          })
        );
      } finally {
        mockEndpointAppContextService.getEndpointMetadataService =
          originalGetEndpointMetadataService;
      }
    });
  });
});
