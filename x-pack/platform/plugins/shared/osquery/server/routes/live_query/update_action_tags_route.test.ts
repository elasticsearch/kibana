/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { RequestHandler } from '@kbn/core/server';
import { API_VERSIONS, ACTION_RESPONSES_DATA_STREAM_INDEX } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { updateActionTagsRoute } from './update_action_tags_route';

describe('updateActionTagsRoute', () => {
  let routeHandler: RequestHandler;
  let mockOsqueryContext: OsqueryAppContext;
  let mockEsClient: { search: jest.Mock; update: jest.Mock; indices: { exists: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();

    mockEsClient = {
      search: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
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
    updateActionTagsRoute(mockRouter as never, mockOsqueryContext);

    const route = mockRouter.versioned.getRoute('put', '/api/osquery/history/{id}/tags');
    const routeVersion = route.versions[API_VERSIONS.public.v1];
    if (!routeVersion) {
      throw new Error(`Handler for version [${API_VERSIONS.public.v1}] not found!`);
    }

    routeHandler = routeVersion.handler;
  };

  const callRoute = async (id: string, spaceId?: string) => {
    if (spaceId) {
      (mockOsqueryContext.service.getActiveSpace as jest.Mock).mockResolvedValue({ id: spaceId });
    }

    setupRoute();

    const mockRequest = httpServerMock.createKibanaRequest({
      params: { id },
      body: { tags: ['my-tag'] },
    });
    const mockResponse = httpServerMock.createResponseFactory();

    await routeHandler({} as never, mockRequest, mockResponse);

    return mockResponse;
  };

  it('scopes the primary action lookup to the active (default) space', async () => {
    mockEsClient.search.mockResolvedValue({ hits: { hits: [{ _index: 'idx', _id: 'doc-1' }] } });

    await callRoute('action-1');

    const primarySearch = mockEsClient.search.mock.calls[0][0];
    expect(primarySearch.query.bool.filter).toContainEqual({
      bool: {
        should: [
          { term: { space_id: 'default' } },
          { bool: { must_not: { exists: { field: 'space_id' } } } },
        ],
      },
    });
  });

  it('scopes the primary action lookup to a named space with an exact term', async () => {
    mockEsClient.search.mockResolvedValue({ hits: { hits: [{ _index: 'idx', _id: 'doc-1' }] } });

    await callRoute('action-1', 'my-space');

    const primarySearch = mockEsClient.search.mock.calls[0][0];
    expect(primarySearch.query.bool.filter).toContainEqual({ term: { space_id: 'my-space' } });
  });

  describe('scheduled-results existence check', () => {
    it('scopes the scheduled-results check to the active space', async () => {
      // No live/rule action found -> route falls through to the scheduled check.
      mockEsClient.search
        .mockResolvedValueOnce({ hits: { hits: [] } }) // primary lookup: miss
        .mockResolvedValueOnce({ hits: { total: { value: 0 } } }); // scheduled check

      await callRoute('schedule-1', 'my-space');

      const scheduledSearch = mockEsClient.search.mock.calls[1][0];
      expect(scheduledSearch.index).toBe(`${ACTION_RESPONSES_DATA_STREAM_INDEX}-*`);
      expect(scheduledSearch.query.bool.filter).toContainEqual({
        term: { schedule_id: 'schedule-1' },
      });
      // The scheduled check is space-scoped along with the rest of the lookups.
      expect(scheduledSearch.query.bool.filter).toContainEqual({ term: { space_id: 'my-space' } });
    });

    it('returns 404 when the schedule does not exist in the active space', async () => {
      // Primary lookup misses, and because the scheduled check is space-scoped,
      // a schedule_id from another space yields 0 hits here -> 404.
      mockEsClient.search
        .mockResolvedValueOnce({ hits: { hits: [] } }) // primary lookup: miss
        .mockResolvedValueOnce({ hits: { total: { value: 0 } } }); // scoped scheduled check: miss

      const response = await callRoute('other-space-schedule', 'default');

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: 'Action other-space-schedule not found' },
      });
      expect(response.badRequest).not.toHaveBeenCalled();
    });

    it('returns 400 when the schedule genuinely exists in the active space', async () => {
      mockEsClient.search
        .mockResolvedValueOnce({ hits: { hits: [] } }) // primary lookup: miss
        .mockResolvedValueOnce({ hits: { total: { value: 1 } } }); // scoped scheduled check: hit

      const response = await callRoute('in-space-schedule', 'default');

      expect(response.badRequest).toHaveBeenCalledWith({
        body: {
          message:
            'Tags are not supported for scheduled query results. Tags can only be added to live queries and queries from rules.',
        },
      });
    });
  });

  it('updates tags when a matching in-space action is found', async () => {
    mockEsClient.search.mockResolvedValue({
      hits: { hits: [{ _index: '.fleet-actions', _id: 'doc-1' }] },
    });

    const response = await callRoute('action-1');

    expect(mockEsClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ index: '.fleet-actions', id: 'doc-1', doc: { tags: ['my-tag'] } })
    );
    expect(response.ok).toHaveBeenCalledWith({ body: { data: { tags: ['my-tag'] } } });
  });
});
