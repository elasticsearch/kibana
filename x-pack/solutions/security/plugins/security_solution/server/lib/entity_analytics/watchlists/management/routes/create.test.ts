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
import { WATCHLIST_API_CALL_EVENT } from '../../../../telemetry/event_based/events';
import { createMockTelemetryEventsSender } from '../../../../telemetry/__mocks__';
import type { ITelemetryEventsSender } from '../../../../telemetry/sender';

const mockWatchlistCreate = jest.fn();
const mockWatchlistDelete = jest.fn();
const mockAddEntitySourceReference = jest.fn();
const mockSyncWatchlist = jest.fn();

jest.mock('../watchlist_config', () => ({
  WatchlistConfigClient: jest.fn().mockImplementation(() => ({
    create: mockWatchlistCreate,
    delete: mockWatchlistDelete,
    addEntitySourceReference: mockAddEntitySourceReference,
  })),
}));

jest.mock('../../entity_sources/infra/entity_source_client');
jest.mock('../../entity_sources/entity_sources_service', () => ({
  createEntitySourcesService: jest.fn(() => ({
    syncWatchlist: mockSyncWatchlist,
  })),
}));

const mockValidateIndexPermissions = jest.fn();

jest.mock('../../entity_sources/entity_source_api_key', () => ({
  validateIndexPermissions: (...args: unknown[]) => mockValidateIndexPermissions(...args),
}));

const { mockCreateEntitySource } = jest.requireMock(
  '../../entity_sources/infra/entity_source_client'
) as {
  mockCreateEntitySource: jest.Mock;
};

const mockGetStartServices = jest.fn();

// Import after mocks are set up
import { createWatchlistRoute } from './create';

