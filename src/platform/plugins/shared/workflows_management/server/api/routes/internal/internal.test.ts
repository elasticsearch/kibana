/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import { IndexPatternsFetcher } from '@kbn/data-views-plugin/server';
import { KQLSyntaxError } from '@kbn/es-query';
import { WorkflowsManagementApiActions } from '@kbn/workflows';
import { WorkflowNotFoundError } from '@kbn/workflows/common/errors';
import type { SearchTriggerEventLogResult } from '@kbn/workflows-ui';
import { WorkflowConflictError } from '@kbn/workflows-yaml';
import { registerInternalRoutes } from '.';
import { WORKFLOWS_EXECUTIONS_INDEX } from '../../../../common';
import { WorkflowHistoryEventNotFoundError } from '../../../lib/workflow_history_event_not_found_error';
import { ManagedWorkflowUpdateForbiddenError } from '../../managed_workflow_errors';
import type { RouteDependencies } from '../types';

describe('Internal Routes', () => {
  type MockRouteHandler = (
    context: typeof mockContext,
    request: ReturnType<typeof httpServerMock.createKibanaRequest>,
    response: ReturnType<typeof httpServerMock.createResponseFactory>
  ) => Promise<unknown>;

  /** Matches {@link registerTriggerEventsLogRoutes} → execution engine `searchTriggerEventLog`. */
  interface TriggerEventLogSearchCall {
    spaceId: string;
    kql?: string;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
  }

  let routeHandlers: Record<string, { handler: MockRouteHandler }>;
  let mockApi: {
    disableAllWorkflows: jest.MockedFunction<(spaceId: string) => Promise<unknown>>;
    searchExecutionsView: jest.Mock;
    getHistoryForWorkflow: jest.Mock;
    restoreWorkflowVersion: jest.Mock;
  };
  let mockAudit: {
    logWorkflowAccessed: jest.Mock;
    logWorkflowUpdated: jest.Mock;
    logWorkflowRestored: jest.Mock;
  };
  let mockTriggerEventsIsEnabled: boolean;
  let mockSearch: jest.Mock;
  const mockSearchTriggerEventLog = jest.fn<
    Promise<SearchTriggerEventLogResult>,
    [TriggerEventLogSearchCall]
  >();

  const mockContext = {
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
      elasticsearch: { client: { asInternalUser: {} } },
      uiSettings: { client: {} },
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routeHandlers = {};
    mockTriggerEventsIsEnabled = true;
    mockSearchTriggerEventLog.mockResolvedValue({
      hits: [],
      total: 0,
      page: 1,
      size: 10,
    });
    mockApi = {
      disableAllWorkflows: jest.fn(),
      searchExecutionsView: jest.fn(),
      getHistoryForWorkflow: jest.fn(),
      restoreWorkflowVersion: jest.fn(),
    };
    mockAudit = {
      logWorkflowAccessed: jest.fn(),
      logWorkflowUpdated: jest.fn(),
      logWorkflowRestored: jest.fn(),
    };
    mockSearch = jest.fn().mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: 'eq' } },
    });

    const mockWorkflowsService = {
      getWorkflowsExecutionEngine: jest.fn().mockImplementation(async () => ({
        triggerEvents: {
          isEnabled: mockTriggerEventsIsEnabled,
          searchTriggerEventLog: mockSearchTriggerEventLog,
        },
      })),
      getCoreStart: jest.fn().mockResolvedValue({
        elasticsearch: {
          client: {
            asInternalUser: {
              search: mockSearch,
            },
          },
        },
      }),
    };

    const createVersionedRoute = (method: string, path: string) => ({
      addVersion: jest.fn().mockImplementation((_config: unknown, handler: MockRouteHandler) => {
        routeHandlers[`${method}:${path}`] = { handler };
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
      },
    };

    const logger: Logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    } as unknown as Logger;

    const routeDependencies: RouteDependencies = {
      router: mockRouter,
      api: mockApi,
      workflowsService: mockWorkflowsService,
      logger,
      spaces: { getSpaceId: jest.fn().mockReturnValue('default') },
      audit: mockAudit,
    } as unknown as RouteDependencies;

    registerInternalRoutes(routeDependencies);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createExecutionReadRequest = (
    requestOptions?: Parameters<typeof httpServerMock.createKibanaRequest>[0],
    authzResult: Record<string, boolean> = {
      [WorkflowsManagementApiActions.readExecution]: true,
      [WorkflowsManagementApiActions.readManagedExecution]: false,
    }
  ) => {
    const request = httpServerMock.createKibanaRequest(requestOptions);
    (request as any).authzResult = authzResult;
    return request;
  };

  it('should register the config route handler', () => {
    expect(routeHandlers[`GET:/internal/workflows/config`]).toBeDefined();
    expect(routeHandlers[`GET:/internal/workflows/config`].handler).toEqual(expect.any(Function));
  });

  it('should return eventDrivenExecutionEnabled true when engine returns true', async () => {
    mockTriggerEventsIsEnabled = true;

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest();

    await routeHandlers[`GET:/internal/workflows/config`].handler(mockContext, request, response);

    expect(response.ok).toHaveBeenCalledWith({
      body: { eventDrivenExecutionEnabled: true },
    });
  });

  it('should return eventDrivenExecutionEnabled false when engine returns false', async () => {
    mockTriggerEventsIsEnabled = false;

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest();

    await routeHandlers[`GET:/internal/workflows/config`].handler(mockContext, request, response);

    expect(response.ok).toHaveBeenCalledWith({
      body: { eventDrivenExecutionEnabled: false },
    });
  });

  it('should register the disable route handler', () => {
    expect(routeHandlers[`POST:/internal/workflows/disable`]).toBeDefined();
    expect(routeHandlers[`POST:/internal/workflows/disable`].handler).toEqual(expect.any(Function));
  });

  it('should register the executions options list route handler', () => {
    expect(routeHandlers[`POST:/internal/workflows/executions/options_list`]).toBeDefined();
    expect(routeHandlers[`POST:/internal/workflows/executions/options_list`].handler).toEqual(
      expect.any(Function)
    );
  });

  it('should register the executions fields route handler', () => {
    expect(routeHandlers[`GET:/internal/workflows/executions/fields`]).toBeDefined();
    expect(routeHandlers[`GET:/internal/workflows/executions/fields`].handler).toEqual(
      expect.any(Function)
    );
  });

  it('should register the executions search route handler', () => {
    expect(routeHandlers[`GET:/internal/workflows/executions`]).toBeDefined();
    expect(routeHandlers[`GET:/internal/workflows/executions`].handler).toEqual(
      expect.any(Function)
    );
  });

  it('should filter execution fields to unmanaged executions by default', async () => {
    const getFieldsForWildcard = jest
      .spyOn(IndexPatternsFetcher.prototype, 'getFieldsForWildcard')
      .mockResolvedValue({ fields: [], indices: [] });
    const response = httpServerMock.createResponseFactory();
    const request = createExecutionReadRequest();

    await routeHandlers[`GET:/internal/workflows/executions/fields`].handler(
      mockContext,
      request,
      response
    );

    expect(getFieldsForWildcard).toHaveBeenCalledWith(
      expect.objectContaining({
        pattern: WORKFLOWS_EXECUTIONS_INDEX,
        indexFilter: { bool: { must_not: [{ term: { managed: true } }] } },
      })
    );
  });

  it('should not filter execution fields when the user can read managed executions', async () => {
    const getFieldsForWildcard = jest
      .spyOn(IndexPatternsFetcher.prototype, 'getFieldsForWildcard')
      .mockResolvedValue({ fields: [], indices: [] });
    const response = httpServerMock.createResponseFactory();
    const request = createExecutionReadRequest(
      {},
      {
        [WorkflowsManagementApiActions.readExecution]: true,
        [WorkflowsManagementApiActions.readManagedExecution]: true,
      }
    );

    await routeHandlers[`GET:/internal/workflows/executions/fields`].handler(
      mockContext,
      request,
      response
    );

    expect(getFieldsForWildcard).toHaveBeenCalledWith(
      expect.not.objectContaining({ indexFilter: expect.anything() })
    );
  });

  it('should call api.searchExecutionsView with parsed query params and space id', async () => {
    mockApi.searchExecutionsView.mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: 'eq' } },
    });

    const response = httpServerMock.createResponseFactory();
    const request = createExecutionReadRequest({
      query: {
        query: JSON.stringify({ term: { workflowId: 'wf-1' } }),
        from: 25,
        size: 25,
        sort: JSON.stringify([{ startedAt: { order: 'desc' } }]),
        trackTotalHits: true,
      },
    });

    await routeHandlers[`GET:/internal/workflows/executions`].handler(
      mockContext,
      request,
      response
    );

    expect(mockApi.searchExecutionsView).toHaveBeenCalledWith(
      {
        query: { term: { workflowId: 'wf-1' } },
        from: 25,
        size: 25,
        sort: [{ startedAt: { order: 'desc' } }],
        trackTotalHits: true,
        includeManagedExecutions: false,
      },
      'default'
    );
    expect(response.ok).toHaveBeenCalledWith({
      body: { hits: { hits: [], total: { value: 0, relation: 'eq' } } },
    });
  });

  it('should return bad request for invalid JSON query params', async () => {
    const response = httpServerMock.createResponseFactory();
    const request = createExecutionReadRequest({
      query: {
        query: '{invalid-json',
      },
    });

    await routeHandlers[`GET:/internal/workflows/executions`].handler(
      mockContext,
      request,
      response
    );

    expect(response.badRequest).toHaveBeenCalledWith({
      body: { message: 'Invalid JSON in query' },
    });
    expect(mockApi.searchExecutionsView).not.toHaveBeenCalled();
  });

  it('should include managed execution results when the user has managed execution read', async () => {
    mockApi.searchExecutionsView.mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: 'eq' } },
    });

    const response = httpServerMock.createResponseFactory();
    const request = createExecutionReadRequest(
      {},
      {
        [WorkflowsManagementApiActions.readExecution]: true,
        [WorkflowsManagementApiActions.readManagedExecution]: true,
      }
    );

    await routeHandlers[`GET:/internal/workflows/executions`].handler(
      mockContext,
      request,
      response
    );

    expect(mockApi.searchExecutionsView).toHaveBeenCalledWith(
      expect.objectContaining({ includeManagedExecutions: true }),
      'default'
    );
  });

  it('should register trigger event log search routes', () => {
    expect(routeHandlers[`POST:/internal/workflows/trigger_events/_search`]).toBeDefined();
  });

  it('should register the workflow history route handler', () => {
    expect(routeHandlers[`GET:/internal/workflows/workflow/{id}/history`]).toBeDefined();
  });

  it('should register the workflow restore route handler', () => {
    expect(
      routeHandlers[`POST:/internal/workflows/workflow/{id}/history/{eventId}/restore`]
    ).toBeDefined();
  });

  it('should call api.getHistoryForWorkflow with page/per_page defaults', async () => {
    const history = { page: 1, perPage: 20, total: 1, items: [{ id: 'event-1' }] };
    mockApi.getHistoryForWorkflow.mockResolvedValue(history);

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({ params: { id: 'wf-1' } });

    await routeHandlers[`GET:/internal/workflows/workflow/{id}/history`].handler(
      mockContext,
      request,
      response
    );

    expect(mockApi.getHistoryForWorkflow).toHaveBeenCalledWith('wf-1', 'default', {
      page: 1,
      perPage: 20,
    });
    expect(response.ok).toHaveBeenCalledWith({ body: history });
  });

  it('should pass through page and per_page query params', async () => {
    mockApi.getHistoryForWorkflow.mockResolvedValue({ page: 2, perPage: 5, total: 0, items: [] });

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      params: { id: 'wf-1' },
      query: { page: 2, per_page: 5 },
    });

    await routeHandlers[`GET:/internal/workflows/workflow/{id}/history`].handler(
      mockContext,
      request,
      response
    );

    expect(mockApi.getHistoryForWorkflow).toHaveBeenCalledWith('wf-1', 'default', {
      page: 2,
      perPage: 5,
    });
  });

  it('should call api.restoreWorkflowVersion and return the restored workflow', async () => {
    const restored = {
      id: 'wf-1',
      version: 8,
      lastUpdatedAt: '2026-01-02T00:00:00.000Z',
      lastUpdatedBy: 'alice',
      enabled: true,
      valid: true,
      validationErrors: [],
    };
    mockApi.restoreWorkflowVersion.mockResolvedValue(restored);

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      params: { id: 'wf-1', eventId: 'event-v3' },
    });

    await routeHandlers[`POST:/internal/workflows/workflow/{id}/history/{eventId}/restore`].handler(
      mockContext,
      request,
      response
    );

    expect(mockApi.restoreWorkflowVersion).toHaveBeenCalledWith(
      'wf-1',
      'event-v3',
      'default',
      request
    );
    expect(response.ok).toHaveBeenCalledWith({ body: restored });
    expect(mockAudit.logWorkflowRestored).toHaveBeenCalledWith(request, {
      id: 'wf-1',
      eventId: 'event-v3',
      version: 8,
    });
    expect(mockAudit.logWorkflowUpdated).not.toHaveBeenCalled();
  });

  it('returns not found when the history event does not exist', async () => {
    mockApi.restoreWorkflowVersion.mockRejectedValue(
      new WorkflowHistoryEventNotFoundError('wf-1', 'missing-event')
    );

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      params: { id: 'wf-1', eventId: 'missing-event' },
    });

    await routeHandlers[`POST:/internal/workflows/workflow/{id}/history/{eventId}/restore`].handler(
      mockContext,
      request,
      response
    );

    expect(response.notFound).toHaveBeenCalledWith({
      body: {
        message: "Change history event 'missing-event' not found for workflow 'wf-1'.",
      },
    });
    expect(mockAudit.logWorkflowRestored).toHaveBeenCalledWith(request, {
      id: 'wf-1',
      eventId: 'missing-event',
      error: expect.any(WorkflowHistoryEventNotFoundError),
    });
  });

  it('returns forbidden when restoring a managed workflow', async () => {
    mockApi.restoreWorkflowVersion.mockRejectedValue(new ManagedWorkflowUpdateForbiddenError());

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      params: { id: 'managed-wf', eventId: 'event-v3' },
    });

    await routeHandlers[`POST:/internal/workflows/workflow/{id}/history/{eventId}/restore`].handler(
      mockContext,
      request,
      response
    );

    expect(response.forbidden).toHaveBeenCalledWith({
      body: {
        message: 'Managed workflows cannot be edited. You can only enable or disable them.',
      },
    });
  });

  it('returns conflict when restore hits an OCC write conflict', async () => {
    mockApi.restoreWorkflowVersion.mockRejectedValue(
      new WorkflowConflictError('Workflow was updated by another user.', 'wf-1')
    );

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      params: { id: 'wf-1', eventId: 'event-v3' },
    });

    await routeHandlers[`POST:/internal/workflows/workflow/{id}/history/{eventId}/restore`].handler(
      mockContext,
      request,
      response
    );

    expect(response.conflict).toHaveBeenCalledWith({
      body: {
        error: 'Conflict',
        message: 'Workflow was updated by another user.',
        statusCode: 409,
        workflowId: 'wf-1',
      },
    });
  });

  it('returns not found when the workflow does not exist', async () => {
    mockApi.restoreWorkflowVersion.mockRejectedValue(new WorkflowNotFoundError('missing'));

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      params: { id: 'missing', eventId: 'event-v3' },
    });

    await routeHandlers[`POST:/internal/workflows/workflow/{id}/history/{eventId}/restore`].handler(
      mockContext,
      request,
      response
    );

    expect(response.notFound).toHaveBeenCalledWith({
      body: {
        message: 'Workflow with id "missing" not found.',
      },
    });
  });

  it('forwards trigger event log search params to the execution engine', async () => {
    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      body: { kql: 'triggerId : x', page: 2, size: 25 },
    });

    await routeHandlers[`POST:/internal/workflows/trigger_events/_search`].handler(
      mockContext,
      request,
      response
    );

    expect(mockSearchTriggerEventLog).toHaveBeenCalledWith({
      spaceId: 'default',
      kql: 'triggerId : x',
      from: undefined,
      to: undefined,
      page: 2,
      size: 25,
    });
    expect(response.ok).toHaveBeenCalledWith({
      body: { hits: [], total: 0, page: 1, size: 10 },
    });
  });

  it('forwards payload.* KQL to the execution engine unchanged', async () => {
    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
      body: { kql: 'payload.workflow.status : failed', page: 1, size: 10 },
    });

    await routeHandlers[`POST:/internal/workflows/trigger_events/_search`].handler(
      mockContext,
      request,
      response
    );

    expect(mockSearchTriggerEventLog).toHaveBeenCalledWith({
      spaceId: 'default',
      kql: 'payload.workflow.status : failed',
      from: undefined,
      to: undefined,
      page: 1,
      size: 10,
    });
  });

  it('returns 400 when trigger event log search throws KQLSyntaxError', async () => {
    const kqlError = new KQLSyntaxError(
      {
        message: 'Expected',
        expected: null,
        found: '',
        location: { start: { offset: 0 } },
      } as ConstructorParameters<typeof KQLSyntaxError>[0],
      'bad:'
    );
    mockSearchTriggerEventLog.mockRejectedValueOnce(kqlError);

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({ body: {} });

    await routeHandlers[`POST:/internal/workflows/trigger_events/_search`].handler(
      mockContext,
      request,
      response
    );

    expect(response.badRequest).toHaveBeenCalledWith({
      body: { message: kqlError.shortMessage },
    });
  });

  it('should call api.disableAllWorkflows scoped to the request space', async () => {
    mockApi.disableAllWorkflows.mockResolvedValue({ total: 3, disabled: 3, failures: [] });

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest();

    await routeHandlers[`POST:/internal/workflows/disable`].handler(mockContext, request, response);

    expect(mockApi.disableAllWorkflows).toHaveBeenCalledWith('default');
    expect(response.ok).toHaveBeenCalledWith({
      body: { total: 3, disabled: 3, failures: [] },
    });
  });

  it('should execute options list search with enforced space and step filters', async () => {
    mockSearch.mockResolvedValue({
      aggregations: {
        suggestions: {
          buckets: [{ key: 'completed', doc_count: 4 }],
        },
        totalCardinality: { value: 1 },
        validation: {
          buckets: {
            completed: { doc_count: 4 },
          },
        },
      },
    });

    const response = httpServerMock.createResponseFactory();
    const request = createExecutionReadRequest({
      method: 'post',
      path: '/internal/workflows/executions/options_list',
      body: {
        size: 10,
        fieldName: 'status',
        filters: [{ term: { workflowId: 'wf-1' } }],
        selectedOptions: ['completed'],
      },
    });

    await routeHandlers[`POST:/internal/workflows/executions/options_list`].handler(
      mockContext,
      request,
      response
    );

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        index: WORKFLOWS_EXECUTIONS_INDEX,
        query: {
          bool: {
            filter: expect.arrayContaining([
              { term: { workflowId: 'wf-1' } },
              {
                bool: {
                  should: [
                    { term: { spaceId: 'default' } },
                    { bool: { must_not: { exists: { field: 'spaceId' } } } },
                  ],
                  minimum_should_match: 1,
                },
              },
              { bool: { must_not: { exists: { field: 'stepId' } } } },
              { bool: { must_not: [{ term: { managed: true } }] } },
            ]),
          },
        },
      })
    );

    expect(response.ok).toHaveBeenCalledWith({
      body: {
        suggestions: [{ value: 'completed', docCount: 4 }],
        totalCardinality: 1,
        invalidSelections: [],
      },
    });
  });

  it('should not exclude managed executions from options list when the user can read them', async () => {
    mockSearch.mockResolvedValue({
      aggregations: {
        suggestions: { buckets: [] },
        totalCardinality: { value: 0 },
        validation: { buckets: {} },
      },
    });

    const response = httpServerMock.createResponseFactory();
    const request = createExecutionReadRequest(
      {
        method: 'post',
        path: '/internal/workflows/executions/options_list',
        body: {
          size: 10,
          fieldName: 'status',
          filters: [],
          selectedOptions: [],
        },
      },
      {
        [WorkflowsManagementApiActions.readExecution]: true,
        [WorkflowsManagementApiActions.readManagedExecution]: true,
      }
    );

    await routeHandlers[`POST:/internal/workflows/executions/options_list`].handler(
      mockContext,
      request,
      response
    );

    const filter = mockSearch.mock.calls[0][0].query.bool.filter;
    expect(filter).not.toEqual(
      expect.arrayContaining([{ bool: { must_not: [{ term: { managed: true } }] } }])
    );
  });
});
