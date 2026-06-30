/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType, type ErrorResult, type OtherResult } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type {
  ToolHandlerStandardReturn,
  ToolHandlerPromptReturn,
} from '@kbn/agent-builder-server/tools';
import {
  createToolAvailabilityContext,
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../../__mocks__/test_helpers';
import type { ExperimentalFeatures } from '../../../../../common';
import { getWatchlistToolAvailability } from './watchlist_availability';
import { removeEntitiesFromWatchlistTool } from './remove_entities_from_watchlist_tool';

jest.mock('./watchlist_availability', () => ({
  getWatchlistToolAvailability: jest.fn(),
}));

const mockGetWatchlistToolAvailability = getWatchlistToolAvailability as jest.Mock;

const mockExperimentalFeatures = {
  entityAnalyticsWatchlistEnabled: true,
  entityAnalyticsEntityStoreV2: true,
} as ExperimentalFeatures;

const mockGetWatchlistFn = jest.fn();
jest.mock('../../../../lib/entity_analytics/watchlists/management/watchlist_config', () => {
  const actual = jest.requireActual(
    '../../../../lib/entity_analytics/watchlists/management/watchlist_config'
  );
  return {
    ...actual,
    WatchlistConfigClient: jest.fn().mockImplementation(() => ({
      get: mockGetWatchlistFn,
    })),
  };
});

const mockUnassignFn = jest.fn();
jest.mock('../../../../lib/entity_analytics/watchlists/entity_sources/manual/service', () => ({
  createManualEntityService: jest.fn().mockImplementation(() => ({
    unassign: mockUnassignFn,
  })),
}));

jest.mock('@kbn/entity-store/server/domain/crud', () => ({
  CRUDClient: jest.fn().mockImplementation(() => ({})),
}));

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
  description: 'Sensitive accounts',
  managed: false,
  riskModifier: 1.5,
  entitySourceIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...overrides,
});

const buildUnassignMixed = () => ({
  successful: 1,
  failed: 0,
  not_found: 1,
  total: 2,
  items: [
    { euid: 'user:alice', status: 'success' as const },
    {
      euid: 'user:fromsource',
      status: 'not_found' as const,
      error: 'Entity not manually assigned to this watchlist',
    },
  ],
});

const buildHandlerContextWithPrompts = (
  base: ReturnType<typeof createToolTestMocks>,
  promptOverrides: {
    checkStatus?: ConfirmationStatus;
    askResult?: ToolHandlerPromptReturn;
  } = {}
) => {
  const ctx = createToolHandlerContext(base.mockRequest, base.mockEsClient, base.mockLogger);
  ctx.callContext = {
    ...ctx.callContext,
    toolCallId: 'tool-call-remove',
  };
  ctx.prompts = {
    ...ctx.prompts,
    checkConfirmationStatus: jest.fn().mockReturnValue({
      status: promptOverrides.checkStatus ?? ConfirmationStatus.unprompted,
    }),
    askForConfirmation: jest.fn().mockReturnValue(
      promptOverrides.askResult ?? {
        prompt: {
          id: 'placeholder',
          type: 'confirm',
          definition: { id: 'placeholder', title: 'placeholder' },
        },
      }
    ),
  };
  return ctx;
};

