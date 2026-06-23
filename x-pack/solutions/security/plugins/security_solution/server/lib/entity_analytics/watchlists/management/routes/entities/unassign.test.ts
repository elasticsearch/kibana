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
const { mockUnassign } = jest.requireMock('../../../entity_sources/manual/service');

import { unassignWatchlistEntitiesRoute } from './unassign';

describe('POST /api/entity_analytics/watchlists/{watchlist_id}/entities/unassign - unassignWatchlistEntitiesRoute', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: ReturnType<typeof requestContextMock.convertContext>;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    const { context: ctx } = requestContextMock.createTools();
    context = requestContextMock.convertContext(ctx);

    mockWatchlistGet.mockReset();
    mockUnassign.mockReset();

    unassignWatchlistEntitiesRoute(server.router, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildRequest = (watchlistId: string, body: object = {}) =>
    requestMock.create({
      method: 'post',
      path: `${WATCHLISTS_URL}/${watchlistId}/entities/unassign`,
      params: { watchlist_id: watchlistId },
      body,
    });

  it('unassigns entities and returns 200', async () => {
    mockWatchlistGet.mockResolvedValue({ name: 'test-watchlist', id: 'wl-1' });
    const unassignResult = {
      successful: 1,
      failed: 0,
      not_found: 0,
      total: 1,
      items: [{ euid: 'user:test', status: 'success' }],
    };
    mockUnassign.mockResolvedValue(unassignResult);

    const request = buildRequest('wl-1', { euids: ['user:test'] });
    const response = await server.inject(request, context);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual(unassignResult);
    expect(mockWatchlistGet).toHaveBeenCalledWith('wl-1');
    expect(mockUnassign).toHaveBeenCalledWith(['user:test']);
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
      expect.stringContaining('Error during entity unassignment: Error: watchlist not found')
    );
  });
});
