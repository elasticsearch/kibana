/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { WATCHLISTS_URL } from '../../../../../../common/entity_analytics/watchlists/constants';
import {
  serverMock,
  requestContextMock,
  requestMock,
} from '../../../../detection_engine/routes/__mocks__';

const mockWatchlistDelete = jest.fn();
const mockGetEntitySourceIds = jest.fn();
jest.mock('../watchlist_config', () => ({
  WatchlistConfigClient: jest.fn().mockImplementation(() => ({
    delete: mockWatchlistDelete,
    getEntitySourceIds: mockGetEntitySourceIds,
  })),
}));

jest.mock('../../entity_sources/entity_sources_service', () => ({
  createEntitySourcesService: jest.fn().mockImplementation(() => ({
    deleteWatchlistEntities: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockGetStartServices = jest.fn();

import { deleteWatchlistRoute } from './delete';

const WATCHLIST_ID = 'wl-1';

describe('DELETE /api/entity_analytics/watchlists/{id} - deleteWatchlistRoute', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: ReturnType<typeof requestContextMock.convertContext>;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    const { context: ctx } = requestContextMock.createTools();
    context = requestContextMock.convertContext(ctx);

    mockWatchlistDelete.mockReset().mockResolvedValue(undefined);
    mockGetEntitySourceIds.mockReset().mockResolvedValue([]);

    const mockSecurity = { authc: { apiKeys: { invalidateAsInternalUser: jest.fn() } } };
    mockGetStartServices.mockResolvedValue([{ security: mockSecurity }]);

    deleteWatchlistRoute(server.router, logger, mockGetStartServices, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildRequest = (id = WATCHLIST_ID) =>
    requestMock.create({
      method: 'delete',
      path: `${WATCHLISTS_URL}/${id}`,
      params: { id },
    });

  it('deletes the watchlist and returns acknowledged', async () => {
    mockGetEntitySourceIds.mockResolvedValue(['src-1', 'src-2', 'src-3']);

    const response = await server.inject(buildRequest(), context);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ deleted: true });
    expect(mockWatchlistDelete).toHaveBeenCalledWith(WATCHLIST_ID);
  });

  it('returns an error when the underlying delete fails', async () => {
    mockGetEntitySourceIds.mockResolvedValue([]);
    const errorMessage = 'delete failed';
    mockWatchlistDelete.mockRejectedValue(new Error(errorMessage));

    const response = await server.inject(buildRequest(), context);

    expect(response.status).toEqual(500);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
  });
});
