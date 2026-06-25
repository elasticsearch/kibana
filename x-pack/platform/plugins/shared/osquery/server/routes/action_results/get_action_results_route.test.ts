/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import type { RequestHandler } from '@kbn/core/server';
import type { DataRequestHandlerContext } from '@kbn/data-plugin/server';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { getActionResultsRoute } from './get_action_results_route';
import {
  Direction,
  OsqueryQueries,
  type ActionResultsStrategyResponse,
} from '../../../common/search_strategy';
import type {
  GetActionResultsRequestParamsSchema,
  GetActionResultsRequestQuerySchema,
} from '../../../common/api/action_results/get_action_results_route';
import {
  createMockOsqueryContext,
  createMockRouter,
  createMockContext,
  createMockRequest,
  createMockSearchStrategy,
  createMockActionResultsResponse,
} from './mocks';

describe('getActionResultsRoute', () => {
  let mockOsqueryContext: OsqueryAppContext;
  let mockRouter: ReturnType<typeof createMockRouter>;
  let routeHandler: RequestHandler<
    GetActionResultsRequestParamsSchema,
    GetActionResultsRequestQuerySchema,
    unknown,
    DataRequestHandlerContext
  >;

  const expectedSearchOptions = {
    abortSignal: expect.any(AbortSignal),
    strategy: 'osquerySearchStrategy',
  };

  beforeEach(() => {
    mockOsqueryContext = createMockOsqueryContext();
    mockRouter = createMockRouter();

    getActionResultsRoute(mockRouter, mockOsqueryContext);

    const route = mockRouter.versioned.getRoute('get', '/api/osquery/action_results/{actionId}');
    const routeVersion = route.versions['2023-10-31'];
    if (!routeVersion) {
      throw new Error('Handler for version [2023-10-31] not found!');
    }

    routeHandler = routeVersion.handler;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route handler behavior', () => {
    it('should accept agentIds in query parameter', async () => {
      const mockSearchFn = createMockSearchStrategy(
        createMockActionResultsResponse(3, {
          totalResponded: 3,
          successCount: 3,
          errorCount: 0,
        })
      );

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1,agent-2,agent-3',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      // Verify NO action details call
      expect(mockSearchFn).not.toHaveBeenCalledWith(
        expect.objectContaining({
          factoryQueryType: OsqueryQueries.actionDetails,
        }),
        expect.anything()
      );

      // Verify action results called with provided agents
      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: 'test-action-id',
          factoryQueryType: OsqueryQueries.actionResults,
          agentIds: ['agent-1', 'agent-2', 'agent-3'],
        }),
        expectedSearchOptions
      );

      expect(mockResponse.ok).toHaveBeenCalled();
    });

    it('should handle empty agentIds parameter', async () => {
      const mockSearchFn = createMockSearchStrategy(
        createMockActionResultsResponse(0, {
          totalResponded: 0,
          totalRowCount: 0,
          successCount: 0,
          errorCount: 0,
        })
      );

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      // Should call with empty array
      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          agentIds: [],
        }),
        expectedSearchOptions
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          total: 0,
          edges: [],
          aggregations: {
            totalRowCount: 0,
            totalResponded: 0,
            successful: 0,
            failed: 0,
            pending: 0,
          },
        }),
      });
    });

    it('should handle single agent ID in agentIds parameter', async () => {
      const mockSearchFn = createMockSearchStrategy(createMockActionResultsResponse(1));

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          agentIds: ['agent-1'],
        }),
        expectedSearchOptions
      );
    });

    it('should trim whitespace from comma-separated agent IDs', async () => {
      const mockSearchFn = createMockSearchStrategy(createMockActionResultsResponse(3));

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: ' agent-1 , agent-2 , agent-3 ',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          agentIds: ['agent-1', 'agent-2', 'agent-3'],
        }),
        expectedSearchOptions
      );
    });

    it('should combine agentIds with user-provided kuery correctly', async () => {
      const userKuery = 'error.message: *timeout*';
      const mockSearchFn = createMockSearchStrategy(createMockActionResultsResponse(2));

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1,agent-2',
          kuery: userKuery,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      const actionResultsCall = mockSearchFn.mock.calls.find(
        (call) => call[0].factoryQueryType === OsqueryQueries.actionResults
      );

      expect(actionResultsCall).toBeDefined();
      expect(actionResultsCall![0]).toMatchObject({
        agentIds: ['agent-1', 'agent-2'],
        kuery: userKuery,
      });
    });

    it('should return only real ES responses (placeholders generated client-side)', async () => {
      const mockActionResults = createMockActionResultsResponse(2, {
        totalResponded: 2,
        successCount: 2,
        errorCount: 0,
      });

      mockActionResults.edges[0].fields = { agent_id: ['agent-0'] };
      mockActionResults.edges[1].fields = { agent_id: ['agent-1'] };

      const mockSearchFn = createMockSearchStrategy(mockActionResults);
      const mockContext = createMockContext(mockSearchFn);

      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-0,agent-1,agent-2,agent-3,agent-4',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      const responseBody = (mockResponse.ok as jest.Mock).mock.calls[0][0].body;

      // Server returns ONLY real ES responses (2 agents responded)
      expect(responseBody.edges).toHaveLength(2);

      // Verify NO placeholders in server response (client-side responsibility)
      const placeholderCount = responseBody.edges.filter((edge: any) =>
        edge._id.startsWith('placeholder-')
      ).length;

      expect(placeholderCount).toBe(0);

      // Verify aggregations show pending agents (for client to generate placeholders)
      expect(responseBody.aggregations.pending).toBe(3);
    });

    it('should calculate aggregations correctly', async () => {
      const mockSearchFn = createMockSearchStrategy(
        createMockActionResultsResponse(3, {
          totalResponded: 3,
          totalRowCount: 150,
          successCount: 2,
          errorCount: 1,
        })
      );

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1,agent-2,agent-3,agent-4,agent-5',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          aggregations: {
            totalRowCount: 150,
            totalResponded: 3,
            successful: 2,
            failed: 1,
            pending: 2, // 5 agents - 3 responded = 2 pending
          },
        }),
      });
    });

    it('should handle pagination parameters correctly', async () => {
      const mockSearchFn = createMockSearchStrategy(createMockActionResultsResponse(1));

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1',
          page: 2,
          pageSize: 50,
          sort: 'agent.id',
          sortOrder: Direction.asc,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            activePage: 0,
            querySize: 1,
          }),
          sort: {
            direction: Direction.asc,
            field: 'agent.id',
          },
        }),
        expectedSearchOptions
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          currentPage: 2,
          pageSize: 50,
          totalPages: 1,
        }),
      });
    });

    it('should use default pagination values when not provided', async () => {
      const mockSearchFn = createMockSearchStrategy(createMockActionResultsResponse(1));

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            activePage: 0,
            querySize: 1,
          }),
          sort: {
            direction: Direction.desc,
            field: '@timestamp',
          },
        }),
        expectedSearchOptions
      );
    });

    it('should return only real ES responses for current page (placeholders generated client-side)', async () => {
      const totalAgents = 1000;
      const allAgentIds = Array.from({ length: totalAgents }, (_, i) => `agent-${i}`);

      // Page 2, pageSize 20: agents 40-59
      const page = 2;
      const pageSize = 20;
      const startIndex = page * pageSize;
      const currentPageAgentIds = allAgentIds.slice(startIndex, startIndex + pageSize);

      const respondedAgentIds = ['agent-40', 'agent-42', 'agent-45', 'agent-50', 'agent-55'];
      const mockActionResults = createMockActionResultsResponse(respondedAgentIds, {
        totalResponded: 5,
        totalRowCount: 0,
        successCount: 5,
        errorCount: 0,
      });

      const mockSearchFn = createMockSearchStrategy(mockActionResults);
      const mockContext = createMockContext(mockSearchFn);

      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: currentPageAgentIds.join(','),
          page,
          pageSize,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      const responseBody = (mockResponse.ok as jest.Mock).mock.calls[0][0].body;

      expect(responseBody.edges).toHaveLength(5);

      const placeholderCount = responseBody.edges.filter((edge: any) =>
        edge._id.startsWith('placeholder-')
      ).length;
      expect(placeholderCount).toBe(0);

      const realResponses = responseBody.edges.filter(
        (edge: any) => !edge._id.startsWith('placeholder-')
      );
      expect(realResponses).toHaveLength(5);

      expect(responseBody.aggregations).toEqual({
        totalRowCount: 0,
        totalResponded: 5,
        successful: 5,
        failed: 0,
        pending: 15,
      });

      expect(responseBody.totalPages).toBe(Math.ceil(currentPageAgentIds.length / pageSize));
    });

    it('should handle page 1 with large agent set efficiently (no server-side placeholders)', async () => {
      const totalAgents = 100;
      const allAgentIds = Array.from({ length: totalAgents }, (_, i) => `agent-${i}`);

      const page = 1;
      const pageSize = 20;
      const startIndex = page * pageSize; // 20
      const currentPageAgentIds = allAgentIds.slice(startIndex, startIndex + pageSize); // agent-20 to agent-39

      const respondedAgentIds = currentPageAgentIds.slice(0, 10); // agent-20 to agent-29

      const mockActionResults = createMockActionResultsResponse(respondedAgentIds, {
        totalResponded: 10,
        totalRowCount: 0,
        successCount: 10,
        errorCount: 0,
      });

      const mockSearchFn = createMockSearchStrategy(mockActionResults);
      const mockContext = createMockContext(mockSearchFn);

      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: currentPageAgentIds.join(','),
          page,
          pageSize,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      const responseBody = (mockResponse.ok as jest.Mock).mock.calls[0][0].body;

      expect(responseBody.edges).toHaveLength(10);

      const placeholderCount = responseBody.edges.filter((edge: any) =>
        edge._id.startsWith('placeholder-')
      ).length;
      expect(placeholderCount).toBe(0);

      expect(responseBody.aggregations.pending).toBe(10);
    });

    it('should handle empty page (all agents responded) without creating placeholders', async () => {
      const totalAgents = 50;
      const allAgentIds = Array.from({ length: totalAgents }, (_, i) => `agent-${i}`);

      const page = 0;
      const pageSize = 20;
      const currentPageAgentIds = allAgentIds.slice(0, pageSize);

      const mockActionResults = createMockActionResultsResponse(currentPageAgentIds, {
        totalResponded: 20,
        totalRowCount: 0,
        successCount: 20,
        errorCount: 0,
      });

      const mockSearchFn = createMockSearchStrategy(mockActionResults);
      const mockContext = createMockContext(mockSearchFn);

      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: currentPageAgentIds.join(','),
          page,
          pageSize,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      const responseBody = (mockResponse.ok as jest.Mock).mock.calls[0][0].body;

      expect(responseBody.edges).toHaveLength(20);

      const placeholders = responseBody.edges.filter((edge: any) =>
        edge._id.startsWith('placeholder-')
      );
      expect(placeholders).toHaveLength(0);

      expect(responseBody.edges.every((edge: any) => !edge._id.startsWith('placeholder-'))).toBe(
        true
      );
    });
  });

  describe('Edge cases', () => {
    it('should return totalPages 0 when pageSize is 0 (prevent Infinity)', async () => {
      const mockSearchFn = createMockSearchStrategy(
        createMockActionResultsResponse(2, {
          totalResponded: 2,
          successCount: 2,
          errorCount: 0,
        })
      );

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1,agent-2',
          pageSize: 0,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      const responseBody = (mockResponse.ok as jest.Mock).mock.calls[0][0].body;

      expect(responseBody.totalPages).toBe(0);
      expect(Number.isFinite(responseBody.totalPages)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 error when search strategy throws error', async () => {
      const errorMessage = 'Elasticsearch connection failed';
      const mockSearchFn = jest.fn().mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: { message: errorMessage },
      });
    });

    it('should handle missing aggregations in action results response', async () => {
      const mockSearchFn = createMockSearchStrategy({
        edges: [],
        total: 0,
        rawResponse: {},
        inspect: { dsl: [] },
      } as unknown as ActionResultsStrategyResponse);

      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({
        actionId: 'test-action-id',
        query: {
          agentIds: 'agent-1',
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          aggregations: {
            totalRowCount: 0,
            totalResponded: 0,
            successful: 0,
            failed: 0,
            pending: 1, // 1 agent - 0 responded = 1 pending
          },
        }),
      });
    });
  });

  describe('space scoping', () => {
    it('passes the active default space to the search strategy', async () => {
      const mockSearchFn = createMockSearchStrategy(createMockActionResultsResponse(1));
      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({ actionId: 'test-action-id', query: {} });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(mockContext, mockRequest, mockResponse);

      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'default' }),
        expectedSearchOptions
      );
    });

    it('passes a named active space to the search strategy', async () => {
      // Re-register the route against a context whose active space is named.
      const namedSpaceContext = createMockOsqueryContext();
      (namedSpaceContext.service.getActiveSpace as jest.Mock).mockResolvedValue({
        id: 'my-space',
        name: 'My Space',
      });
      const namedRouter = createMockRouter();
      getActionResultsRoute(namedRouter, namedSpaceContext);
      const namedHandler = namedRouter.versioned.getRoute(
        'get',
        '/api/osquery/action_results/{actionId}'
      ).versions['2023-10-31']!.handler;

      const mockSearchFn = createMockSearchStrategy(createMockActionResultsResponse(1));
      const mockContext = createMockContext(mockSearchFn);
      const mockRequest = createMockRequest({ actionId: 'test-action-id', query: {} });
      const mockResponse = httpServerMock.createResponseFactory();

      await namedHandler(mockContext, mockRequest, mockResponse);

      expect(namedSpaceContext.service.getActiveSpace).toHaveBeenCalled();
      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'my-space' }),
        expectedSearchOptions
      );
    });
  });
});
