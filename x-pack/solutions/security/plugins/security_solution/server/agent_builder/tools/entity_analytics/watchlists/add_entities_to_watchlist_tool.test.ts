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
import { addEntitiesToWatchlistTool } from './add_entities_to_watchlist_tool';

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

const mockAssignFn = jest.fn();
jest.mock('../../../../lib/entity_analytics/watchlists/entity_sources/manual/service', () => ({
  createManualEntityService: jest.fn().mockImplementation(() => ({
    assign: mockAssignFn,
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

const buildAssignSuccess = (euids: string[]) => ({
  successful: euids.length,
  failed: 0,
  not_found: 0,
  total: euids.length,
  items: euids.map((euid) => ({ euid, status: 'success' as const })),
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
    toolCallId: 'tool-call-add',
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

describe('addEntitiesToWatchlistTool', () => {
  const mocks = createToolTestMocks();
  const tool = addEntitiesToWatchlistTool(
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
          entityIds: ['user:a', 'host:b', 'service:c'],
        }).success
      ).toBe(true);
    });

    it('rejects an empty entityIds array', () => {
      expect(tool.schema.safeParse({ watchlistId: 'wl-1', entityIds: [] }).success).toBe(false);
    });

    it('rejects an empty watchlistId', () => {
      expect(tool.schema.safeParse({ watchlistId: '', entityIds: ['user:a'] }).success).toBe(false);
    });

    it('rejects an entityIds list larger than the cap', () => {
      const overCap = Array.from({ length: 101 }, (_, i) => `user:u${i}`);
      expect(tool.schema.safeParse({ watchlistId: 'wl-1', entityIds: overCap }).success).toBe(
        false
      );
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

      expect(mockGetWatchlistFn).not.toHaveBeenCalled();
      expect(mockAssignFn).not.toHaveBeenCalled();
      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toMatch(/permission/i);
    });

    describe('HITL', () => {
      it('on unprompted: confirmation message names the watchlist and previews entity ids', async () => {
        mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist({ name: 'Privileged Users' }));
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        await tool.handler(
          { watchlistId: 'wl-1', entityIds: ['user:alice', 'host:server01'] },
          ctx
        );

        expect(mockGetWatchlistFn).toHaveBeenCalledWith('wl-1');
        expect(mockAssignFn).not.toHaveBeenCalled();
        const askArgs = (ctx.prompts.askForConfirmation as jest.Mock).mock.calls[0][0];
        expect(askArgs).toMatchObject({
          id: 'watchlists.add_entities_to_watchlist.tool-call-add',
          title: 'Add entities to watchlist',
          confirm_text: 'Add',
          cancel_text: 'Cancel',
          color: 'primary',
        });
        expect(askArgs.message).toContain('"Privileged Users"');
        expect(askArgs.message).toContain('2 entities');
        expect(askArgs.message).toContain('user:alice');
        expect(askArgs.message).toContain('host:server01');
      });

      it('on unprompted with one entity: uses singular "entity" wording', async () => {
        mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist());
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        await tool.handler({ watchlistId: 'wl-1', entityIds: ['user:alice'] }, ctx);

        const askArgs = (ctx.prompts.askForConfirmation as jest.Mock).mock.calls[0][0];
        expect(askArgs.message).toMatch(/1 entity\b/);
      });

      it('on accept: calls service.assign with the supplied ids and returns the result with watchlist context', async () => {
        mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist({ name: 'Privileged Users' }));
        const assignResult = buildAssignSuccess(['user:alice', 'host:server01']);
        mockAssignFn.mockResolvedValueOnce(assignResult);

        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.accepted,
        });

        const result = (await tool.handler(
          { watchlistId: 'wl-1', entityIds: ['user:alice', 'host:server01'] },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockAssignFn).toHaveBeenCalledWith(['user:alice', 'host:server01']);
        const other = result.results[0] as OtherResult;
        expect(other.type).toBe(ToolResultType.other);
        expect(other.data).toMatchObject({
          watchlistId: 'wl-1',
          watchlistName: 'Privileged Users',
          ...assignResult,
        });
      });

      it('on reject: returns an error result without calling assign', async () => {
        mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist());
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.rejected,
        });

        const result = (await tool.handler(
          { watchlistId: 'wl-1', entityIds: ['user:alice'] },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockAssignFn).not.toHaveBeenCalled();
        const error = result.results[0] as ErrorResult;
        expect(error.type).toBe(ToolResultType.error);
        expect(error.data.message).toMatch(/declined/i);
      });
    });

    it('returns an error result when the watchlist fetch throws', async () => {
      mockGetWatchlistFn.mockRejectedValueOnce(
        new Error("Watchlist config 'wl-missing' not found")
      );
      const ctx = buildHandlerContextWithPrompts(mocks, {
        checkStatus: ConfirmationStatus.unprompted,
      });

      const result = (await tool.handler(
        { watchlistId: 'wl-missing', entityIds: ['user:a'] },
        ctx
      )) as ToolHandlerStandardReturn;

      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toContain('not found');
    });

    it('returns an error result when the assign service throws after accept', async () => {
      mockGetWatchlistFn.mockResolvedValueOnce(buildWatchlist());
      mockAssignFn.mockRejectedValueOnce(new Error('boom'));
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
