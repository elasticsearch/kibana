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

const mockWatchlistClientCreate = jest.fn();
const mockAddEntitySourceReference = jest.fn();
const mockSyncWatchlist = jest.fn();
const mockGetStartServices = jest.fn();

jest.mock('../../watchlist_config', () => ({
  WatchlistConfigClient: jest.fn().mockImplementation(() => ({
    addEntitySourceReference: mockAddEntitySourceReference,
  })),
}));

jest.mock('../../../entity_sources/infra', () => ({
  ...jest.requireActual('../../../entity_sources/infra'),
  WatchlistEntitySourceClient: jest.fn(),
}));

jest.mock('../../../entity_sources/entity_sources_service', () => ({
  createEntitySourcesService: jest.fn(),
}));

const { WatchlistEntitySourceClient: MockWatchlistEntitySourceClient } = jest.requireMock(
  '../../../entity_sources/infra'
) as { WatchlistEntitySourceClient: jest.Mock };

const { createEntitySourcesService: mockCreateEntitySourcesService } = jest.requireMock(
  '../../../entity_sources/entity_sources_service'
) as { createEntitySourcesService: jest.Mock };

// Import after mocks are set up
import { createEntitySourceRoute } from './create';

const WATCHLIST_ID = 'wl-1';
const DATA_SOURCE_URL = WATCHLISTS_DATA_SOURCE_URL.replace('{watchlist_id}', WATCHLIST_ID);

describe('POST /api/entity_analytics/watchlists/:watchlist_id/data_sources - createEntitySourceRoute', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: ReturnType<typeof requestContextMock.convertContext>;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    const { context: ctx } = requestContextMock.createTools();
    context = requestContextMock.convertContext(ctx);

    mockWatchlistClientCreate.mockReset();
    mockAddEntitySourceReference.mockReset();
    mockSyncWatchlist.mockReset();

    const mockSecurity = { authc: { apiKeys: { grantAsInternalUser: jest.fn() } } };
    mockGetStartServices.mockResolvedValue([{ security: mockSecurity }]);

    MockWatchlistEntitySourceClient.mockImplementation(() => ({
      create: mockWatchlistClientCreate,
    }));

    mockCreateEntitySourcesService.mockReturnValue({ syncWatchlist: mockSyncWatchlist });

    createEntitySourceRoute(server.router, logger, mockGetStartServices, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildRequest = (body: object) =>
    requestMock.create({
      method: 'post',
      path: DATA_SOURCE_URL,
      params: { watchlist_id: WATCHLIST_ID },
      body,
    });

  describe('index-type source', () => {
    const indexSourceBody = {
      type: 'index' as const,
      name: 'my-index-source',
      indexPattern: 'logs-*',
      enabled: true,
    };

    it('does not link source to watchlist when client.create fails', async () => {
      mockWatchlistClientCreate.mockRejectedValue(new Error('Insufficient index privileges'));

      await server.inject(buildRequest(indexSourceBody), context);

      expect(mockAddEntitySourceReference).not.toHaveBeenCalled();
    });

    it('creates the source when client.create resolves', async () => {
      const createdSource = { id: 'es-1', ...indexSourceBody };
      mockWatchlistClientCreate.mockResolvedValue(createdSource);

      const response = await server.inject(buildRequest(indexSourceBody), context);

      expect(response.status).toEqual(200);
      expect(mockWatchlistClientCreate).toHaveBeenCalledWith(indexSourceBody, expect.anything());
    });
  });

  describe('entity source creation', () => {
    it('creates an entity source and links it to watchlist', async () => {
      const sourceResult = {
        id: 'es-1',
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      };

      mockWatchlistClientCreate.mockResolvedValue(sourceResult);
      mockAddEntitySourceReference.mockResolvedValue(undefined);
      mockSyncWatchlist.mockResolvedValue(undefined);

      const request = buildRequest({
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(response.body).toEqual(sourceResult);
      expect(mockWatchlistClientCreate).toHaveBeenCalledWith(
        {
          type: 'index',
          name: 'test-source',
          indexPattern: 'logs-*',
          enabled: true,
        },
        expect.anything()
      );
      expect(mockAddEntitySourceReference).toHaveBeenCalledWith(WATCHLIST_ID, 'es-1');
    });

    it('triggers background sync after linking entity source', async () => {
      const sourceResult = {
        id: 'es-1',
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      };

      mockWatchlistClientCreate.mockResolvedValue(sourceResult);
      mockAddEntitySourceReference.mockResolvedValue(undefined);
      mockSyncWatchlist.mockResolvedValue(undefined);

      const request = buildRequest({
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(mockSyncWatchlist).toHaveBeenCalledWith(WATCHLIST_ID);
    });

    it('logs warning when background sync fails', async () => {
      const sourceResult = {
        id: 'es-1',
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      };

      mockWatchlistClientCreate.mockResolvedValue(sourceResult);
      mockAddEntitySourceReference.mockResolvedValue(undefined);
      mockSyncWatchlist.mockRejectedValue(new Error('sync error'));

      const request = buildRequest({
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(mockSyncWatchlist).toHaveBeenCalledWith(WATCHLIST_ID);
    });

    it('still returns 200 when sync fails', async () => {
      const sourceResult = {
        id: 'es-1',
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      };

      mockWatchlistClientCreate.mockResolvedValue(sourceResult);
      mockAddEntitySourceReference.mockResolvedValue(undefined);
      mockSyncWatchlist.mockRejectedValue(new Error('sync error'));

      const request = buildRequest({
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(response.body).toEqual(sourceResult);
    });
  });

  describe('error handling', () => {
    it('returns error when entity source creation fails', async () => {
      mockWatchlistClientCreate.mockRejectedValue(new Error('source creation failed'));

      const request = buildRequest({
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'source creation failed',
        status_code: 500,
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creating watchlist entity source sync config')
      );
    });

    it('returns error when linking source fails', async () => {
      const sourceResult = {
        id: 'es-1',
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      };

      mockWatchlistClientCreate.mockResolvedValue(sourceResult);
      mockAddEntitySourceReference.mockRejectedValue(new Error('linking failed'));

      const request = buildRequest({
        type: 'index',
        name: 'test-source',
        indexPattern: 'logs-*',
        enabled: true,
      });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'linking failed',
        status_code: 500,
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error creating watchlist entity source sync config')
      );
    });
  });
});
