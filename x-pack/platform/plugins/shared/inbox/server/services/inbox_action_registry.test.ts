/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { httpServerMock } from '@kbn/core/server/mocks';
import type { InboxAction } from '@kbn/inbox-common';
import { InboxActionRegistry, isUnknownInboxSourceAppError } from './inbox_action_registry';
import type {
  InboxActionProvider,
  InboxActionProviderFacetsResult,
  InboxRequestContext,
} from './inbox_action_provider';
import {
  createStubInboxAction,
  createStubInboxActions,
} from '../../common/test_helpers/create_stub_inbox_action';

const ctx = (): InboxRequestContext => ({
  request: httpServerMock.createKibanaRequest(),
  spaceId: 'default',
});

const fakeProvider = (
  sourceApp: string,
  actions = createStubInboxActions(3, { source_app: sourceApp }),
  options: {
    withListProcessed?: boolean | InboxAction[];
    withFacets?: InboxActionProviderFacetsResult;
  } = { withListProcessed: false }
): jest.Mocked<InboxActionProvider> => {
  const provider: jest.Mocked<InboxActionProvider> = {
    sourceApp,
    list: jest.fn<ReturnType<InboxActionProvider['list']>, Parameters<InboxActionProvider['list']>>(
      async () => ({ actions, total: actions.length })
    ),
    respond: jest.fn<
      ReturnType<InboxActionProvider['respond']>,
      Parameters<InboxActionProvider['respond']>
    >(async () => {}),
  };
  if (options.withListProcessed) {
    const historyActions = Array.isArray(options.withListProcessed)
      ? options.withListProcessed
      : actions.map((action) => ({ ...action, status: 'approved' as const }));
    provider.listProcessed = jest.fn(async () => ({
      actions: historyActions,
      total: historyActions.length,
    }));
  }
  if (options.withFacets) {
    const facets = options.withFacets;
    provider.listProcessedFacets = jest.fn(async () => facets);
  }
  return provider;
};

