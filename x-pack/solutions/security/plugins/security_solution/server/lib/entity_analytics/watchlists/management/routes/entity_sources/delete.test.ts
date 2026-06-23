/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { WATCHLISTS_DATA_SOURCE_URL } from '../../../../../../../common/constants';
import {
  serverMock,
  requestContextMock,
  requestMock,
} from '../../../../../detection_engine/routes/__mocks__';

const mockRemoveEntitySourceReference = jest.fn();
jest.mock('../../watchlist_config', () => ({
  WatchlistConfigClient: jest.fn().mockImplementation(() => ({
    removeEntitySourceReference: mockRemoveEntitySourceReference,
  })),
}));

jest.mock('../../../entity_sources/infra/entity_source_client');

const { mockGetEntitySource, mockDeleteEntitySource } = jest.requireMock(
  '../../../entity_sources/infra/entity_source_client'
) as {
  mockGetEntitySource: jest.Mock;
  mockDeleteEntitySource: jest.Mock;
};

const mockGetStartServices = jest.fn();

import { deleteEntitySourceRoute } from './delete';

const WATCHLIST_ID = 'wl-1';
const SOURCE_ID = 'src-1';
const DATA_SOURCE_URL = WATCHLISTS_DATA_SOURCE_URL.replace('{watchlist_id}', WATCHLIST_ID);

describe('DELETE entity source route - deleteEntitySourceRoute', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: ReturnType<typeof requestContextMock.convertContext>;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    const { context: ctx } = requestContextMock.createTools();
    context = requestContextMock.convertContext(ctx);

    mockGetEntitySource.mockReset();
    mockDeleteEntitySource.mockReset();
    mockRemoveEntitySourceReference.mockReset().mockResolvedValue(undefined);

    const mockSecurity = { authc: { apiKeys: { invalidateAsInternalUser: jest.fn() } } };
    mockGetStartServices.mockResolvedValue([{ security: mockSecurity }]);

    deleteEntitySourceRoute(server.router, logger, mockGetStartServices, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildRequest = (id = SOURCE_ID) =>
    requestMock.create({
      method: 'delete',
      path: `${DATA_SOURCE_URL}/${id}`,
      params: { watchlist_id: WATCHLIST_ID, id },
    });

  it('deletes an index-type source', async () => {
    mockGetEntitySource.mockResolvedValue({
      id: SOURCE_ID,
      type: 'index',
      apiKeyId: 'kid-1',
    });

    const response = await server.inject(buildRequest(), context);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ acknowledged: true });
    expect(mockDeleteEntitySource).toHaveBeenCalledWith(SOURCE_ID);
  });

  it('deletes a non-index source', async () => {
    mockGetEntitySource.mockResolvedValue({
      id: SOURCE_ID,
      type: 'store',
    });

    const response = await server.inject(buildRequest(), context);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ acknowledged: true });
    expect(mockDeleteEntitySource).toHaveBeenCalledWith(SOURCE_ID);
  });
});
