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
import { deleteWatchlistTool } from './delete_watchlist_tool';

jest.mock('./watchlist_availability', () => ({
  getWatchlistToolAvailability: jest.fn(),
}));

const mockGetWatchlistToolAvailability = getWatchlistToolAvailability as jest.Mock;

const mockExperimentalFeatures = {
  entityAnalyticsWatchlistEnabled: true,
} as ExperimentalFeatures;

const mockGetFn = jest.fn();
const mockDeleteFn = jest.fn();
const mockDeleteWatchlistEntitiesFn = jest.fn();
const mockGetUserWatchlistPrivileges = jest.fn();

jest.mock('../../../../lib/entity_analytics/watchlists/management/watchlist_config', () => {
  const actual = jest.requireActual(
    '../../../../lib/entity_analytics/watchlists/management/watchlist_config'
  );
  return {
    ...actual,
    WatchlistConfigClient: jest.fn().mockImplementation(() => ({
      get: mockGetFn,
      delete: mockDeleteFn,
    })),
  };
});

jest.mock(
  '../../../../lib/entity_analytics/watchlists/entity_sources/entity_sources_service',
  () => ({
    createEntitySourcesService: jest.fn().mockImplementation(() => ({
      deleteWatchlistEntities: mockDeleteWatchlistEntitiesFn,
    })),
  })
);
jest.mock(
  '../../../../lib/entity_analytics/watchlists/management/get_user_watchlist_privileges',
  () => ({
    getUserWatchlistPrivileges: (...args: unknown[]) => mockGetUserWatchlistPrivileges(...args),
  })
);