describe('InboxActionRegistry', () => {
  let logger: ReturnType<typeof loggerMock.create>;
  let registry: InboxActionRegistry;

  beforeEach(() => {
    logger = loggerMock.create();
    registry = new InboxActionRegistry(logger);
  });

  describe('register()', () => {
    it('accepts a new provider', () => {
      const provider = fakeProvider('workflows');
      expect(() => registry.register(provider)).not.toThrow();
      expect(registry.has('workflows')).toBe(true);
    });

    it('throws when the same sourceApp registers twice', () => {
      registry.register(fakeProvider('workflows'));
      expect(() => registry.register(fakeProvider('workflows'))).toThrow(/already registered/);
    });
  });

  describe('list()', () => {
    it('returns empty when no providers are registered', async () => {
      const result = await registry.list({ page: 1, perPage: 25 }, ctx());
      expect(result).toEqual({ actions: [], total: 0 });
    });

    it('forwards the status filter to each provider', async () => {
      const workflows = fakeProvider('workflows');
      registry.register(workflows);

      await registry.list({ page: 1, perPage: 25, status: 'pending' }, ctx());

      expect(workflows.list).toHaveBeenCalledWith(
        { status: 'pending', page: 1, perPage: 25 },
        expect.objectContaining({ spaceId: 'default' })
      );
    });

    it('scopes to a single provider when sourceApp is specified', async () => {
      const workflows = fakeProvider('workflows');
      const evals = fakeProvider('evals');
      registry.register(workflows);
      registry.register(evals);

      await registry.list({ page: 1, perPage: 25, sourceApp: 'workflows' }, ctx());

      expect(workflows.list).toHaveBeenCalledTimes(1);
      expect(evals.list).not.toHaveBeenCalled();
    });

    it('returns empty when sourceApp matches no registered provider', async () => {
      registry.register(fakeProvider('workflows'));

      const result = await registry.list({ page: 1, perPage: 25, sourceApp: 'unknown' }, ctx());

      expect(result).toEqual({ actions: [], total: 0 });
    });

    it('merge-sorts actions from all providers by created_at desc', async () => {
      const workflows = fakeProvider('workflows', [
        createStubInboxAction({
          id: 'w-1',
          source_app: 'workflows',
          created_at: '2026-04-24T10:00:00.000Z',
        }),
        createStubInboxAction({
          id: 'w-2',
          source_app: 'workflows',
          created_at: '2026-04-24T12:00:00.000Z',
        }),
      ]);
      const evals = fakeProvider('evals', [
        createStubInboxAction({
          id: 'e-1',
          source_app: 'evals',
          created_at: '2026-04-24T11:00:00.000Z',
        }),
      ]);
      registry.register(workflows);
      registry.register(evals);

      const result = await registry.list({ page: 1, perPage: 25 }, ctx());

      expect(result.actions.map((action) => action.id)).toEqual(['w-2', 'e-1', 'w-1']);
      expect(result.total).toBe(3);
    });

    it('paginates after merge-sorting', async () => {
      const actions = Array.from({ length: 5 }, (_, i) =>
        createStubInboxAction({
          id: `a-${i}`,
          source_app: 'workflows',
          // Ensure deterministic ordering by stamping decreasing timestamps.
          created_at: new Date(Date.UTC(2026, 3, 24, 12, i)).toISOString(),
        })
      );
      registry.register(fakeProvider('workflows', actions));

      const page1 = await registry.list({ page: 1, perPage: 2 }, ctx());
      const page2 = await registry.list({ page: 2, perPage: 2 }, ctx());
      const page3 = await registry.list({ page: 3, perPage: 2 }, ctx());

      expect(page1.total).toBe(5);
      expect(page1.actions.map((a) => a.id)).toEqual(['a-4', 'a-3']);
      expect(page2.actions.map((a) => a.id)).toEqual(['a-2', 'a-1']);
      expect(page3.actions.map((a) => a.id)).toEqual(['a-0']);
    });

    it('requests enough provider rows for the requested merged page and preserves totals', async () => {
      const paged: InboxActionProvider = {
        sourceApp: 'workflows',
        list: jest.fn(async ({ perPage }) => ({
          actions: createStubInboxActions(perPage ?? 0, { source_app: 'workflows' }),
          total: 50,
        })),
        respond: jest.fn(async () => {}),
      };
      registry.register(paged);

      const result = await registry.list({ page: 2, perPage: 25 }, ctx());

      expect(paged.list).toHaveBeenCalledWith(
        { page: 1, perPage: 50, status: undefined },
        expect.objectContaining({ spaceId: 'default' })
      );
      expect(result.total).toBe(50);
      expect(result.actions).toHaveLength(25);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('treats a single provider failure as empty and does not short-circuit other providers', async () => {
      const failing = fakeProvider('workflows');
      failing.list.mockRejectedValueOnce(new Error('boom'));
      const healthy = fakeProvider('evals', [
        createStubInboxAction({ id: 'healthy-1', source_app: 'evals' }),
      ]);
      registry.register(failing);
      registry.register(healthy);

      const result = await registry.list({ page: 1, perPage: 25 }, ctx());

      expect(result.actions.map((a) => a.id)).toEqual(['healthy-1']);
      expect(result.total).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('workflows'));
    });
  });

  describe('listHistory()', () => {
    it('returns empty when no providers are registered', async () => {
      const result = await registry.listHistory({ page: 1, perPage: 25 }, ctx());
      expect(result).toEqual({ actions: [], total: 0 });
    });

    it('skips providers that do not implement listProcessed', async () => {
      // The optional contract lets providers ship pending-only first; the
      // registry must treat missing implementations as "no rows" so the
      // history listing still works when only one provider supports it.
      const noHistory = fakeProvider('legacy');
      const withHistory = fakeProvider(
        'workflows',
        createStubInboxActions(2, { source_app: 'workflows' }),
        { withListProcessed: true }
      );
      registry.register(noHistory);
      registry.register(withHistory);

      const result = await registry.listHistory({ page: 1, perPage: 25 }, ctx());

      expect(noHistory.listProcessed).toBeUndefined();
      expect(withHistory.listProcessed).toHaveBeenCalledTimes(1);
      expect(result.total).toBe(2);
    });

    it('forwards the search/filter/sort bundle to each provider listProcessed', async () => {
      const withHistory = fakeProvider('workflows', [], { withListProcessed: true });
      registry.register(withHistory);

      await registry.listHistory(
        {
          page: 1,
          perPage: 25,
          q: 'alice',
          channel: ['inbox'],
          workflowId: ['wf-1'],
          respondedBy: ['alice'],
          sortOrder: 'asc',
        },
        ctx()
      );

      expect(withHistory.listProcessed).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          perPage: 25,
          q: 'alice',
          channel: ['inbox'],
          workflowId: ['wf-1'],
          respondedBy: ['alice'],
          sortOrder: 'asc',
        }),
        expect.objectContaining({ spaceId: 'default' })
      );
    });

    it('orders history oldest-first when sortOrder is asc', async () => {
      const older = createStubInboxAction({
        id: 'older',
        source_app: 'workflows',
        status: 'approved',
        created_at: '2026-04-24T08:00:00.000Z',
        responded_at: '2026-04-24T09:00:00.000Z',
      });
      const newer = createStubInboxAction({
        id: 'newer',
        source_app: 'workflows',
        status: 'approved',
        created_at: '2026-04-24T10:00:00.000Z',
        responded_at: '2026-04-24T12:00:00.000Z',
      });
      registry.register(fakeProvider('workflows', [], { withListProcessed: [newer, older] }));

      const result = await registry.listHistory({ page: 1, perPage: 25, sortOrder: 'asc' }, ctx());

      expect(result.actions.map((a) => a.id)).toEqual(['older', 'newer']);
    });

    it('merge-sorts history by responded_at desc, falling back to created_at when missing', async () => {
      const historyA = createStubInboxAction({
        id: 'a',
        source_app: 'workflows',
        status: 'approved',
        created_at: '2026-04-24T09:00:00.000Z',
        responded_at: '2026-04-24T12:00:00.000Z',
      });
      const historyB = createStubInboxAction({
        id: 'b',
        source_app: 'evals',
        status: 'approved',
        created_at: '2026-04-24T11:00:00.000Z',
        // No responded_at → falls back to created_at for ordering
      });
      const historyC = createStubInboxAction({
        id: 'c',
        source_app: 'workflows',
        status: 'approved',
        created_at: '2026-04-24T08:00:00.000Z',
        responded_at: '2026-04-24T10:00:00.000Z',
      });
      registry.register(
        fakeProvider('workflows', [], {
          withListProcessed: [historyA, historyC],
        })
      );
      registry.register(fakeProvider('evals', [], { withListProcessed: [historyB] }));

      const result = await registry.listHistory({ page: 1, perPage: 25 }, ctx());

      expect(result.actions.map((a) => a.id)).toEqual(['a', 'b', 'c']);
      expect(result.total).toBe(3);
    });

    it('treats a single provider failure as empty and does not short-circuit other providers', async () => {
      const failing = fakeProvider('workflows', [], { withListProcessed: true });
      (failing.listProcessed as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const healthy = fakeProvider('evals', [], {
        withListProcessed: [
          createStubInboxAction({ id: 'healthy-1', source_app: 'evals', status: 'approved' }),
        ],
      });
      registry.register(failing);
      registry.register(healthy);

      const result = await registry.listHistory({ page: 1, perPage: 25 }, ctx());

      expect(result.actions.map((a) => a.id)).toEqual(['healthy-1']);
      expect(result.total).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('listProcessed'));
    });

    it('requests enough history rows to serve deeper merged pages', async () => {
      const withHistory = fakeProvider('workflows', [], {
        withListProcessed: createStubInboxActions(50, {
          source_app: 'workflows',
          status: 'approved',
        }),
      });
      registry.register(withHistory);

      const result = await registry.listHistory({ page: 2, perPage: 25 }, ctx());

      expect(withHistory.listProcessed).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, perPage: 50 }),
        expect.objectContaining({ spaceId: 'default' })
      );
      expect(result.total).toBe(50);
      expect(result.actions).toHaveLength(25);
    });
  });

  describe('listFacets()', () => {
    it('returns empty buckets when no providers are registered', async () => {
      const result = await registry.listFacets({}, ctx());
      expect(result).toEqual({ channel: [], respondedBy: [] });
    });

    it('returns empty buckets when sourceApp matches no registered provider', async () => {
      registry.register(fakeProvider('workflows'));

      const result = await registry.listFacets({ sourceApp: 'unknown' }, ctx());

      expect(result).toEqual({ channel: [], respondedBy: [] });
    });

    it('skips providers that do not implement listProcessedFacets', async () => {
      const noFacets = fakeProvider('legacy');
      const withFacets = fakeProvider('workflows', [], {
        withFacets: {
          channel: [{ value: 'inbox', count: 3 }],
          respondedBy: [{ value: 'alice', count: 3 }],
        },
      });
      registry.register(noFacets);
      registry.register(withFacets);

      const result = await registry.listFacets({}, ctx());

      expect(noFacets.listProcessedFacets).toBeUndefined();
      expect(withFacets.listProcessedFacets).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        channel: [{ value: 'inbox', count: 3 }],
        respondedBy: [{ value: 'alice', count: 3 }],
      });
    });

    it('sums counts across providers contributing the same value', async () => {
      // Both a workflows provider and a (hypothetical) slack provider can
      // surface `channel: "slack"`; the registry must collapse them into one
      // bucket so the UI doesn't render the same chip twice.
      registry.register(
        fakeProvider('workflows', [], {
          withFacets: {
            channel: [
              { value: 'slack', count: 2 },
              { value: 'inbox', count: 5 },
            ],
            respondedBy: [{ value: 'alice', count: 7 }],
          },
        })
      );
      registry.register(
        fakeProvider('evals', [], {
          withFacets: {
            channel: [{ value: 'slack', count: 4 }],
            respondedBy: [{ value: 'bob', count: 1 }],
          },
        })
      );

      const result = await registry.listFacets({}, ctx());

      // Sorted by descending count, then value: inbox(5) > slack(2+4=6)? No —
      // slack 6 outranks inbox 5, so slack first.
      expect(result.channel).toEqual([
        { value: 'slack', count: 6 },
        { value: 'inbox', count: 5 },
      ]);
      expect(result.respondedBy).toEqual([
        { value: 'alice', count: 7 },
        { value: 'bob', count: 1 },
      ]);
    });

    it('breaks count ties by value for stable ordering across requests', async () => {
      registry.register(
        fakeProvider('workflows', [], {
          withFacets: {
            channel: [
              { value: 'zeta', count: 2 },
              { value: 'alpha', count: 2 },
            ],
            respondedBy: [],
          },
        })
      );

      const result = await registry.listFacets({}, ctx());

      expect(result.channel).toEqual([
        { value: 'alpha', count: 2 },
        { value: 'zeta', count: 2 },
      ]);
    });

    it('scopes to a single provider when sourceApp is specified', async () => {
      const workflows = fakeProvider('workflows', [], {
        withFacets: { channel: [{ value: 'inbox', count: 1 }], respondedBy: [] },
      });
      const evals = fakeProvider('evals', [], {
        withFacets: { channel: [{ value: 'slack', count: 9 }], respondedBy: [] },
      });
      registry.register(workflows);
      registry.register(evals);

      const result = await registry.listFacets({ sourceApp: 'workflows' }, ctx());

      expect(workflows.listProcessedFacets).toHaveBeenCalledTimes(1);
      expect(evals.listProcessedFacets).not.toHaveBeenCalled();
      expect(result.channel).toEqual([{ value: 'inbox', count: 1 }]);
    });

    it('treats a single provider failure as empty and does not short-circuit other providers', async () => {
      const failing = fakeProvider('workflows', [], {
        withFacets: { channel: [], respondedBy: [] },
      });
      (failing.listProcessedFacets as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const healthy = fakeProvider('evals', [], {
        withFacets: {
          channel: [{ value: 'inbox', count: 2 }],
          respondedBy: [{ value: 'bob', count: 2 }],
        },
      });
      registry.register(failing);
      registry.register(healthy);

      const result = await registry.listFacets({}, ctx());

      expect(result).toEqual({
        channel: [{ value: 'inbox', count: 2 }],
        respondedBy: [{ value: 'bob', count: 2 }],
      });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('listProcessedFacets'));
    });
  });

  describe('respondTo()', () => {
    it('dispatches to the matching provider', async () => {
      const workflows = fakeProvider('workflows');
      registry.register(workflows);

      await registry.respondTo('workflows', 'source-1', { approved: true }, ctx());

      expect(workflows.respond).toHaveBeenCalledWith(
        'source-1',
        { approved: true },
        expect.objectContaining({ spaceId: 'default' })
      );
    });

    it('throws UnknownInboxSourceAppError when the sourceApp is not registered', async () => {
      await expect(registry.respondTo('workflows', 'source-1', {}, ctx())).rejects.toThrow(
        /No inbox action provider registered/
      );
      // Belt-and-suspenders: also verify the structured error so the route
      // can branch on `isUnknownInboxSourceAppError(err)` instead of regex.
      const err = await registry
        .respondTo('workflows', 'source-1', {}, ctx())
        .catch((e: unknown) => e);
      expect(isUnknownInboxSourceAppError(err)).toBe(true);
    });
  });
});
