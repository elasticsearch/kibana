/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import type {
  GeneratedSignificantEventQuery,
  QueryLink,
  StreamQuery,
} from '@kbn/significant-events-schema';
import { persistQueries } from './persist_queries';
import type { KnowledgeIndicatorClient } from '../streams/ki';
import type { StreamsClient } from '../streams/client';

jest.mock('uuid', () => ({ v4: () => 'generated-uuid' }));

const definition = { name: 'logs.test' } as Streams.all.Definition;

const makeLink = (
  overrides: {
    id?: string;
    esql?: string;
    ruleBacked?: boolean;
    expiresAt?: string;
    severity_score?: number;
  } = {}
): QueryLink => ({
  query: {
    id: overrides.id ?? 'q1',
    type: 'match',
    title: 'Test query',
    description: 'desc',
    esql: { query: overrides.esql ?? 'FROM logs | WHERE body.text:"error"' },
    severity_score: overrides.severity_score ?? 60,
  },
  stream_name: 'logs.test',
  rule_backed: overrides.ruleBacked ?? false,
  rule_id: `rule-${overrides.id ?? 'q1'}`,
  ...(overrides.expiresAt ? { expires_at: overrides.expiresAt } : {}),
});

const makeGeneratedQuery = (
  overrides: Partial<GeneratedSignificantEventQuery> = {}
): GeneratedSignificantEventQuery => ({
  type: 'match',
  title: 'New query',
  description: 'desc',
  esql: { query: 'FROM logs | WHERE body.text:"timeout"' },
  severity_score: 50,
  features: [{ id: 'test-feature', run_id: 'test-run' }],
  ...overrides,
});

const MOCK_DEFAULT_EXPIRES_AT = '2099-01-01T00:00:00.000Z';

const createMocks = (existingLinks: QueryLink[] = []) => {
  const kiClient = {
    getStreamToQueryLinksMap: jest.fn().mockResolvedValue({ 'logs.test': existingLinks }),
    getDefaultExpiresAt: jest.fn().mockReturnValue(MOCK_DEFAULT_EXPIRES_AT),
    bulk: jest.fn().mockResolvedValue({ applied: 1, skipped: 0 }),
    syncQueries: jest.fn().mockResolvedValue(undefined),
    replaceStreamQueries: jest.fn(
      async (
        def: Streams.all.Definition,
        getNextQueries: (links: QueryLink[]) => StreamQuery[]
      ) => {
        await kiClient.syncQueries(def, getNextQueries(existingLinks));
      }
    ),
  } as unknown as jest.Mocked<KnowledgeIndicatorClient>;

  const streamsClient = {
    getStream: jest.fn().mockResolvedValue(definition),
  } as unknown as jest.Mocked<StreamsClient>;

  return { kiClient, streamsClient };
};

const persistDeps = (
  kiClient: jest.Mocked<KnowledgeIndicatorClient>,
  streamsClient: jest.Mocked<StreamsClient>
) => ({
  kiClient,
  streamsClient,
});