const buildExistingWatchlist = (overrides: Partial<Record<string, unknown>> = {}) => ({
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
    toolCallId: 'tool-call-delete',
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

describe('deleteWatchlistTool', () => {
  const mocks = createToolTestMocks();
  const tool = deleteWatchlistTool(
    mocks.mockCore,
    mocks.mockLogger,
    mockExperimentalFeatures,
    true
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
    it('is available when the AB resource check passes and watchlists are enabled', async () => {
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
    it('accepts a valid watchlistId', () => {
      expect(tool.schema.safeParse({ watchlistId: 'wl-1' }).success).toBe(true);
    });

    it('rejects an empty watchlistId', () => {
      expect(tool.schema.safeParse({ watchlistId: '' }).success).toBe(false);
    });

    it('rejects a missing watchlistId', () => {
      expect(tool.schema.safeParse({}).success).toBe(false);
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
        { watchlistId: 'wl-1' },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(mockGetFn).not.toHaveBeenCalled();
      expect(mockDeleteFn).not.toHaveBeenCalled();
      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toMatch(/permission/i);
    });

    describe('HITL', () => {
      it('on unprompted: confirmation message names the watchlist and warns the action is irreversible', async () => {
        mockGetFn.mockResolvedValueOnce(buildExistingWatchlist({ name: 'Privileged Users' }));

        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        await tool.handler({ watchlistId: 'wl-1' }, ctx);

        expect(mockGetFn).toHaveBeenCalledWith('wl-1');
        expect(mockDeleteFn).not.toHaveBeenCalled();
        const askArgs = (ctx.prompts.askForConfirmation as jest.Mock).mock.calls[0][0];
        expect(askArgs).toMatchObject({
          id: 'watchlists.delete_watchlist.tool-call-delete',
          title: 'Delete watchlist',
          confirm_text: 'Delete',
          cancel_text: 'Cancel',
          color: 'danger',
        });
        expect(askArgs.message).toContain('"Privileged Users"');
        expect(askArgs.message).toMatch(/cannot be undone/i);
      });

      it('on unprompted: confirmation message states how many linked entity sources will be cascade-deleted', async () => {
        mockGetFn.mockResolvedValueOnce(
          buildExistingWatchlist({ entitySourceIds: ['src-1', 'src-2', 'src-3'] })
        );
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        await tool.handler({ watchlistId: 'wl-1' }, ctx);

        const askArgs = (ctx.prompts.askForConfirmation as jest.Mock).mock.calls[0][0];
        expect(askArgs.message).toMatch(/3 linked entity sources/i);
      });

      it('on unprompted: with one linked source, message uses singular wording', async () => {
        mockGetFn.mockResolvedValueOnce(buildExistingWatchlist({ entitySourceIds: ['src-1'] }));
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        await tool.handler({ watchlistId: 'wl-1' }, ctx);

        const askArgs = (ctx.prompts.askForConfirmation as jest.Mock).mock.calls[0][0];
        expect(askArgs.message).toMatch(/1 linked entity source/i);
        expect(askArgs.message).not.toMatch(/1 linked entity sources/i);
      });

      it('refuses to delete a managed watchlist before prompting', async () => {
        mockGetFn.mockResolvedValueOnce(buildExistingWatchlist({ managed: true }));
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        const result = (await tool.handler(
          { watchlistId: 'wl-1' },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(ctx.prompts.askForConfirmation).not.toHaveBeenCalled();
        expect(mockDeleteFn).not.toHaveBeenCalled();
        const error = result.results[0] as ErrorResult;
        expect(error.type).toBe(ToolResultType.error);
        expect(error.data.message).toMatch(/system-managed/i);
      });

      it('on accept: cleans up entities then deletes watchlist without re-fetching', async () => {
        mockDeleteWatchlistEntitiesFn.mockResolvedValueOnce(undefined);
        mockDeleteFn.mockResolvedValueOnce(undefined);
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.accepted,
        });

        const result = (await tool.handler(
          { watchlistId: 'wl-1' },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockGetFn).not.toHaveBeenCalled();
        expect(mockDeleteWatchlistEntitiesFn).toHaveBeenCalledWith('wl-1');
        expect(mockDeleteFn).toHaveBeenCalledWith('wl-1');
        const other = result.results[0] as OtherResult;
        expect(other.type).toBe(ToolResultType.other);
        expect(other.data).toEqual({ deleted: true, watchlistId: 'wl-1' });
      });

      it('on reject: returns an error result without deleting', async () => {
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.rejected,
        });

        const result = (await tool.handler(
          { watchlistId: 'wl-1' },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockDeleteFn).not.toHaveBeenCalled();
        const error = result.results[0] as ErrorResult;
        expect(error.type).toBe(ToolResultType.error);
        expect(error.data.message).toMatch(/declined/i);
      });
    });

    it('returns an error result when get throws on the unprompted fetch', async () => {
      mockGetFn.mockRejectedValueOnce(new Error("Watchlist config 'wl-missing' not found"));
      const ctx = buildHandlerContextWithPrompts(mocks, {
        checkStatus: ConfirmationStatus.unprompted,
      });

      const result = (await tool.handler(
        { watchlistId: 'wl-missing' },
        ctx
      )) as ToolHandlerStandardReturn;

      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toContain('not found');
    });

    it('on accept, when watchlist deletion fails: returns an error', async () => {
      const errorMessage = 'test error';
      mockDeleteWatchlistEntitiesFn.mockResolvedValueOnce(undefined);
      mockDeleteFn.mockRejectedValueOnce(new Error(errorMessage));
      const ctx = buildHandlerContextWithPrompts(mocks, {
        checkStatus: ConfirmationStatus.accepted,
      });

      const result = (await tool.handler(
        { watchlistId: 'wl-1' },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(mockDeleteWatchlistEntitiesFn).toHaveBeenCalledWith('wl-1');
      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toContain(errorMessage);
    });

    it('on accept, when entity cleanup fails: watchlist is still deleted and result carries a warning', async () => {
      mockDeleteWatchlistEntitiesFn.mockRejectedValueOnce(new Error('cleanup-boom'));
      mockDeleteFn.mockResolvedValueOnce(undefined);
      const ctx = buildHandlerContextWithPrompts(mocks, {
        checkStatus: ConfirmationStatus.accepted,
      });

      const result = (await tool.handler(
        { watchlistId: 'wl-1' },
        ctx
      )) as ToolHandlerStandardReturn;

      const other = result.results[0] as OtherResult;
      expect(other.type).toBe(ToolResultType.other);
      expect(other.data.deleted).toBe(true);
      expect(other.data.watchlistId).toBe('wl-1');
      expect(other.data.warning).toContain('cleanup-boom');
      expect(other.data.warning).toMatch(/entity source cleanup failed/i);
    });
  });
});
