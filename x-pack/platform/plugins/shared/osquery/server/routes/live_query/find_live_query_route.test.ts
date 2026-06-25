/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { RequestHandler } from '@kbn/core/server';
import { API_VERSIONS, OSQUERY_INTEGRATION_NAME } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { findLiveQueryRoute } from './find_live_query_route';
import { getResultCountsForActions } from '../../lib/get_result_counts_for_actions';

jest.mock('../../lib/get_result_counts_for_actions', () => ({
  getResultCountsForActions: jest.fn(),
}));

jest.mock('../../utils/ccs_utils', () => ({
  hasConnectedRemoteClusters: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../utils/get_internal_saved_object_client', () => ({
  createInternalSavedObjectsClientForSpaceId: jest.fn().mockResolvedValue({}),
}));

describe('findLiveQueryRoute', () => {
  let routeHandler: RequestHandler;
  let mockOsqueryContext: OsqueryAppContext;

  const createMockRouter = () => {
    const httpService = httpServiceMock.createSetupContract();

    return httpService.createRouter();
  };

  const createMockContext = (mockSearchFn: jest.Mock) => {
    const mockCoreContext = coreMock.createRequestHandlerContext();

    return {
      core: Promise.resolve(mockCoreContext),
      search: Promise.resolve({
        search: mockSearchFn,
        saveSession: jest.fn(),
        getSession: jest.fn(),
        findSessions: jest.fn(),
        updateSession: jest.fn(),
        cancelSession: jest.fn(),
        deleteSession: jest.fn(),
      }),
    };
  };

  const createRouteContext = (mockSearchFn: jest.Mock): Parameters<RequestHandler>[0] =>
    createMockContext(mockSearchFn) as unknown as Parameters<RequestHandler>[0];

  const mockEsClient = { search: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();

    mockOsqueryContext = {
      service: {
        getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
      },
      getStartServices: jest
        .fn()
        .mockResolvedValue([{ elasticsearch: { client: { asInternalUser: mockEsClient } } }]),
    } as unknown as OsqueryAppContext;
  });

  const setupRoute = () => {
    const mockRouter = createMockRouter();
    findLiveQueryRoute(mockRouter, mockOsqueryContext);

    const route = mockRouter.versioned.getRoute('get', '/api/osquery/live_queries');
    const routeVersion = route.versions[API_VERSIONS.public.v1];
    if (!routeVersion) {
      throw new Error(`Handler for version [${API_VERSIONS.public.v1}] not found!`);
    }

    routeHandler = routeVersion.handler;
  };

  it('returns items without result_counts when withResultCounts is not set', async () => {
    const edges = [
      {
        _source: {
          action_id: 'action-1',
          queries: [{ action_id: 'query-1', query: 'select 1;', agents: ['agent-1'] }],
        },
        fields: { action_id: ['action-1'] },
      },
    ];

    const mockSearchFn = jest.fn().mockReturnValue(
      of({
        edges,
        rawResponse: { hits: { total: 1 } },
        total: 1,
      })
    );

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      query: { kuery: undefined, page: 0, pageSize: 20 },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler(createRouteContext(mockSearchFn), mockRequest, mockResponse);

    expect(getResultCountsForActions).not.toHaveBeenCalled();
    expect(mockResponse.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          data: expect.objectContaining({
            items: edges,
          }),
        }),
      })
    );
  });

  it('enriches single query items with result_counts when withResultCounts is true', async () => {
    const edges = [
      {
        _source: {
          action_id: 'action-1',
          queries: [{ action_id: 'query-1', query: 'select 1;', agents: ['agent-1'] }],
        },
        fields: { action_id: ['action-1'] },
      },
    ];

    const mockSearchFn = jest.fn().mockReturnValue(
      of({
        edges,
        rawResponse: { hits: { total: 1 } },
        total: 1,
      })
    );

    (getResultCountsForActions as jest.Mock).mockResolvedValue(
      new Map([
        ['query-1', { totalRows: 42, respondedAgents: 3, successfulAgents: 2, errorAgents: 1 }],
      ])
    );

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      query: { kuery: undefined, page: 0, pageSize: 20, withResultCounts: true },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler(createRouteContext(mockSearchFn), mockRequest, mockResponse);

    expect(getResultCountsForActions).toHaveBeenCalledWith(
      mockEsClient,
      ['query-1'],
      'default',
      ['default'],
      false
    );

    const responseBody = mockResponse.ok.mock.calls[0][0]?.body as {
      data: { items: Array<{ _source: Record<string, unknown> }> };
    };
    expect(responseBody.data.items[0]._source).toEqual(
      expect.objectContaining({
        result_counts: {
          total_rows: 42,
          responded_agents: 3,
          successful_agents: 2,
          error_agents: 1,
        },
      })
    );
  });

  it('enriches pack items with aggregated result_counts', async () => {
    const edges = [
      {
        _source: {
          action_id: 'action-1',
          pack_id: 'pack-1',
          queries: [
            { action_id: 'query-1', query: 'select 1;', agents: ['agent-1'] },
            { action_id: 'query-2', query: 'select 2;', agents: ['agent-1'] },
            { action_id: 'query-3', query: 'select 3;', agents: ['agent-1'] },
          ],
        },
        fields: { action_id: ['action-1'] },
      },
    ];

    const mockSearchFn = jest.fn().mockReturnValue(
      of({
        edges,
        rawResponse: { hits: { total: 1 } },
        total: 1,
      })
    );

    (getResultCountsForActions as jest.Mock).mockResolvedValue(
      new Map([
        ['query-1', { totalRows: 10, respondedAgents: 1, successfulAgents: 1, errorAgents: 0 }],
        ['query-2', { totalRows: 0, respondedAgents: 1, successfulAgents: 0, errorAgents: 1 }],
        ['query-3', { totalRows: 5, respondedAgents: 1, successfulAgents: 1, errorAgents: 0 }],
      ])
    );

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      query: { kuery: undefined, page: 0, pageSize: 20, withResultCounts: true },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler(createRouteContext(mockSearchFn), mockRequest, mockResponse);

    const responseBody = mockResponse.ok.mock.calls[0][0]?.body as {
      data: { items: Array<{ _source: Record<string, unknown> }> };
    };
    expect(responseBody.data.items[0]._source).toEqual(
      expect.objectContaining({
        result_counts: {
          total_rows: 15,
          queries_with_results: 2,
          queries_total: 3,
          successful_agents: 1,
          error_agents: 0,
        },
      })
    );
  });

  it('returns items without enrichment when result counts aggregation fails', async () => {
    const edges = [
      {
        _source: {
          action_id: 'action-1',
          queries: [{ action_id: 'query-1', query: 'select 1;', agents: ['agent-1'] }],
        },
        fields: { action_id: ['action-1'] },
      },
    ];

    const mockSearchFn = jest.fn().mockReturnValue(
      of({
        edges,
        rawResponse: { hits: { total: 1 } },
        total: 1,
      })
    );

    (getResultCountsForActions as jest.Mock).mockRejectedValue(
      new Error('index_not_found_exception')
    );

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      query: { kuery: undefined, page: 0, pageSize: 20, withResultCounts: true },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler(createRouteContext(mockSearchFn), mockRequest, mockResponse);

    expect(mockResponse.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          data: expect.objectContaining({
            items: edges,
          }),
        }),
      })
    );
  });

  it('falls back to the active space id when integration namespaces are unavailable', async () => {
    (mockOsqueryContext.service.getActiveSpace as jest.Mock).mockResolvedValue({
      id: 'custom-space',
    });

    const edges = [
      {
        _source: {
          action_id: 'action-1',
          queries: [{ action_id: 'query-1', query: 'select 1;', agents: ['agent-1'] }],
        },
        fields: { action_id: ['action-1'] },
      },
    ];

    const mockSearchFn = jest.fn().mockReturnValue(
      of({
        edges,
        rawResponse: { hits: { total: 1 } },
        total: 1,
      })
    );

    (getResultCountsForActions as jest.Mock).mockResolvedValue(
      new Map([
        ['query-1', { totalRows: 5, respondedAgents: 1, successfulAgents: 1, errorAgents: 0 }],
      ])
    );

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      query: { kuery: undefined, page: 0, pageSize: 20, withResultCounts: true },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler(createRouteContext(mockSearchFn), mockRequest, mockResponse);

    expect(getResultCountsForActions).toHaveBeenCalledWith(
      mockEsClient,
      ['query-1'],
      'custom-space',
      ['custom-space'],
      false
    );
  });

  it('uses integration namespaces for result counts instead of the active space id', async () => {
    const service = mockOsqueryContext.service as unknown as {
      getActiveSpace: jest.Mock;
      getIntegrationNamespaces?: jest.Mock;
    };
    service.getActiveSpace.mockResolvedValue({
      id: 'production',
    });
    service.getIntegrationNamespaces = jest.fn().mockResolvedValue({
      [OSQUERY_INTEGRATION_NAME]: ['prod'],
    });
    mockOsqueryContext.logFactory = {
      get: jest.fn().mockReturnValue({ debug: jest.fn() }),
    } as unknown as OsqueryAppContext['logFactory'];

    const edges = [
      {
        _source: {
          action_id: 'action-1',
          queries: [{ action_id: 'query-1', query: 'select 1;', agents: ['agent-1'] }],
        },
        fields: { action_id: ['action-1'] },
      },
    ];

    const mockSearchFn = jest.fn().mockReturnValue(
      of({
        edges,
        rawResponse: { hits: { total: 1 } },
        total: 1,
      })
    );

    (getResultCountsForActions as jest.Mock).mockResolvedValue(
      new Map([
        ['query-1', { totalRows: 5, respondedAgents: 1, successfulAgents: 1, errorAgents: 0 }],
      ])
    );

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      query: { kuery: undefined, page: 0, pageSize: 20, withResultCounts: true },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler(createRouteContext(mockSearchFn), mockRequest, mockResponse);

    expect(getResultCountsForActions).toHaveBeenCalledWith(
      mockEsClient,
      ['query-1'],
      'production',
      ['prod'],
      false
    );
  });

  it('handles items without queries gracefully', async () => {
    const edges = [
      {
        _source: { action_id: 'action-1' },
        fields: { action_id: ['action-1'] },
      },
    ];

    const mockSearchFn = jest.fn().mockReturnValue(
      of({
        edges,
        rawResponse: { hits: { total: 1 } },
        total: 1,
      })
    );

    (getResultCountsForActions as jest.Mock).mockResolvedValue(new Map());

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      query: { kuery: undefined, page: 0, pageSize: 20, withResultCounts: true },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler(createRouteContext(mockSearchFn), mockRequest, mockResponse);

    const responseBody = mockResponse.ok.mock.calls[0][0]?.body as {
      data: { items: Array<{ _source: Record<string, unknown> }> };
    };
    expect(responseBody.data.items[0]._source).toEqual({ action_id: 'action-1' });
  });
});
