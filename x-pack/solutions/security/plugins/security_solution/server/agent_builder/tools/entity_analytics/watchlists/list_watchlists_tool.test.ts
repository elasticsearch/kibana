/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, type ErrorResult, type OtherResult } from '@kbn/agent-builder-common';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import {
  createToolAvailabilityContext,
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../../__mocks__/test_helpers';
import type { ExperimentalFeatures } from '../../../../../common';
import { getWatchlistToolAvailability } from './watchlist_availability';
import { listWatchlistsTool } from './list_watchlists_tool';

jest.mock('./watchlist_availability', () => ({
  getWatchlistToolAvailability: jest.fn(),
}));

const mockGetWatchlistToolAvailability = getWatchlistToolAvailability as jest.Mock;

const mockExperimentalFeatures = {
  entityAnalyticsWatchlistEnabled: true,
} as ExperimentalFeatures;

const mockListFn = jest.fn();
jest.mock('../../../../lib/entity_analytics/watchlists/management/watchlist_config', () => {
  const actual = jest.requireActual(
    '../../../../lib/entity_analytics/watchlists/management/watchlist_config'
  );
  return {
    ...actual,
    WatchlistConfigClient: jest.fn().mockImplementation(() => ({
      list: mockListFn,
    })),
  };
});

const mockGetUserWatchlistPrivileges = jest.fn();
jest.mock(
  '../../../../lib/entity_analytics/watchlists/management/get_user_watchlist_privileges',
  () => ({
    getUserWatchlistPrivileges: (...args: unknown[]) => mockGetUserWatchlistPrivileges(...args),
  })
);

const buildWatchlist = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'wl-1',
  name: 'Privileged Users',
  description: 'Sensitive accounts under continuous review',
  managed: false,
  riskModifier: 1.5,
  entitySourceIds: ['src-1'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...overrides,
});

describe('listWatchlistsTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const tool = listWatchlistsTool(mockCore, mockLogger, mockExperimentalFeatures);

  beforeEach(() => {
    jest.clearAllMocks();
    setupMockCoreStartServices(mockCore, mockEsClient);
    mockGetWatchlistToolAvailability.mockResolvedValue({ status: 'available' });
    mockGetUserWatchlistPrivileges.mockResolvedValue({
      privileges: {},
      has_all_required: true,
      has_read_permissions: true,
      has_write_permissions: true,
    });
  });

  describe('availability', () => {
    it('is available when the AB resource check passes and watchlists are enabled', async () => {
      const result = await tool.availability!.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );
      expect(result.status).toBe('available');
    });

    it('is unavailable when availability check returns unavailable', async () => {
      mockGetWatchlistToolAvailability.mockResolvedValueOnce({
        status: 'unavailable',
        reason: 'not in a security space',
      });

      const result = await tool.availability!.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );
      expect(result.status).toBe('unavailable');
    });
  });

  describe('schema', () => {
    it('accepts an empty object', () => {
      const result = tool.schema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts nameContains', () => {
      const result = tool.schema.safeParse({ nameContains: 'priv' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty nameContains', () => {
      const result = tool.schema.safeParse({ nameContains: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('handler', () => {
    it('returns trimmed watchlist summaries for the happy path', async () => {
      const watchlists = [buildWatchlist(), buildWatchlist({ id: 'wl-2', name: 'Admins' })];
      mockListFn.mockResolvedValueOnce(watchlists);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(mockListFn).toHaveBeenCalledWith(100);
      expect(result.results).toHaveLength(1);
      const other = result.results[0] as OtherResult;
      expect(other.type).toBe(ToolResultType.other);
      expect(other.data).toMatchObject({ watchlists });
    });

    it('returns an empty list when there are no watchlists', async () => {
      mockListFn.mockResolvedValueOnce([]);

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const other = result.results[0] as OtherResult;
      expect(other.type).toBe(ToolResultType.other);
      expect(other.data).toMatchObject({ watchlists: [] });
    });

    it('filters by nameContains case-insensitively and echoes the filter in the result', async () => {
      mockListFn.mockResolvedValueOnce([
        buildWatchlist({ id: 'wl-1', name: 'Privileged Users' }),
        buildWatchlist({ id: 'wl-2', name: 'Admins' }),
        buildWatchlist({ id: 'wl-3', name: 'Compromised Privileges' }),
      ]);

      const name = 'PRIV';
      const result = (await tool.handler(
        { nameContains: name },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const other = result.results[0] as OtherResult;
      expect(other.data).toMatchObject({
        filter: { nameContains: name },
      });
      const { watchlists } = other.data as { watchlists: Array<{ id: string }> };
      expect(watchlists.map((w) => w.id)).toEqual(['wl-1', 'wl-3']);
    });

    it('returns an error when the caller lacks read privilege', async () => {
      mockGetUserWatchlistPrivileges.mockResolvedValueOnce({
        privileges: {},
        has_all_required: false,
        has_read_permissions: false,
        has_write_permissions: false,
      });

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      expect(mockListFn).not.toHaveBeenCalled();
      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
    });

    it('returns an error result when the service throws', async () => {
      mockListFn.mockRejectedValueOnce(new Error('boom'));

      const result = (await tool.handler(
        {},
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger)
      )) as ToolHandlerStandardReturn;

      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
    });
  });
});
