/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { WATCHLISTS_URL } from '../../../../../../../common/entity_analytics/watchlists/constants';
import {
  serverMock,
  requestContextMock,
  requestMock,
} from '../../../../../detection_engine/routes/__mocks__';

jest.mock('../../watchlist_config');
jest.mock('../../../entity_sources/manual/service');
jest.mock('@kbn/entity-store/server/domain/crud', () => ({
  CRUDClient: jest.fn(),
}));

const { mockWatchlistGet } = jest.requireMock('../../watchlist_config');
const { mockAssign } = jest.requireMock('../../../entity_sources/manual/service');

import { assignWatchlistEntitiesRoute } from './assign';

describe('POST /api/entity_analytics/watchlists/{watchlist_id}/entities/assign - assignWatchlistEntitiesRoute', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: ReturnType<typeof requestContextMock.convertContext>;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    const { context: ctx } = requestContextMock.createTools();
    context = requestContextMock.convertContext(ctx);

    mockWatchlistGet.mockReset();
    mockAssign.mockReset();

    assignWatchlistEntitiesRoute(server.router, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildRequest = (watchlistId: string, body: object = {}) =>
    requestMock.create({
      method: 'post',
      path: `${WATCHLISTS_URL}/${watchlistId}/entities/assign`,
      params: { watchlist_id: watchlistId },
      body,
    });

  it('assigns entities and returns 200', async () => {
    mockWatchlistGet.mockResolvedValue({ name: 'test-watchlist', id: 'wl-1' });
    const assignResult = {
      successful: 1,
      failed: 0,
      not_found: 0,
      total: 1,
      items: [{ euid: 'user:test', status: 'success' }],
    };
    mockAssign.mockResolvedValue(assignResult);

    const request = buildRequest('wl-1', { euids: ['user:test'] });
    const response = await server.inject(request, context);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual(assignResult);
    expect(mockWatchlistGet).toHaveBeenCalledWith('wl-1');
    expect(mockAssign).toHaveBeenCalledWith(['user:test']);
  });

  it('returns an error response when watchlist get fails', async () => {
    mockWatchlistGet.mockRejectedValue(new Error('watchlist not found'));

    const request = buildRequest('wl-1', { euids: ['user:test'] });
    const response = await server.inject(request, context);

    expect(response.status).toEqual(500);
    expect(response.body).toEqual({
      message: 'watchlist not found',
      status_code: 500,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error during entity assignment: Error: watchlist not found')
    );
  });
});