describe('persistQueries', () => {
  it('does nothing when queries array is empty', async () => {
    const { kiClient, streamsClient } = createMocks();
    await persistQueries('logs.test', [], persistDeps(kiClient, streamsClient));

    expect(streamsClient.getStream).not.toHaveBeenCalled();
    expect(kiClient.bulk).not.toHaveBeenCalled();
    expect(kiClient.syncQueries).not.toHaveBeenCalled();
  });

  it('creates low-severity queries via kiClient.bulk with rule_backed: false', async () => {
    const { kiClient, streamsClient } = createMocks();
    const query = makeGeneratedQuery();

    await persistQueries('logs.test', [query], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).toHaveBeenCalledTimes(1);
    expect(kiClient.bulk).toHaveBeenCalledWith('logs.test', [
      expect.objectContaining({
        index: expect.objectContaining({
          query: expect.objectContaining({ id: 'generated-uuid', rule_backed: false }),
        }),
      }),
    ]);
    expect(kiClient.syncQueries).not.toHaveBeenCalled();
  });

  it('skips queries whose normalized ES|QL matches an existing stored query', async () => {
    const existing = makeLink({ id: 'q1', esql: 'FROM logs | WHERE body.text:"error"' });
    const { kiClient, streamsClient } = createMocks([existing]);

    const duplicate = makeGeneratedQuery({
      esql: { query: 'FROM  logs  |  WHERE  body.text:"error"' },
    });

    await persistQueries('logs.test', [duplicate], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).not.toHaveBeenCalled();
    expect(kiClient.syncQueries).not.toHaveBeenCalled();
  });

  it('deduplicates within a single batch (intra-batch dedup)', async () => {
    const { kiClient, streamsClient } = createMocks();

    const q1 = makeGeneratedQuery({
      title: 'First',
      esql: { query: 'FROM logs | WHERE body.text:"timeout"' },
    });
    const q2 = makeGeneratedQuery({
      title: 'Second (duplicate)',
      esql: { query: 'FROM logs | WHERE body.text:"timeout"' },
    });

    await persistQueries('logs.test', [q1, q2], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).toHaveBeenCalledTimes(1);
    const ops = (kiClient.bulk as jest.Mock).mock.calls[0][1];
    expect(ops).toHaveLength(1);
    expect(ops[0].index.query.title).toBe('First');
  });

  it('deduplicates commutative AND reorderings against existing', async () => {
    const existing = makeLink({
      id: 'q1',
      esql: 'FROM logs | WHERE body.text:"timeout" AND body.text:"connection"',
    });
    const { kiClient, streamsClient } = createMocks([existing]);

    const reordered = makeGeneratedQuery({
      esql: { query: 'FROM logs | WHERE body.text:"connection" AND body.text:"timeout"' },
    });

    await persistQueries('logs.test', [reordered], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).not.toHaveBeenCalled();
    expect(kiClient.syncQueries).not.toHaveBeenCalled();
  });

  it('routes replaces for non-rule-backed queries to bulk with rule_backed: false', async () => {
    const existing = makeLink({ id: 'q1', ruleBacked: false });
    const { kiClient, streamsClient } = createMocks([existing]);

    const replacement = makeGeneratedQuery({
      replaces: 'q1',
      esql: { query: 'FROM logs | WHERE body.text:"new-error"' },
    });

    await persistQueries('logs.test', [replacement], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).toHaveBeenCalledTimes(1);
    expect(kiClient.bulk).toHaveBeenCalledWith('logs.test', [
      expect.objectContaining({
        index: expect.objectContaining({
          query: expect.objectContaining({ id: 'q1', rule_backed: false }),
        }),
      }),
    ]);
    expect(kiClient.syncQueries).not.toHaveBeenCalled();
  });

  it('routes replaces for rule-backed queries through syncQueries', async () => {
    const existing = makeLink({ id: 'q1', ruleBacked: true });
    const { kiClient, streamsClient } = createMocks([existing]);

    const replacement = makeGeneratedQuery({
      replaces: 'q1',
      esql: { query: 'FROM logs | WHERE body.text:"updated-error"' },
    });

    await persistQueries('logs.test', [replacement], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).not.toHaveBeenCalled();
    expect(kiClient.syncQueries).toHaveBeenCalledTimes(1);
    const [defArg, queriesArg] = (kiClient.syncQueries as jest.Mock).mock.calls[0];
    expect(defArg).toBe(definition);
    expect(queriesArg).toHaveLength(1);
    expect(queriesArg[0].id).toBe('q1');
  });

  it('falls through to new query when replaces targets a nonexistent ID', async () => {
    const { kiClient, streamsClient } = createMocks();

    const query = makeGeneratedQuery({
      replaces: 'nonexistent-id',
      esql: { query: 'FROM logs | WHERE body.text:"fallback"' },
    });

    await persistQueries('logs.test', [query], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).toHaveBeenCalledTimes(1);
    const ops = (kiClient.bulk as jest.Mock).mock.calls[0][1];
    expect(ops[0].index.query.id).toBe('generated-uuid');
  });

  it('skips replaces when the replacement ES|QL matches the existing query exactly', async () => {
    const existing = makeLink({
      id: 'q1',
      esql: 'FROM logs | WHERE body.text:"error"',
    });
    const { kiClient, streamsClient } = createMocks([existing]);

    const noOpReplace = makeGeneratedQuery({
      replaces: 'q1',
      esql: { query: 'FROM logs | WHERE body.text:"error"' },
    });

    await persistQueries('logs.test', [noOpReplace], persistDeps(kiClient, streamsClient));

    expect(kiClient.bulk).not.toHaveBeenCalled();
    expect(kiClient.syncQueries).not.toHaveBeenCalled();
  });

  describe('resolveExpiresAt invariant', () => {
    it('assigns defaultExpiresAt to brand-new queries', async () => {
      const { kiClient, streamsClient } = createMocks();
      const query = makeGeneratedQuery({ severity_score: 30 });

      await persistQueries('logs.test', [query], { kiClient, streamsClient });

      const ops = (kiClient.bulk as jest.Mock).mock.calls[0][1];
      expect(ops[0].index.query.expires_at).toBe(MOCK_DEFAULT_EXPIRES_AT);
    });

    it('assigns defaultExpiresAt when replacing a managed (expiring) prior', async () => {
      const managedPrior = makeLink({
        id: 'q1',
        ruleBacked: false,
        expiresAt: '2025-01-01T00:00:00.000Z',
      });
      const { kiClient, streamsClient } = createMocks([managedPrior]);

      const replacement = makeGeneratedQuery({
        replaces: 'q1',
        severity_score: 30,
        esql: { query: 'FROM logs | WHERE body.text:"new"' },
      });

      await persistQueries('logs.test', [replacement], { kiClient, streamsClient });

      const ops = (kiClient.bulk as jest.Mock).mock.calls[0][1];
      expect(ops[0].index.query.expires_at).toBe(MOCK_DEFAULT_EXPIRES_AT);
    });

    it('preserves durable status when replacing a prior with no expiry', async () => {
      const durablePrior = makeLink({ id: 'q1', ruleBacked: false });
      const { kiClient, streamsClient } = createMocks([durablePrior]);

      const replacement = makeGeneratedQuery({
        replaces: 'q1',
        severity_score: 30,
        esql: { query: 'FROM logs | WHERE body.text:"new"' },
      });

      await persistQueries('logs.test', [replacement], { kiClient, streamsClient });

      const ops = (kiClient.bulk as jest.Mock).mock.calls[0][1];
      expect(ops[0].index.query.expires_at).toBeUndefined();
    });
  });

  describe('rule-eligible queries (severity >= 60, non-STATS)', () => {
    it('routes new high-severity queries through syncQueries', async () => {
      const { kiClient, streamsClient } = createMocks();
      const query = makeGeneratedQuery({ severity_score: 75, type: 'match' });

      await persistQueries('logs.test', [query], persistDeps(kiClient, streamsClient));

      expect(kiClient.syncQueries).toHaveBeenCalledTimes(1);
      expect(kiClient.bulk).not.toHaveBeenCalled();
      const queriesArg = (kiClient.syncQueries as jest.Mock).mock.calls[0][1];
      expect(queriesArg).toHaveLength(1);
      expect(queriesArg[0].id).toBe('generated-uuid');
    });

    it('routes new high-severity STATS queries to bulk (no rules)', async () => {
      const { kiClient, streamsClient } = createMocks();
      const query = makeGeneratedQuery({ severity_score: 90, type: 'stats' });

      await persistQueries('logs.test', [query], persistDeps(kiClient, streamsClient));

      expect(kiClient.bulk).toHaveBeenCalledTimes(1);
      expect(kiClient.syncQueries).not.toHaveBeenCalled();
      const ops = (kiClient.bulk as jest.Mock).mock.calls[0][1];
      expect(ops[0].index.query.id).toBe('generated-uuid');
    });

    it('creates rules at the exact threshold boundary (severity_score = 60)', async () => {
      const { kiClient, streamsClient } = createMocks();
      const query = makeGeneratedQuery({ severity_score: 60, type: 'match' });

      await persistQueries('logs.test', [query], persistDeps(kiClient, streamsClient));

      expect(kiClient.syncQueries).toHaveBeenCalledTimes(1);
      expect(kiClient.bulk).not.toHaveBeenCalled();
    });

    it('issues bulk and syncQueries calls when standard and rule-eligible ops coexist', async () => {
      const ruleBacked = makeLink({
        id: 'q1',
        esql: 'FROM logs | WHERE body.text:"old"',
        ruleBacked: true,
      });
      const { kiClient, streamsClient } = createMocks([ruleBacked]);

      const lowSevNew = makeGeneratedQuery({
        title: 'Low sev',
        severity_score: 30,
        esql: { query: 'FROM logs | WHERE body.text:"low"' },
      });
      const highSevNew = makeGeneratedQuery({
        title: 'High sev',
        severity_score: 80,
        esql: { query: 'FROM logs | WHERE body.text:"high"' },
      });
      const replaceRuleBacked = makeGeneratedQuery({
        replaces: 'q1',
        esql: { query: 'FROM logs | WHERE body.text:"replaced"' },
      });

      await persistQueries(
        'logs.test',
        [lowSevNew, highSevNew, replaceRuleBacked],
        persistDeps(kiClient, streamsClient)
      );

      expect(kiClient.bulk).toHaveBeenCalledTimes(1);
      const bulkOps = (kiClient.bulk as jest.Mock).mock.calls[0][1];
      expect(bulkOps).toHaveLength(1);

      expect(kiClient.syncQueries).toHaveBeenCalledTimes(1);
      const syncQueries = (kiClient.syncQueries as jest.Mock).mock.calls[0][1];
      expect(syncQueries).toHaveLength(2);
    });

    it('passes existing unbacked low-severity queries to syncQueries alongside new high-severity queries', async () => {
      const existingLow = makeLink({
        id: 'low-existing',
        severity_score: 25,
        esql: 'FROM logs | WHERE body.text:"startup"',
        ruleBacked: false,
      });
      const { kiClient, streamsClient } = createMocks([existingLow]);

      const highSevNew = makeGeneratedQuery({
        title: 'High sev',
        severity_score: 80,
        esql: { query: 'FROM logs | WHERE body.text:"oom"' },
      });

      await persistQueries('logs.test', [highSevNew], persistDeps(kiClient, streamsClient));

      expect(kiClient.bulk).not.toHaveBeenCalled();
      expect(kiClient.syncQueries).toHaveBeenCalledTimes(1);
      const syncQueries = (kiClient.syncQueries as jest.Mock).mock.calls[0][1];
      expect(syncQueries).toHaveLength(2);
      expect(syncQueries.map((q: StreamQuery) => q.id).sort()).toEqual([
        'generated-uuid',
        'low-existing',
      ]);
    });
  });
});
