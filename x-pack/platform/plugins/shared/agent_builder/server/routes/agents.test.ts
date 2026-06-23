/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { AgentAccessControlMode } from '@kbn/agent-builder-common';
import { registerAgentRoutes } from './agents';
import type { RouteDependencies } from './types';
import { publicApiPath } from '../../common/constants';

describe('Agent Routes - experimental access-control gate', () => {
  const createPath = `${publicApiPath}/agents`;
  const updatePath = `${publicApiPath}/agents/{id}`;
  let routeHandlers: Record<
    string,
    { handler: (ctx: unknown, req: unknown, res: unknown) => Promise<unknown> }
  >;
  let mockCreate: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockAuditLogCreated: jest.Mock;
  let mockAuditLogUpdated: jest.Mock;
  let mockUiSettingsGet: jest.Mock;

  const createMockContext = (experimentalFeaturesEnabled: boolean) => ({
    core: Promise.resolve({
      uiSettings: {
        client: {
          get: mockUiSettingsGet.mockResolvedValue(experimentalFeaturesEnabled),
        },
      },
    }),
    licensing: Promise.resolve({
      license: { status: 'active', hasAtLeast: jest.fn().mockReturnValue(true) },
    }),
    agentBuilder: Promise.resolve({
      spaces: { getSpaceId: jest.fn().mockReturnValue('default') },
    }),
  });

  const createBody = {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'Test',
    configuration: { tools: [] },
  };

  const updateBodyWithAccessControl = {
    name: 'Updated',
    access_control: { access_mode: AgentAccessControlMode.Private },
  };

  const mockProfile = {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'Test',
    configuration: { tools: [] },
    access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routeHandlers = {};
    mockCreate = jest.fn().mockResolvedValue(mockProfile);
    mockUpdate = jest.fn().mockResolvedValue(mockProfile);
    mockAuditLogCreated = jest.fn();
    mockAuditLogUpdated = jest.fn();
    mockUiSettingsGet = jest.fn();

    const mockRegistry = {
      create: mockCreate,
      update: mockUpdate,
    };

    const getInternalServices = jest.fn().mockReturnValue({
      agents: {
        getRegistry: jest.fn().mockResolvedValue(mockRegistry),
      },
      auditLogService: {
        logAgentCreated: mockAuditLogCreated,
        logAgentUpdated: mockAuditLogUpdated,
      },
    });

    const createVersionedRoute = (method: string, path: string) => ({
      addVersion: jest
        .fn()
        .mockImplementation(
          (
            _config: unknown,
            handler: (ctx: unknown, req: unknown, res: unknown) => Promise<unknown>
          ) => {
            routeHandlers[`${method}:${path}`] = { handler };
            return { addVersion: jest.fn() };
          }
        ),
    });

    const mockRouter = {
      get: jest.fn(),
      versioned: {
        get: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('GET', config.path)
          ),
        post: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('POST', config.path)
          ),
        put: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('PUT', config.path)
          ),
        delete: jest
          .fn()
          .mockImplementation((config: { path: string }) =>
            createVersionedRoute('DELETE', config.path)
          ),
      },
    } as unknown as jest.Mocked<IRouter>;

    registerAgentRoutes({
      router: mockRouter,
      getInternalServices,
      logger: loggingSystemMock.createLogger(),
      analyticsService: undefined,
    } as unknown as RouteDependencies);
  });

  const getCreateHandler = () => routeHandlers[`POST:${createPath}`]?.handler;
  const getUpdateHandler = () => routeHandlers[`PUT:${updatePath}`]?.handler;

  const mockResponse = {
    ok: jest.fn((params: { body?: unknown }) => ({ type: 'ok', ...params })),
    badRequest: jest.fn((params: { body?: { message?: string } }) => ({
      type: 'badRequest',
      ...params,
    })),
  };

  describe('POST /agents (create)', () => {
    it('allows create and calls service.create when access-control mode is provided', async () => {
      const handler = getCreateHandler();
      expect(handler).toBeDefined();

      const ctx = createMockContext(true);
      const request = {
        body: {
          ...createBody,
          access_control: { access_mode: AgentAccessControlMode.Shared },
        },
      };

      const result = await handler!(ctx, request, mockResponse);

      expect(mockCreate).toHaveBeenCalledWith({
        ...createBody,
        access_control: { access_mode: AgentAccessControlMode.Shared },
      });
      expect(result).toMatchObject({ type: 'ok', body: mockProfile });
    });

    it('allows create without access control when experimental setting is false', async () => {
      const handler = getCreateHandler();
      expect(handler).toBeDefined();

      const ctx = createMockContext(false);
      const request = { body: createBody };

      const result = await handler!(ctx, request, mockResponse);

      expect(mockCreate).toHaveBeenCalledWith(createBody);
      expect(result).toMatchObject({ type: 'ok', body: mockProfile });
    });
  });

  describe('PUT /agents/{id} (update)', () => {
    it('allows update and calls service.update when access-control mode is provided', async () => {
      const handler = getUpdateHandler();
      expect(handler).toBeDefined();

      const ctx = createMockContext(true);
      const request = {
        params: { id: 'agent-1' },
        body: updateBodyWithAccessControl,
      };

      const result = await handler!(ctx, request, mockResponse);

      expect(mockUpdate).toHaveBeenCalledWith('agent-1', {
        name: 'Updated',
        access_control: { access_mode: AgentAccessControlMode.Private },
      });
      expect(result).toMatchObject({ type: 'ok', body: mockProfile });
    });

    it('allows non-access-control updates when experimental setting is false', async () => {
      const handler = getUpdateHandler();
      expect(handler).toBeDefined();

      const ctx = createMockContext(false);
      const request = {
        params: { id: 'agent-1' },
        body: { name: 'Updated Name' },
      };

      const result = await handler!(ctx, request, mockResponse);

      expect(mockUpdate).toHaveBeenCalledWith('agent-1', { name: 'Updated Name' });
      expect(result).toMatchObject({ type: 'ok', body: mockProfile });
    });
  });
});