describe('removeEntitiesFromWatchlistTool', () => {
  const mocks = createToolTestMocks();
  const tool = removeEntitiesFromWatchlistTool(
    mocks.mockCore,
    mocks.mockLogger,
    mockExperimentalFeatures
  );

  beforeEach(() => {
    jest.clearAllMocks();
    setupMockCoreStartServices(mocks.mockCore, mocks.mockEsClient);
    mockGetWatchlistToolAvailability.mockResolvedValue({ status: 'available' });
    mockGetUserWatchlistPrivileges.mockResolvedValue({
      privileges: {},
      has_all_required: true,
      has_read_permissions: true,
      has_write_permissions: true,
    });
  });

  describe('availability', () => {
    it('is available when the AB resource check passes and both flags are on', async () => {
      const result = await tool.availability!.handler(
        createToolAvailabilityContext(mocks.mockRequest, 'default')
      );
      expect(result.status).toBe('available');
    });

    it('is unavailable when availability check returns unavailable', async () => {
      mockGetWatchlistToolAvailability.mockResolvedValueOnce({
        status: 'unavailable',
        reason: 'not in a security space',
      });
      const result = await tool.availability!.handler(
        createToolAvailabilityContext(mocks.mockRequest, 'default')
      );
      expect(result.status).toBe('unavailable');
    });
  });

  describe('schema', () => {
    it('accepts a single entity id', () => {
      expect(tool.schema.safeParse({ watchlistId: 'wl-1', entityIds: ['user:a'] }).success).toBe(
        true
      );
    });

    it('accepts a list of entity ids', () => {
      expect(
        tool.schema.safeParse({
          watchlistId: 'wl-1',
          entityIds: ['user:a', 'host:b'],
        }).success
      ).toBe(true);
    });

    it('rejects an empty entityIds array', () => {
      expect(tool.schema.safeParse({ watchlistId: 'wl-1', entityIds: [] }).success).toBe(false);
    });
  });

  describe('handler', () => {
    it('returns an error when the caller lacks write privilege', async () => {
      mockGetUserWatchlistPrivileges.mockResolvedValueOnce({
        privileges: {},
        has_all_required: false,
        has_read_permissions: true,
        has_write_permissions: false,
      });
      const ctx = buildHandlerContextWithPrompts(mocks);

      const result = (await tool.handler(
        { watchlistId: 'wl-1', entityIds: ['user:a'] },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(mockUnassignFn).not.toHaveBeenCalled();
      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toMatch(/permission/i);
    });

    describe('HITL', () => {
      it('on unprompted: confirmation names the watchlist, previews ids, and warns about source-managed entities', async () => {
        mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist({ name: 'Privileged Users' }));
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        await tool.handler({ watchlistId: 'wl-1', entityIds: ['user:alice'] }, ctx);

        const askArgs = (ctx.prompts.askForConfirmation as jest.Mock).mock.calls[0][0];
        expect(askArgs).toMatchObject({
          id: 'watchlists.remove_entities_from_watchlist.tool-call-remove',
          title: 'Remove entities from watchlist',
          confirm_text: 'Remove',
          cancel_text: 'Cancel',
          color: 'warning',
        });
        expect(askArgs.message).toContain('"Privileged Users"');
        expect(askArgs.message).toContain('user:alice');
        expect(askArgs.message).toMatch(/manually-assigned/i);
      });

      it('on accept: calls service.unassign and passes through the partial result', async () => {
        mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist({ name: 'Privileged Users' }));
        const result = buildUnassignMixed();
        mockUnassignFn.mockResolvedValueOnce(result);

        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.accepted,
        });

        const handlerResult = (await tool.handler(
          { watchlistId: 'wl-1', entityIds: ['user:alice', 'user:fromsource'] },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockUnassignFn).toHaveBeenCalledWith(['user:alice', 'user:fromsource']);
        const other = handlerResult.results[0] as OtherResult;
        expect(other.type).toBe(ToolResultType.other);
        expect(other.data).toMatchObject({
          watchlistId: 'wl-1',
          watchlistName: 'Privileged Users',
          successful: 1,
          not_found: 1,
          items: expect.arrayContaining([
            expect.objectContaining({
              euid: 'user:fromsource',
              status: 'not_found',
              error: expect.stringContaining('manually assigned'),
            }),
          ]),
        });
      });

      it('on reject: returns an error result without calling unassign', async () => {
        mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist());
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.rejected,
        });

        const result = (await tool.handler(
          { watchlistId: 'wl-1', entityIds: ['user:alice'] },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockUnassignFn).not.toHaveBeenCalled();
        const error = result.results[0] as ErrorResult;
        expect(error.type).toBe(ToolResultType.error);
        expect(error.data.message).toMatch(/declined/i);
      });
    });

    it('returns an error result when the unassign service throws after accept', async () => {
      mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist());
      mockUnassignFn.mockRejectedValueOnce(new Error('boom'));
      const ctx = buildHandlerContextWithPrompts(mocks, {
        checkStatus: ConfirmationStatus.accepted,
      });

      const result = (await tool.handler(
        { watchlistId: 'wl-1', entityIds: ['user:a'] },
        ctx
      )) as ToolHandlerStandardReturn;

      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toContain('boom');
    });
  });
});
