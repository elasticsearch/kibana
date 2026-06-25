/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { RequestHandler } from '@kbn/core/server';
import { API_VERSIONS } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { getHistoryTagsRoute } from './get_history_tags_route';

describe('getHistoryTagsRoute', () => {
  let routeHandler: RequestHandler;
  let mockOsqueryContext: OsqueryAppContext;
  let mockEsClient: { search: jest.Mock; indices: { exists: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEsClient = {
      search: jest.fn(),
      indices: { exists: jest.fn().mockResolvedValue(true) },
    };

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
    const httpService = httpServiceMock.createSetupContract();
    const mockRouter = httpService.createRouter();
    getHistoryTagsRoute(mockRouter, mockOsqueryContext);

    const route = mockRouter.versioned.getRoute('get', '/internal/osquery/history/tags');
    const routeVersion = route.versions[API_VERSIONS.internal.v1];
    if (!routeVersion) {
      throw new Error(`Handler for version [${API_VERSIONS.internal.v1}] not found!`);
    }

    routeHandler = routeVersion.handler;
  };

  it('returns unique tags from aggregation', async () => {
    mockEsClient.search.mockResolvedValue({
      aggregations: {
        unique_tags: {
          buckets: [
            { key: 'prod', doc_count: 5 },
            { key: 'staging', doc_count: 3 },
          ],
        },
      },
    });

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({ query: {} });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler({} as any, mockRequest, mockResponse);

    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: { data: ['prod', 'staging'] },
    });
  });

  it('returns empty array when no aggregation results', async () => {
    mockEsClient.search.mockResolvedValue({ aggregations: {} });

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({ query: {} });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler({} as any, mockRequest, mockResponse);

    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: { data: [] },
    });
  });

  it('applies the space_id filter for the default space', async () => {
    mockEsClient.search.mockResolvedValue({ aggregations: { unique_tags: { buckets: [] } } });

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({ query: {} });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler({} as any, mockRequest, mockResponse);

    const searchCall = mockEsClient.search.mock.calls[0][0];
    const spaceFilter = searchCall.query.bool.filter[0];

    expect(spaceFilter).toEqual({
      bool: {
        should: [
          { term: { space_id: 'default' } },
          { bool: { must_not: { exists: { field: 'space_id' } } } },
        ],
      },
    });
  });

  it('applies the space_id filter for a named space', async () => {
    (mockOsqueryContext.service.getActiveSpace as jest.Mock).mockResolvedValue({
      id: 'my-space',
    });

    mockEsClient.search.mockResolvedValue({ aggregations: { unique_tags: { buckets: [] } } });

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({ query: {} });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler({} as any, mockRequest, mockResponse);

    const searchCall = mockEsClient.search.mock.calls[0][0];
    const spaceFilter = searchCall.query.bool.filter[0];

    expect(spaceFilter).toEqual({ term: { space_id: 'my-space' } });
  });

  it('returns error when ES search fails', async () => {
    mockEsClient.search.mockRejectedValue(
      Object.assign(new Error('index_not_found_exception'), { statusCode: 404 })
    );

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({ query: {} });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler({} as any, mockRequest, mockResponse);

    expect(mockResponse.customError).toHaveBeenCalledWith({
      statusCode: 404,
      body: { message: 'Failed to fetch history tags' },
    });
  });
});
