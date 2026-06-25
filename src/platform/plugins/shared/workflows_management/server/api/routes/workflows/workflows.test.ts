/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRouter } from '@kbn/core/server';
import { httpServerMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { WorkflowsManagementApiActions } from '@kbn/workflows';
import { registerWorkflowRoutes } from '.';
import { ManagedWorkflowReadForbiddenError } from '../../managed_workflow_read_error';
import type { RouteDependencies } from '../types';
import { handleRouteError } from '../utils/route_error_handlers';
import { createWorkflowManagementAuditLogMock } from '../utils/workflow_audit_logging.mock';

jest.mock('../utils/route_error_handlers', () => ({
  handleRouteError: jest.fn((response: { customError: jest.Mock }, error: Error) =>
    response.customError({ statusCode: 500, body: { message: String(error) } })
  ),
}));

const createLicensingContext = () => ({
  workflows: Promise.resolve({
    isWorkflowsAvailable: true,
    emitEvent: jest.fn(),
    managedWorkflows: {
      install: jest.fn(),
      uninstall: jest.fn(),
      getWorkflowStatus: jest.fn(),
      execute: jest.fn(),
    },
  }),
  licensing: Promise.resolve({
    license: {
      isAvailable: true,
      isActive: true,
      hasAtLeast: jest.fn().mockReturnValue(true),
      type: 'enterprise',
    },
  }),
  core: Promise.resolve({
    security: {
      audit: {
        logger: {
          enabled: false,
          log: jest.fn(),
          includeSavedObjectNames: false,
        },
      },
    },
  }),
});

describe('Workflow routes', () => {
  let routeHandlers: Record<string, { handler: (...args: any[]) => Promise<any> }>;
  let mockApi: Record<string, jest.Mock>;
  let mockSpaces: { getSpaceId: jest.Mock };
  let mockLogger: ReturnType<typeof loggingSystemMock.createLogger>;

  const mockResponse = () => httpServerMock.createResponseFactory();
  const defaultAuthzResult = {
    [WorkflowsManagementApiActions.read]: true,
    [WorkflowsManagementApiActions.readManaged]: true,
    [WorkflowsManagementApiActions.readExecution]: true,
    [WorkflowsManagementApiActions.readManagedExecution]: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routeHandlers = {};
    mockSpaces = { getSpaceId: jest.fn().mockReturnValue('default-space') };
    mockLogger = loggingSystemMock.createLogger();

    mockApi = {
      getWorkflows: jest.fn(),
      getWorkflow: jest.fn(),
      getWorkflowsByIds: jest.fn(),
      getWorkflowsSourceByIds: jest.fn(),
      createWorkflow: jest.fn(),
      updateWorkflow: jest.fn(),
      deleteWorkflows: jest.fn(),
      bulkCreateWorkflows: jest.fn(),
      cloneWorkflow: jest.fn(),
      validateWorkflow: jest.fn(),
      getWorkflowStats: jest.fn(),
      getWorkflowAggs: jest.fn(),
      getAvailableConnectors: jest.fn(),
      getWorkflowJsonSchema: jest.fn(),
    };

    const createVersionedRoute = (method: string, path: string) => ({
      addVersion: jest
        .fn()
        .mockImplementation((_config: unknown, handler: (...args: any[]) => Promise<any>) => {
          routeHandlers[`${method}:${path}`] = {
            handler: async (context, request, response) => {
              request.authzResult ??= defaultAuthzResult;
              return handler(context, request, response);
            },
          };
          return { addVersion: jest.fn() };
        }),
    });

    const mockRouter = {
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

    registerWorkflowRoutes({
      router: mockRouter,
      api: mockApi as any,
      logger: mockLogger,
      spaces: mockSpaces as any,
      audit: createWorkflowManagementAuditLogMock(),
    } as unknown as RouteDependencies);
  });

  describe('GET:/api/workflows', () => {
    const key = 'GET:/api/workflows';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getWorkflows with query filters and space id when license is valid', async () => {
      const list = { workflows: [], total: 0 };
      mockApi.getWorkflows.mockResolvedValue(list);
      const request = httpServerMock.createKibanaRequest({
        query: {
          size: 10,
          page: 2,
          enabled: true,
          createdBy: 'user-1',
          tags: ['a'],
          query: 'search',
        },
      });
      (request as any).authzResult = { [WorkflowsManagementApiActions.read]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockSpaces.getSpaceId).toHaveBeenCalledWith(request);
      expect(mockApi.getWorkflows).toHaveBeenCalledWith(
        {
          size: 10,
          page: 2,
          enabled: [true],
          createdBy: ['user-1'],
          tags: ['a'],
          query: 'search',
          managedFilter: 'unmanaged',
        },
        'default-space',
        { includeExecutionHistory: false, includeManagedExecutionHistory: false }
      );
      expect(response.ok).toHaveBeenCalledWith({ body: list });
    });

    it('should pass sortField and sortOrder to api.getWorkflows', async () => {
      mockApi.getWorkflows.mockResolvedValue({ workflows: [], total: 0 });
      const request = httpServerMock.createKibanaRequest({
        query: { sortField: 'enabled', sortOrder: 'asc' },
      });
      (request as any).authzResult = { [WorkflowsManagementApiActions.read]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflows).toHaveBeenCalledWith(
        expect.objectContaining({
          sortField: 'enabled',
          sortOrder: 'asc',
        }),
        'default-space',
        { includeExecutionHistory: false, includeManagedExecutionHistory: false }
      );
    });

    it('should include execution history when user has readExecution privilege', async () => {
      const list = { workflows: [], total: 0 };
      mockApi.getWorkflows.mockResolvedValue(list);
      const request = httpServerMock.createKibanaRequest({ query: {} });
      (request as any).authzResult = {
        [WorkflowsManagementApiActions.read]: true,
        [WorkflowsManagementApiActions.readExecution]: true,
      };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflows).toHaveBeenCalledWith(expect.any(Object), 'default-space', {
        includeExecutionHistory: true,
        includeManagedExecutionHistory: false,
      });
    });

    it('should return forbidden when user lacks read privilege', async () => {
      const request = httpServerMock.createKibanaRequest({ query: {} });
      (request as any).authzResult = { [WorkflowsManagementApiActions.readExecution]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.forbidden).toHaveBeenCalled();
      expect(mockApi.getWorkflows).not.toHaveBeenCalled();
    });

    it('should reject managed workflow filters without managed workflow read privilege', async () => {
      const request = httpServerMock.createKibanaRequest({ query: { managed: 'all' } });
      (request as any).authzResult = { [WorkflowsManagementApiActions.read]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(handleRouteError).toHaveBeenCalledWith(
        response,
        expect.any(ManagedWorkflowReadForbiddenError)
      );
      expect(mockApi.getWorkflows).not.toHaveBeenCalled();
    });

    it('should delegate errors to handleRouteError', async () => {
      const err = new Error('boom');
      mockApi.getWorkflows.mockRejectedValue(err);
      const request = httpServerMock.createKibanaRequest({ query: {} });
      (request as any).authzResult = { [WorkflowsManagementApiActions.read]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(handleRouteError).toHaveBeenCalledWith(response, err);
    });
  });

  describe('GET:/api/workflows/workflow/{id}', () => {
    const key = 'GET:/api/workflows/workflow/{id}';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getWorkflow with id and space id when workflow exists', async () => {
      const workflow = { id: 'wf-1', name: 'W' };
      mockApi.getWorkflow.mockResolvedValue(workflow);
      const request = httpServerMock.createKibanaRequest({ params: { id: 'wf-1' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflow).toHaveBeenCalledWith('wf-1', 'default-space');
      expect(response.ok).toHaveBeenCalledWith({ body: workflow });
    });

    it('should return 404 when workflow is not found', async () => {
      mockApi.getWorkflow.mockResolvedValue(null);
      const request = httpServerMock.createKibanaRequest({ params: { id: 'missing' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.notFound).toHaveBeenCalledWith({ body: { message: 'Workflow not found' } });
    });

    it('should reject managed workflow details without managed workflow read privilege', async () => {
      mockApi.getWorkflow.mockResolvedValue({ id: 'managed-wf', managed: true });
      const request = httpServerMock.createKibanaRequest({ params: { id: 'managed-wf' } });
      (request as any).authzResult = { [WorkflowsManagementApiActions.read]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(handleRouteError).toHaveBeenCalledWith(
        response,
        expect.any(ManagedWorkflowReadForbiddenError)
      );
      expect(response.ok).not.toHaveBeenCalled();
    });

    it('should delegate errors to handleRouteError', async () => {
      const err = new Error('boom');
      mockApi.getWorkflow.mockRejectedValue(err);
      const request = httpServerMock.createKibanaRequest({ params: { id: 'wf-1' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(handleRouteError).toHaveBeenCalledWith(response, err);
    });
  });

  describe('POST:/api/workflows/workflow', () => {
    const key = 'POST:/api/workflows/workflow';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.createWorkflow with body, space id, and request', async () => {
      const created = { id: 'new', name: 'N' };
      mockApi.createWorkflow.mockResolvedValue(created);
      const body = { yaml: 'name: N' };
      const request = httpServerMock.createKibanaRequest({ body });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.createWorkflow).toHaveBeenCalledWith(body, 'default-space', request);
      expect(response.ok).toHaveBeenCalledWith({ body: created });
    });
  });

  describe('PUT:/api/workflows/workflow/{id}', () => {
    const key = 'PUT:/api/workflows/workflow/{id}';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.updateWorkflow with id, body, space id, and request', async () => {
      const updated = { id: 'wf-1', name: 'U' };
      mockApi.updateWorkflow.mockResolvedValue(updated);
      const body = { name: 'U', enabled: true, tags: [], yaml: 'x' };
      const request = httpServerMock.createKibanaRequest({ params: { id: 'wf-1' }, body });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.updateWorkflow).toHaveBeenCalledWith('wf-1', body, 'default-space', request, {
        allowManagedWorkflowMutation: false,
      });
      expect(response.ok).toHaveBeenCalledWith({ body: updated });
    });
  });

  describe('PUT:/api/workflows/managed/workflow/{id}', () => {
    const key = 'PUT:/api/workflows/managed/workflow/{id}';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.updateWorkflow with managed mutation enabled', async () => {
      const updated = { id: 'wf-1', name: 'U' };
      mockApi.updateWorkflow.mockResolvedValue(updated);
      const body = { name: 'U', enabled: true, tags: [], yaml: 'x' };
      const request = httpServerMock.createKibanaRequest({ params: { id: 'wf-1' }, body });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.updateWorkflow).toHaveBeenCalledWith('wf-1', body, 'default-space', request, {
        allowManagedWorkflowMutation: true,
      });
      expect(response.ok).toHaveBeenCalledWith({ body: updated });
    });
  });

  describe('DELETE:/api/workflows/workflow/{id}', () => {
    const key = 'DELETE:/api/workflows/workflow/{id}';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.deleteWorkflows with a single id, space id, and request (soft delete)', async () => {
      mockApi.deleteWorkflows.mockResolvedValue({ total: 1, deleted: 1, failures: [] });
      const request = httpServerMock.createKibanaRequest({
        params: { id: 'wf-1' },
        query: { force: false },
      });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.deleteWorkflows).toHaveBeenCalledWith(['wf-1'], 'default-space', request, {
        force: false,
      });
      expect(response.ok).toHaveBeenCalledWith();
    });

    it('should call api.deleteWorkflows with force=true (hard delete)', async () => {
      mockApi.deleteWorkflows.mockResolvedValue({ total: 1, deleted: 1, failures: [] });
      const request = httpServerMock.createKibanaRequest({
        params: { id: 'wf-1' },
        query: { force: true },
      });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.deleteWorkflows).toHaveBeenCalledWith(['wf-1'], 'default-space', request, {
        force: true,
      });
      expect(response.ok).toHaveBeenCalledWith();
    });
  });

  describe('POST:/api/workflows (bulk create)', () => {
    const key = 'POST:/api/workflows';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.bulkCreateWorkflows when authz allows create', async () => {
      const result = { created: [], failed: [] };
      mockApi.bulkCreateWorkflows.mockResolvedValue(result);
      const workflows = [{ yaml: 'name: A' }];
      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: '/api/workflows',
        query: { overwrite: true },
        body: { workflows },
      });
      (request as any).authzResult = {
        [WorkflowsManagementApiActions.create]: true,
        [WorkflowsManagementApiActions.update]: true,
      };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.bulkCreateWorkflows).toHaveBeenCalledWith(
        workflows,
        'default-space',
        request,
        { overwrite: true }
      );
      expect(response.ok).toHaveBeenCalledWith({ body: result });
    });

    it('should delegate errors to handleRouteError', async () => {
      const err = new Error('bulk failed');
      mockApi.bulkCreateWorkflows.mockRejectedValue(err);
      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: '/api/workflows',
        query: { overwrite: false },
        body: { workflows: [{ yaml: 'name: A' }] },
      });
      (request as any).authzResult = { [WorkflowsManagementApiActions.create]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(handleRouteError).toHaveBeenCalledWith(response, err);
    });
  });

  describe('DELETE:/api/workflows (bulk delete)', () => {
    const key = 'DELETE:/api/workflows';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.deleteWorkflows with ids, space id, and request (soft delete)', async () => {
      const apiResult = {
        total: 2,
        deleted: 2,
        failures: [] as Array<{ id: string; error: string }>,
        successfulIds: ['a', 'b'],
      };
      mockApi.deleteWorkflows.mockResolvedValue(apiResult);
      const request = httpServerMock.createKibanaRequest({
        body: { ids: ['a', 'b'] },
        query: { force: false },
      });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.deleteWorkflows).toHaveBeenCalledWith(['a', 'b'], 'default-space', request, {
        force: false,
      });
      expect(response.ok).toHaveBeenCalledWith({
        body: { total: 2, deleted: 2, failures: [] },
      });
    });

    it('should call api.deleteWorkflows with force=true (hard delete)', async () => {
      const apiResult = {
        total: 2,
        deleted: 2,
        failures: [] as Array<{ id: string; error: string }>,
        successfulIds: ['a', 'b'],
      };
      mockApi.deleteWorkflows.mockResolvedValue(apiResult);
      const request = httpServerMock.createKibanaRequest({
        body: { ids: ['a', 'b'] },
        query: { force: true },
      });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.deleteWorkflows).toHaveBeenCalledWith(['a', 'b'], 'default-space', request, {
        force: true,
      });
      expect(response.ok).toHaveBeenCalledWith({
        body: { total: 2, deleted: 2, failures: [] },
      });
    });
  });

  describe('POST:/api/workflows/mget (get by IDs)', () => {
    const key = 'POST:/api/workflows/mget';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getWorkflowsSourceByIds with ids, space id, and source', async () => {
      const workflows = [{ id: 'a', name: 'Existing' }];
      mockApi.getWorkflowsByIds.mockResolvedValue([{ id: 'a', name: 'Existing', managed: false }]);
      mockApi.getWorkflowsSourceByIds.mockResolvedValue(workflows);
      const request = httpServerMock.createKibanaRequest({ body: { ids: ['a'] } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowsByIds).toHaveBeenCalledWith(['a'], 'default-space');
      expect(mockApi.getWorkflowsSourceByIds).toHaveBeenCalledWith(
        ['a'],
        'default-space',
        undefined
      );
      expect(response.ok).toHaveBeenCalledWith({ body: workflows });
    });
  });

  describe('POST:/api/workflows/workflow/{id}/clone', () => {
    const key = 'POST:/api/workflows/workflow/{id}/clone';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should load workflow then call api.cloneWorkflow with workflow, space id, and request', async () => {
      const wf = { id: 'wf-1', name: 'Orig', yaml: 'name: Orig' };
      const cloned = { id: 'wf-2', name: 'Orig copy' };
      mockApi.getWorkflow.mockResolvedValue(wf);
      mockApi.cloneWorkflow.mockResolvedValue(cloned);
      const request = httpServerMock.createKibanaRequest({ params: { id: 'wf-1' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflow).toHaveBeenCalledWith('wf-1', 'default-space');
      expect(mockApi.cloneWorkflow).toHaveBeenCalledWith(wf, 'default-space', request);
      expect(response.ok).toHaveBeenCalledWith({ body: cloned });
    });

    it('should return 404 when source workflow is not found', async () => {
      mockApi.getWorkflow.mockResolvedValue(null);
      const request = httpServerMock.createKibanaRequest({ params: { id: 'missing' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.notFound).toHaveBeenCalledWith();
      expect(mockApi.cloneWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('POST:/api/workflows/validate', () => {
    const key = 'POST:/api/workflows/validate';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.validateWorkflow with yaml, space id, and request', async () => {
      const validation = { valid: true };
      mockApi.validateWorkflow.mockResolvedValue(validation);
      const request = httpServerMock.createKibanaRequest({ body: { yaml: 'name: X' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.validateWorkflow).toHaveBeenCalledWith('name: X', 'default-space', request);
      expect(response.ok).toHaveBeenCalledWith({ body: validation });
    });

    it('should return customError when validation throws', async () => {
      const err = new Error('validate failed');
      mockApi.validateWorkflow.mockRejectedValue(err);
      const request = httpServerMock.createKibanaRequest({ body: { yaml: 'bad' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: { message: `Internal server error: ${err.message}` },
      });
      expect(handleRouteError).not.toHaveBeenCalled();
    });
  });

  describe('POST:/api/workflows/export', () => {
    const key = 'POST:/api/workflows/export';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getWorkflowsByIds with ids and space id', async () => {
      mockApi.getWorkflowsByIds.mockResolvedValue([
        { id: 'w1', yaml: 'name: A', definition: null },
      ]);
      const request = httpServerMock.createKibanaRequest({ body: { ids: ['w1'] } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowsByIds).toHaveBeenCalledWith(['w1'], 'default-space');
      expect(response.ok).toHaveBeenCalled();
    });

    it('should return notFound when no workflows match ids', async () => {
      mockApi.getWorkflowsByIds.mockResolvedValue([]);
      const request = httpServerMock.createKibanaRequest({ body: { ids: ['missing'] } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'None of the requested workflows were found' },
      });
    });

    it('should export workflows as JSON with entries and manifest', async () => {
      mockApi.getWorkflowsByIds.mockResolvedValue([
        {
          id: 'w-1',
          name: 'Workflow w-1',
          yaml: 'name: Workflow w-1\nsteps: []',
          definition: null,
        },
        {
          id: 'w-2',
          name: 'Workflow w-2',
          yaml: 'name: Workflow w-2\nsteps: []',
          definition: null,
        },
      ]);

      const request = httpServerMock.createKibanaRequest({ body: { ids: ['w-1', 'w-2'] } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);
      const { body } = (response.ok as jest.Mock).mock.calls[0][0];

      expect(body.entries).toEqual([
        { id: 'w-1', yaml: 'name: Workflow w-1\nsteps: []' },
        { id: 'w-2', yaml: 'name: Workflow w-2\nsteps: []' },
      ]);
      expect(body.manifest.exportedCount).toBe(2);
      expect(body.manifest.version).toBe('1');
      expect(body.manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should log a warning when some workflow IDs are missing', async () => {
      mockApi.getWorkflowsByIds.mockResolvedValue([
        { id: 'w-1', name: 'Found', yaml: 'name: Found', definition: null },
      ]);
      const request = httpServerMock.createKibanaRequest({ body: { ids: ['w-missing-1'] } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.ok).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Export skipped 1 missing workflow(s): w-missing-1'
      );
    });
  });

  describe('GET:/api/workflows/stats', () => {
    const key = 'GET:/api/workflows/stats';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getWorkflowStats with space id', async () => {
      const stats = { total: 3 };
      mockApi.getWorkflowStats.mockResolvedValue(stats);
      const request = httpServerMock.createKibanaRequest();
      (request as any).authzResult = { [WorkflowsManagementApiActions.read]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowStats).toHaveBeenCalledWith('default-space', {
        includeExecutionStats: false,
        includeManagedExecutionStats: false,
      });
      expect(response.ok).toHaveBeenCalledWith({ body: stats });
    });

    it('should return forbidden when user lacks read privilege', async () => {
      const request = httpServerMock.createKibanaRequest();
      (request as any).authzResult = { [WorkflowsManagementApiActions.readExecution]: true };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.forbidden).toHaveBeenCalled();
      expect(mockApi.getWorkflowStats).not.toHaveBeenCalled();
    });

    it('should include execution stats when user has readExecution privilege', async () => {
      const stats = { total: 3 };
      mockApi.getWorkflowStats.mockResolvedValue(stats);
      const request = httpServerMock.createKibanaRequest();
      (request as any).authzResult = {
        [WorkflowsManagementApiActions.read]: true,
        [WorkflowsManagementApiActions.readExecution]: true,
      };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowStats).toHaveBeenCalledWith('default-space', {
        includeExecutionStats: true,
        includeManagedExecutionStats: false,
      });
    });

    it('should include managed execution stats when user has managed execution read privilege', async () => {
      const stats = { total: 3 };
      mockApi.getWorkflowStats.mockResolvedValue(stats);
      const request = httpServerMock.createKibanaRequest();
      (request as any).authzResult = {
        [WorkflowsManagementApiActions.read]: true,
        [WorkflowsManagementApiActions.readExecution]: true,
        [WorkflowsManagementApiActions.readManagedExecution]: true,
      };
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowStats).toHaveBeenCalledWith('default-space', {
        includeExecutionStats: true,
        includeManagedExecutionStats: true,
      });
    });
  });

  describe('GET:/api/workflows/aggs', () => {
    const key = 'GET:/api/workflows/aggs';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getWorkflowAggs with fields from query and space id', async () => {
      const aggs = { tags: {} };
      mockApi.getWorkflowAggs.mockResolvedValue(aggs);
      const request = httpServerMock.createKibanaRequest({ query: { fields: ['tags'] } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowAggs).toHaveBeenCalledWith(['tags'], 'default-space', {
        managedFilter: 'unmanaged',
      });
      expect(response.ok).toHaveBeenCalledWith({ body: aggs });
    });

    it('should normalize a single string field to an array', async () => {
      const aggs = { tags: {} };
      mockApi.getWorkflowAggs.mockResolvedValue(aggs);
      const request = httpServerMock.createKibanaRequest({ query: { fields: 'tags' } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowAggs).toHaveBeenCalledWith(['tags'], 'default-space', {
        managedFilter: 'unmanaged',
      });
      expect(response.ok).toHaveBeenCalledWith({ body: aggs });
    });

    it('should pass the managed filter to api.getWorkflowAggs', async () => {
      const aggs = { tags: {} };
      mockApi.getWorkflowAggs.mockResolvedValue(aggs);
      const request = httpServerMock.createKibanaRequest({
        query: { fields: ['tags'], managed: 'all' },
      });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowAggs).toHaveBeenCalledWith(['tags'], 'default-space', {
        managedFilter: 'all',
      });
      expect(response.ok).toHaveBeenCalledWith({ body: aggs });
    });
  });

  describe('GET:/api/workflows/connectors', () => {
    const key = 'GET:/api/workflows/connectors';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getAvailableConnectors with space id and request', async () => {
      mockApi.getAvailableConnectors.mockResolvedValue({
        connectorTypes: { slack: {} },
        totalConnectors: 1,
      });
      const request = httpServerMock.createKibanaRequest();
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getAvailableConnectors).toHaveBeenCalledWith('default-space', request);
      expect(response.ok).toHaveBeenCalledWith({
        body: { connectorTypes: { slack: {} }, totalConnectors: 1 },
      });
    });

    it('should log and delegate errors to handleRouteError', async () => {
      const err = new Error('connector failure');
      mockApi.getAvailableConnectors.mockRejectedValue(err);
      const request = httpServerMock.createKibanaRequest();
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(handleRouteError).toHaveBeenCalledWith(response, err);
    });
  });

  describe('GET:/api/workflows/schema', () => {
    const key = 'GET:/api/workflows/schema';

    it('should register route handler', () => {
      expect(routeHandlers[key]).toBeDefined();
    });

    it('should call api.getWorkflowJsonSchema with loose flag, space id, and request', async () => {
      const schemaBody = { type: 'object' };
      mockApi.getWorkflowJsonSchema.mockResolvedValue(schemaBody);
      const request = httpServerMock.createKibanaRequest({ query: { loose: true } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(mockApi.getWorkflowJsonSchema).toHaveBeenCalledWith(
        { loose: true },
        'default-space',
        request
      );
      expect(response.ok).toHaveBeenCalledWith({ body: schemaBody });
    });

    it('should return customError when schema generation returns null', async () => {
      mockApi.getWorkflowJsonSchema.mockResolvedValue(null);
      const request = httpServerMock.createKibanaRequest({ query: { loose: false } });
      const response = mockResponse();
      const context = createLicensingContext() as any;

      await routeHandlers[key].handler(context, request, response);

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: { message: 'Error generating JSON schema' },
      });
    });
  });
});