describe('POST /api/entity_analytics/watchlists - createWatchlistRoute', () => {
  let server: ReturnType<typeof serverMock.create>;
  let context: ReturnType<typeof requestContextMock.convertContext>;
  let logger: ReturnType<typeof loggerMock.create>;
  let telemetrySenderMock: ITelemetryEventsSender;
  let reportEBT: jest.Mock;

  beforeEach(() => {
    server = serverMock.create();
    logger = loggerMock.create();
    const { context: ctx } = requestContextMock.createTools();
    context = requestContextMock.convertContext(ctx);

    mockWatchlistCreate.mockReset();
    mockWatchlistDelete.mockReset();
    mockAddEntitySourceReference.mockReset();
    mockCreateEntitySource.mockReset();
    mockSyncWatchlist.mockReset();
    mockValidateIndexPermissions.mockReset().mockResolvedValue(undefined);

    const mockSecurity = { authc: { apiKeys: { grantAsInternalUser: jest.fn() } } };
    mockGetStartServices.mockResolvedValue([{ security: mockSecurity }]);

    reportEBT = jest.fn();
    telemetrySenderMock = {
      ...createMockTelemetryEventsSender(),
      reportEBT,
    } as unknown as ITelemetryEventsSender;

    createWatchlistRoute(server.router, logger, telemetrySenderMock, mockGetStartServices, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const buildRequest = (body: object = {}) =>
    requestMock.create({
      method: 'post',
      path: WATCHLISTS_URL,
      body: {
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
        ...body,
      },
    });

  describe('without entitySources', () => {
    it('creates a watchlist and returns 200', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };
      mockWatchlistCreate.mockResolvedValue(watchlistResult);

      const request = buildRequest();
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(response.body).toEqual(watchlistResult);
      expect(mockWatchlistCreate).toHaveBeenCalledWith({
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      });
      expect(mockCreateEntitySource).not.toHaveBeenCalled();
      expect(mockAddEntitySourceReference).not.toHaveBeenCalled();
      expect(reportEBT).toHaveBeenCalledTimes(1);
      expect(reportEBT).toHaveBeenCalledWith(
        WATCHLIST_API_CALL_EVENT,
        expect.objectContaining({
          endpoint: WATCHLISTS_URL,
          watchlist_id: 'wl-1',
          watchlist_name: 'custom watchlist',
          risk_modifier: 10,
          is_managed: false,
          entity_source_count: 0,
        })
      );
    });
  });

  describe('with entitySources', () => {
    const entitySourceInputA = {
      type: 'index' as const,
      name: 'my-source-a',
      indexPattern: 'logs-*',
      enabled: true,
    };

    const entitySourceInputB = {
      type: 'index' as const,
      name: 'my-source-b',
      indexPattern: 'metrics-*',
      enabled: true,
    };

    it('creates the watchlist and entity sources, then links them', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };
      const entitySourceResultA = { id: 'es-1', ...entitySourceInputA };
      const entitySourceResultB = { id: 'es-2', ...entitySourceInputB };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);
      mockCreateEntitySource
        .mockResolvedValueOnce(entitySourceResultA)
        .mockResolvedValueOnce(entitySourceResultB);
      mockAddEntitySourceReference.mockResolvedValue(undefined);

      const request = buildRequest({
        entitySources: [entitySourceInputA, entitySourceInputB],
      });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        ...watchlistResult,
        entitySources: [entitySourceResultA, entitySourceResultB],
      });
      expect(mockWatchlistCreate).toHaveBeenCalledWith({
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      });
      expect(mockCreateEntitySource).toHaveBeenCalledTimes(2);
      expect(mockCreateEntitySource).toHaveBeenCalledWith(entitySourceInputA, expect.anything());
      expect(mockCreateEntitySource).toHaveBeenCalledWith(entitySourceInputB, expect.anything());
      expect(mockAddEntitySourceReference).toHaveBeenCalledTimes(2);
      expect(mockAddEntitySourceReference).toHaveBeenCalledWith('wl-1', 'es-1');
      expect(mockAddEntitySourceReference).toHaveBeenCalledWith('wl-1', 'es-2');
      expect(reportEBT).toHaveBeenCalledTimes(1);
      expect(reportEBT).toHaveBeenCalledWith(
        WATCHLIST_API_CALL_EVENT,
        expect.objectContaining({
          endpoint: WATCHLISTS_URL,
          watchlist_id: 'wl-1',
          watchlist_name: 'custom watchlist',
          risk_modifier: 10,
          is_managed: false,
          entity_source_count: 2,
          entity_source_types: ['index', 'index'],
        })
      );
    });

    it('creates the watchlist and a single entity source', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };
      const entitySourceResult = { id: 'es-1', ...entitySourceInputA };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);
      mockCreateEntitySource.mockResolvedValue(entitySourceResult);
      mockAddEntitySourceReference.mockResolvedValue(undefined);

      const request = buildRequest({ entitySources: [entitySourceInputA] });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        ...watchlistResult,
        entitySources: [entitySourceResult],
      });
      expect(mockCreateEntitySource).toHaveBeenCalledTimes(1);
      expect(mockCreateEntitySource).toHaveBeenCalledWith(entitySourceInputA, expect.anything());
      expect(mockAddEntitySourceReference).toHaveBeenCalledWith('wl-1', 'es-1');
      expect(reportEBT).toHaveBeenCalledTimes(1);
      expect(reportEBT).toHaveBeenCalledWith(
        WATCHLIST_API_CALL_EVENT,
        expect.objectContaining({
          watchlist_id: 'wl-1',
          entity_source_count: 1,
          entity_source_types: ['index'],
        })
      );
    });

    it('rolls back the watchlist when entity source creation fails', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);
      mockCreateEntitySource.mockRejectedValue(new Error('source creation failed'));
      mockWatchlistDelete.mockResolvedValue(undefined);

      const request = buildRequest({ entitySources: [entitySourceInputA] });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(500);
      expect(mockWatchlistDelete).toHaveBeenCalledWith('wl-1');
      expect(logger.error).toHaveBeenCalledWith(
        'Entity source creation failed, rolling back watchlist wl-1'
      );
      expect(reportEBT).toHaveBeenCalledWith(
        WATCHLIST_API_CALL_EVENT,
        expect.objectContaining({ error: 'source creation failed' })
      );
    });

    it('rolls back the watchlist when addEntitySourceReference fails', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };
      const entitySourceResult = { id: 'es-1', ...entitySourceInputA };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);
      mockCreateEntitySource.mockResolvedValue(entitySourceResult);
      mockAddEntitySourceReference.mockRejectedValue(new Error('linking failed'));
      mockWatchlistDelete.mockResolvedValue(undefined);

      const request = buildRequest({ entitySources: [entitySourceInputA] });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(500);
      expect(mockWatchlistDelete).toHaveBeenCalledWith('wl-1');
      expect(reportEBT).toHaveBeenCalledWith(
        WATCHLIST_API_CALL_EVENT,
        expect.objectContaining({ error: 'linking failed' })
      );
    });

    it('throws when watchlist creation returns no id', async () => {
      const watchlistResult = {
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);

      const request = buildRequest({ entitySources: [entitySourceInputA] });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'Watchlist creation succeeded but no ID was returned',
        status_code: 500,
      });
      expect(mockCreateEntitySource).not.toHaveBeenCalled();
      expect(reportEBT).toHaveBeenCalledWith(
        WATCHLIST_API_CALL_EVENT,
        expect.objectContaining({
          error: 'Watchlist creation succeeded but no ID was returned',
        })
      );
    });

    it('triggers background sync when entity sources are created', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };
      const entitySourceResult = { id: 'es-1', ...entitySourceInputA };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);
      mockCreateEntitySource.mockResolvedValue(entitySourceResult);
      mockAddEntitySourceReference.mockResolvedValue(undefined);
      mockSyncWatchlist.mockResolvedValue(undefined);

      const request = buildRequest({ entitySources: [entitySourceInputA] });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(mockSyncWatchlist).toHaveBeenCalledWith('wl-1');
    });

    it('logs warning when background sync fails', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };
      const entitySourceResult = { id: 'es-1', ...entitySourceInputA };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);
      mockCreateEntitySource.mockResolvedValue(entitySourceResult);
      mockAddEntitySourceReference.mockResolvedValue(undefined);
      mockSyncWatchlist.mockRejectedValue(new Error('sync failed'));

      const request = buildRequest({ entitySources: [entitySourceInputA] });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(mockSyncWatchlist).toHaveBeenCalledWith('wl-1');
    });

    it('does not trigger sync when no entity sources created', async () => {
      const watchlistResult = {
        id: 'wl-1',
        name: 'test-watchlist',
        description: 'A test watchlist',
        riskModifier: 10,
      };

      mockWatchlistCreate.mockResolvedValue(watchlistResult);

      const request = buildRequest();
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(mockSyncWatchlist).not.toHaveBeenCalled();
    });

    it('does not create watchlist when index permission validation fails', async () => {
      mockValidateIndexPermissions.mockRejectedValue(new Error('Insufficient index privileges'));

      const request = buildRequest({ entitySources: [entitySourceInputA] });
      await server.inject(request, context);

      expect(mockWatchlistCreate).not.toHaveBeenCalled();
      expect(mockCreateEntitySource).not.toHaveBeenCalled();
    });

    it('does not validate index permissions for a non-index source', async () => {
      const nonIndexSource = { type: 'store' as const, name: 'store-source', enabled: true };
      const watchlistResult = { id: 'wl-1', name: 'test-watchlist', riskModifier: 10 };
      const entitySourceResult = { id: 'es-2', ...nonIndexSource };
      mockWatchlistCreate.mockResolvedValue(watchlistResult);
      mockCreateEntitySource.mockResolvedValue(entitySourceResult);

      const request = buildRequest({ entitySources: [nonIndexSource] });
      const response = await server.inject(request, context);

      expect(response.status).toEqual(200);
      expect(mockValidateIndexPermissions).not.toHaveBeenCalled();
    });
  });
  describe('error handling', () => {
    it('returns an error response when watchlist creation fails', async () => {
      mockWatchlistCreate.mockRejectedValue(new Error('something went wrong'));

      const request = buildRequest();
      const response = await server.inject(request, context);

      expect(response.status).toEqual(500);
      expect(response.body).toEqual({
        message: 'something went wrong',
        status_code: 500,
      });
      expect(logger.error).toHaveBeenCalledWith('Failed to create watchlist: something went wrong');
      expect(reportEBT).toHaveBeenCalledWith(
        WATCHLIST_API_CALL_EVENT,
        expect.objectContaining({ error: 'something went wrong' })
      );
    });
  });
});
