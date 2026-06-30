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
import { createWatchlistTool } from './create_watchlist_tool';

jest.mock('./watchlist_availability', () => ({
  getWatchlistToolAvailability: jest.fn(),
}));

const mockGetWatchlistToolAvailability = getWatchlistToolAvailability as jest.Mock;

const mockExperimentalFeatures = {
  entityAnalyticsWatchlistEnabled: true,
} as ExperimentalFeatures;

const mockCreateFn = jest.fn();
jest.mock('../../../../lib/entity_analytics/watchlists/management/watchlist_config', () => {
  const actual = jest.requireActual(
    '../../../../lib/entity_analytics/watchlists/management/watchlist_config'
  );
  return {
    ...actual,
    WatchlistConfigClient: jest.fn().mockImplementation(() => ({
      create: mockCreateFn,
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

const buildCreatedWatchlist = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'wl-new',
  name: 'Privileged Users',
  description: 'Sensitive accounts under continuous review',
  managed: false,
  riskModifier: 1,
  entitySourceIds: [],
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
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
    toolCallId: 'tool-call-123',
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

describe('createWatchlistTool', () => {
  const mocks = createToolTestMocks();
  const tool = createWatchlistTool(mocks.mockCore, mocks.mockLogger, mockExperimentalFeatures);

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
    it('accepts a minimal payload (name only)', () => {
      const result = tool.schema.safeParse({ name: 'Privileged Users' });
      expect(result.success).toBe(true);
    });

    it('accepts name + description + riskModifier', () => {
      const result = tool.schema.safeParse({
        name: 'Privileged Users',
        description: 'Sensitive accounts',
        riskModifier: 1.5,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty name', () => {
      const result = tool.schema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects a missing name', () => {
      const result = tool.schema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects a riskModifier not in the allowed set (0, 0.5, 1, 1.5, 2)', () => {
      expect(tool.schema.safeParse({ name: 'x', riskModifier: -1 }).success).toBe(false);
      expect(tool.schema.safeParse({ name: 'x', riskModifier: 3 }).success).toBe(false);
      expect(tool.schema.safeParse({ name: 'x', riskModifier: 1.25 }).success).toBe(false);
    });

    it('rejects a name longer than 256 characters', () => {
      expect(tool.schema.safeParse({ name: 'x'.repeat(257) }).success).toBe(false);
      expect(tool.schema.safeParse({ name: 'x'.repeat(256) }).success).toBe(true);
    });

    it('rejects a description longer than 1000 characters', () => {
      expect(tool.schema.safeParse({ name: 'x', description: 'y'.repeat(1001) }).success).toBe(
        false
      );
      expect(tool.schema.safeParse({ name: 'x', description: 'y'.repeat(1000) }).success).toBe(
        true
      );
    });
  });

  describe('handler', () => {
    describe('HITL', () => {
      it('returns a confirmation prompt on the first invocation (unprompted)', async () => {
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.unprompted,
        });

        const result = await tool.handler(
          { name: 'Privileged Users', description: 'Sensitive accounts' },
          ctx
        );

        expect(ctx.prompts.askForConfirmation).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'watchlists.create_watchlist.tool-call-123',
            title: 'Create watchlist',
            confirm_text: 'Create',
            cancel_text: 'Cancel',
            color: 'primary',
            message: expect.stringContaining('Privileged Users'),
          })
        );
        expect(mockCreateFn).not.toHaveBeenCalled();
        expect('prompt' in result).toBe(true);
      });

      it('creates the watchlist when the user has accepted', async () => {
        const created = buildCreatedWatchlist();
        mockCreateFn.mockResolvedValueOnce(created);

        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.accepted,
        });

        const result = (await tool.handler(
          { name: 'Privileged Users', description: 'Sensitive accounts' },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockCreateFn).toHaveBeenCalledWith({
          name: 'Privileged Users',
          description: 'Sensitive accounts',
          riskModifier: 1.5,
          managed: false,
        });
        const other = result.results[0] as OtherResult;
        expect(other.type).toBe(ToolResultType.other);
        expect(other.data).toEqual({ watchlist: created });
        expect(ctx.prompts.askForConfirmation).not.toHaveBeenCalled();
      });

      it('returns an error result without creating when the user has rejected', async () => {
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.rejected,
        });

        const result = (await tool.handler(
          { name: 'Privileged Users' },
          ctx
        )) as ToolHandlerStandardReturn;

        expect(mockCreateFn).not.toHaveBeenCalled();
        const error = result.results[0] as ErrorResult;
        expect(error.type).toBe(ToolResultType.error);
        expect(error.data.message).toMatch(/declined/i);
      });

      it('honors an explicit riskModifier through to the service call', async () => {
        mockCreateFn.mockResolvedValueOnce(buildCreatedWatchlist({ riskModifier: 0.5 }));
        const ctx = buildHandlerContextWithPrompts(mocks, {
          checkStatus: ConfirmationStatus.accepted,
        });

        await tool.handler({ name: 'Compromised', riskModifier: 0.5 }, ctx);

        expect(mockCreateFn).toHaveBeenCalledWith(expect.objectContaining({ riskModifier: 0.5 }));
      });
    });

    it('returns an error when the caller lacks write privilege', async () => {
      mockGetUserWatchlistPrivileges.mockResolvedValueOnce({
        privileges: {},
        has_all_required: false,
        has_read_permissions: true,
        has_write_permissions: false,
      });
      const ctx = buildHandlerContextWithPrompts(mocks);

      const result = (await tool.handler(
        { name: 'Privileged Users' },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(mockCreateFn).not.toHaveBeenCalled();
      expect(ctx.prompts.askForConfirmation).not.toHaveBeenCalled();
      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toMatch(/permission/i);
    });

    it('returns an error result when the service throws after accept', async () => {
      mockCreateFn.mockRejectedValueOnce(new Error('boom'));
      const ctx = buildHandlerContextWithPrompts(mocks, {
        checkStatus: ConfirmationStatus.accepted,
      });

      const result = (await tool.handler(
        { name: 'Privileged Users' },
        ctx
      )) as ToolHandlerStandardReturn;

      const error = result.results[0] as ErrorResult;
      expect(error.type).toBe(ToolResultType.error);
      expect(error.data.message).toContain('boom');
    });
  });
});
