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
import { UNISOLATE_TOOL_ID } from '../..';
import { unisolateHostTool } from '.';

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
const mockContext = { logger: mockLogger } as unknown as ToolHandlerContext;

function assertStandardReturn(result: unknown) {
  if (!isToolHandlerStandardReturn(result as ToolHandlerReturn)) {
    throw new Error('Expected standard tool return');
  }
  return (result as ToolHandlerStandardReturn).results;
}

describe('unisolateHostTool', () => {
  let mockEndpointAppContextService: EndpointAppContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEndpointAppContextService = createMockEndpointAppContext().service;
  });

  describe('tool definition', () => {
    it('returns a valid builtin tool definition', () => {
      const tool = unisolateHostTool(mockEndpointAppContextService);
      expect(tool.type).toBe(ToolType.builtin);
      expect(tool.id).toBe(UNISOLATE_TOOL_ID);
      expect(tool.description).toContain('Un-isolates a host');
      expect(tool.schema).toBeDefined();
    });

    it('has correct tool id format', () => {
      expect(UNISOLATE_TOOL_ID).toBe('endpoint-response-actions.unisolate_host');
    });
  });

  describe('handler', () => {
    let tool: ReturnType<typeof unisolateHostTool>;

    beforeEach(() => {
      tool = unisolateHostTool(mockEndpointAppContextService);
    });

    it('returns found: false with reason endpoint_not_found when no agent matches', async () => {
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
        await tool.handler({ hostName: 'my-host', comment: 'test comment' }, mockContext);

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

    it('calls responseActionsClient.release with endpoint_ids and comment when agent found', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockResponseActionsClient = {
        isolate: jest.fn().mockReturnValue(Promise.resolve()),
        release: jest.fn().mockResolvedValue({
          id: 'action-456',
          status: 'accepted',
          wasSuccessful: true,
          hosts: { 'agent-123': { name: 'my-host' } },
        }),
        suspendProcess: jest.fn().mockReturnValue(Promise.resolve()),
        upload: jest.fn().mockReturnValue(Promise.resolve()),
        getFile: jest.fn().mockReturnValue(Promise.resolve()),
        execute: jest.fn().mockReturnValue(Promise.resolve()),
        killProcess: jest.fn().mockReturnValue(Promise.resolve()),
        runningProcesses: jest.fn().mockReturnValue(Promise.resolve()),
        processPendingActions: jest.fn().mockReturnValue(Promise.resolve()),
        getFileInfo: jest.fn().mockReturnValue(Promise.resolve()),
        getFileDownload: jest.fn().mockReturnValue(Promise.resolve()),
        scan: jest.fn().mockReturnValue(Promise.resolve()),
        runscript: jest.fn().mockReturnValue(Promise.resolve()),
        getCustomScripts: jest.fn().mockReturnValue(Promise.resolve()),
        cancel: jest.fn().mockReturnValue(Promise.resolve()),
        memoryDump: jest.fn().mockReturnValue(Promise.resolve()),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetInternalResponseActionsClient =
        mockEndpointAppContextService.getInternalResponseActionsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getInternalResponseActionsClient = jest.fn(
        () => mockResponseActionsClient
      ) as unknown as EndpointAppContextService['getInternalResponseActionsClient'];

      try {
        const result = await tool.handler(
          { hostName: 'my-host', comment: 'reconnecting' },
          mockContext
        );

        expect(mockResponseActionsClient.release).toHaveBeenCalledWith(
          {
            endpoint_ids: ['agent-123'],
            comment: 'reconnecting',
          },
          { hosts: { 'agent-123': { name: 'my-host' } } }
        );

        // Ensure isolate was NOT called — unisolate tool calls release, not isolate
        expect(mockResponseActionsClient.isolate).not.toHaveBeenCalled();

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.other);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.actionId).toBe('action-456');
        expect(data.status).toBe('accepted');
        expect(data.wasSuccessful).toBe(true);
        expect(data.comment).toBe('reconnecting');
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getInternalResponseActionsClient =
          originalGetInternalResponseActionsClient;
      }
    });

    it('uses a default comment when none is provided', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockResponseActionsClient = {
        isolate: jest.fn().mockReturnValue(Promise.resolve()),
        release: jest.fn().mockResolvedValue({
          id: 'action-789',
          status: 'accepted',
          wasSuccessful: true,
          hosts: { 'agent-123': { name: 'test-host' } },
        }),
        suspendProcess: jest.fn().mockReturnValue(Promise.resolve()),
        upload: jest.fn().mockReturnValue(Promise.resolve()),
        getFile: jest.fn().mockReturnValue(Promise.resolve()),
        execute: jest.fn().mockReturnValue(Promise.resolve()),
        killProcess: jest.fn().mockReturnValue(Promise.resolve()),
        runningProcesses: jest.fn().mockReturnValue(Promise.resolve()),
        processPendingActions: jest.fn().mockReturnValue(Promise.resolve()),
        getFileInfo: jest.fn().mockReturnValue(Promise.resolve()),
        getFileDownload: jest.fn().mockReturnValue(Promise.resolve()),
        scan: jest.fn().mockReturnValue(Promise.resolve()),
        runscript: jest.fn().mockReturnValue(Promise.resolve()),
        getCustomScripts: jest.fn().mockReturnValue(Promise.resolve()),
        cancel: jest.fn().mockReturnValue(Promise.resolve()),
        memoryDump: jest.fn().mockReturnValue(Promise.resolve()),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetInternalResponseActionsClient =
        mockEndpointAppContextService.getInternalResponseActionsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getInternalResponseActionsClient = jest.fn(
        () => mockResponseActionsClient
      ) as unknown as EndpointAppContextService['getInternalResponseActionsClient'];

      try {
        await tool.handler({ hostName: 'test-host' }, mockContext);

        expect(mockResponseActionsClient.release).toHaveBeenCalledWith(
          {
            endpoint_ids: ['agent-123'],
            comment: 'Un-isolated via AI agent: test-host',
          },
          { hosts: { 'agent-123': { name: 'test-host' } } }
        );
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getInternalResponseActionsClient =
          originalGetInternalResponseActionsClient;
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

    it('returns an error result when the response actions client throws', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockResponseActionsClient = {
        isolate: jest.fn().mockReturnValue(Promise.resolve()),
        release: jest.fn().mockRejectedValue(new Error('release failed')),
        suspendProcess: jest.fn().mockReturnValue(Promise.resolve()),
        upload: jest.fn().mockReturnValue(Promise.resolve()),
        getFile: jest.fn().mockReturnValue(Promise.resolve()),
        execute: jest.fn().mockReturnValue(Promise.resolve()),
        killProcess: jest.fn().mockReturnValue(Promise.resolve()),
        runningProcesses: jest.fn().mockReturnValue(Promise.resolve()),
        processPendingActions: jest.fn().mockReturnValue(Promise.resolve()),
        getFileInfo: jest.fn().mockReturnValue(Promise.resolve()),
        getFileDownload: jest.fn().mockReturnValue(Promise.resolve()),
        scan: jest.fn().mockReturnValue(Promise.resolve()),
        runscript: jest.fn().mockReturnValue(Promise.resolve()),
        getCustomScripts: jest.fn().mockReturnValue(Promise.resolve()),
        cancel: jest.fn().mockReturnValue(Promise.resolve()),
        memoryDump: jest.fn().mockReturnValue(Promise.resolve()),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetInternalResponseActionsClient =
        mockEndpointAppContextService.getInternalResponseActionsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getInternalResponseActionsClient = jest.fn(
        () => mockResponseActionsClient
      ) as unknown as EndpointAppContextService['getInternalResponseActionsClient'];

      try {
        const result = await tool.handler({ hostName: 'my-host' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.error);
        expect((assertStandardReturn(result)[0].data as Record<string, unknown>).message).toContain(
          'Error un-isolating host'
        );
        expect(mockLogger.error).toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getInternalResponseActionsClient =
          originalGetInternalResponseActionsClient;
      }
    });
  });
});
