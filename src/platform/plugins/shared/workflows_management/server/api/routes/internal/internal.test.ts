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
import { KQLSyntaxError } from '@kbn/es-query';
import type { SearchTriggerEventLogResult } from '@kbn/workflows-ui';
import { registerInternalRoutes } from '.';
import { WORKFLOWS_EXECUTIONS_INDEX } from '../../../../common';
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
      service: mockWorkflowsService,
      logger,
      spaces: { getSpaceId: jest.fn().mockReturnValue('default') },
      audit: { logWorkflowAccessed: jest.fn() },
    } as unknown as RouteDependencies;

    registerInternalRoutes(routeDependencies);
  });

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

  it('should call api.searchExecutionsView with parsed query params and space id', async () => {
    mockApi.searchExecutionsView.mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: 'eq' } },
    });

    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
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
      },
      'default'
    );
    expect(response.ok).toHaveBeenCalledWith({
      body: { hits: { hits: [], total: { value: 0, relation: 'eq' } } },
    });
  });

  it('should return bad request for invalid JSON query params', async () => {
    const response = httpServerMock.createResponseFactory();
    const request = httpServerMock.createKibanaRequest({
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

  it('should register trigger event log search routes', () => {
    expect(routeHandlers[`POST:/internal/workflows/trigger_events/_search`]).toBeDefined();
  });

  it('should register the workflow history route handler', () => {
    expect(routeHandlers[`GET:/internal/workflows/workflow/{id}/history`]).toBeDefined();
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
    const request = httpServerMock.createKibanaRequest({
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
});
