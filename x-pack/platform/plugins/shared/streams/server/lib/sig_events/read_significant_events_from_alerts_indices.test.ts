/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { TransportResult } from '@elastic/elasticsearch';
import type { IScopedClusterClient } from '@kbn/core/server';
import type { QueryLink } from '@kbn/streams-schema';
import { SecurityError } from '../streams/errors/security_error';
import type { KnowledgeIndicatorClient } from '../streams/ki';
import {
  buildQueryOccurrences,
  computeOccurrences,
  getQueryOccurrences,
  readSignificantEventsFromAlertsIndices,
} from './read_significant_events_from_alerts_indices';

const makeQueryLink = (overrides: Partial<QueryLink> & { id?: string } = {}): QueryLink => {
  const id = overrides.id ?? 'q1';
  const { id: _id, ...rest } = overrides;
  return {
    query: {
      id,
      type: 'match',
      title: 'Test query',
      description: 'desc',
      esql: { query: 'FROM logs | WHERE body.text:"error"' },
      severity_score: 60,
    },
    stream_name: 'logs.test',
    rule_backed: true,
    rule_id: `rule-${id}`,
    ...rest,
  };
};

interface Mocks {
  kiClient: jest.Mocked<KnowledgeIndicatorClient>;
  scopedClusterClient: jest.Mocked<IScopedClusterClient>;
  esqlQuery: jest.Mock;
}

const createMocks = (queryLinks: QueryLink[] = []): Mocks => {
  const esqlQuery = jest.fn();
  const scopedClusterClient = {
    asCurrentUser: {
      esql: { query: esqlQuery },
    },
  } as unknown as jest.Mocked<IScopedClusterClient>;

  const kiClient = {
    getQueryLinks: jest.fn().mockResolvedValue(queryLinks),
    findQueries: jest.fn().mockResolvedValue(queryLinks),
  } as unknown as jest.Mocked<KnowledgeIndicatorClient>;

  return { kiClient, scopedClusterClient, esqlQuery };
};

const makeEsError = (status: number, type: string, reason: string) =>
  new errors.ResponseError({
    statusCode: status,
    headers: {},
    warnings: [],
    meta: {} as unknown as TransportResult['meta'],
    body: { error: { type, reason } },
  } as TransportResult);

const makeStatsResponse = (rows: Array<{ rule_uuid: string; bucket: string; count: number }>) => ({
  columns: [
    { name: 'count', type: 'long' as const },
    { name: 'rule_uuid', type: 'keyword' as const },
    { name: 'bucket', type: 'date' as const },
  ],
  values: rows.map((r) => [r.count, r.rule_uuid, r.bucket]),
  took: 0,
});

const FROM = new Date('2026-01-01T00:00:00.000Z');
const TO = new Date('2026-01-01T00:05:00.000Z'); // 5 minutes => 6 buckets at 1m incl. boundaries
const BUCKET = '1m';

describe('readSignificantEventsFromAlertsIndices', () => {
  it('returns an empty response and skips ES|QL when there are no query links', async () => {
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([]);

    const result = await readSignificantEventsFromAlertsIndices(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    expect(result).toEqual({ significant_events: [], aggregated_occurrences: [] });
    expect(esqlQuery).not.toHaveBeenCalled();
  });

  it('groups ES|QL rows into per-rule occurrences with gap filling', async () => {
    const linkA = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const linkB = makeQueryLink({ id: 'qb', rule_id: 'rule-b' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([linkA, linkB]);

    esqlQuery.mockResolvedValueOnce(
      makeStatsResponse([
        { rule_uuid: 'rule-a', bucket: '2026-01-01T00:00:00.000Z', count: 2 },
        { rule_uuid: 'rule-a', bucket: '2026-01-01T00:02:00.000Z', count: 1 },
        { rule_uuid: 'rule-b', bucket: '2026-01-01T00:04:00.000Z', count: 3 },
      ])
    );

    const result = await readSignificantEventsFromAlertsIndices(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    const ruleA = result.significant_events.find(
      (e) => e.stream_name === 'logs.test' && e.id === 'qa'
    )!;
    const ruleB = result.significant_events.find((e) => e.id === 'qb')!;

    // 6 buckets at 1m across [00:00, 00:05] inclusive
    expect(ruleA.occurrences).toHaveLength(6);
    expect(ruleA.occurrences.map((o) => o.count)).toEqual([2, 0, 1, 0, 0, 0]);
    expect(ruleB.occurrences).toHaveLength(6);
    expect(ruleB.occurrences.map((o) => o.count)).toEqual([0, 0, 0, 0, 3, 0]);
  });

  it('emits an empty occurrences array (not a zero-filled series) for rules absent from the result', async () => {
    const linkFiring = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const linkSilent = makeQueryLink({ id: 'qb', rule_id: 'rule-b' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([linkFiring, linkSilent]);

    esqlQuery.mockResolvedValueOnce(
      makeStatsResponse([{ rule_uuid: 'rule-a', bucket: '2026-01-01T00:01:00.000Z', count: 1 }])
    );

    const result = await readSignificantEventsFromAlertsIndices(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    const ruleA = result.significant_events.find((e) => e.id === 'qa')!;
    const ruleB = result.significant_events.find((e) => e.id === 'qb')!;

    expect(ruleA.occurrences).toHaveLength(6);
    expect(ruleB.occurrences).toEqual([]);
  });

  it('produces aggregated_occurrences summing per-bucket counts across all rules', async () => {
    const linkA = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const linkB = makeQueryLink({ id: 'qb', rule_id: 'rule-b' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([linkA, linkB]);

    esqlQuery.mockResolvedValueOnce(
      makeStatsResponse([
        { rule_uuid: 'rule-a', bucket: '2026-01-01T00:00:00.000Z', count: 2 },
        { rule_uuid: 'rule-b', bucket: '2026-01-01T00:00:00.000Z', count: 3 },
        { rule_uuid: 'rule-a', bucket: '2026-01-01T00:02:00.000Z', count: 1 },
      ])
    );

    const result = await readSignificantEventsFromAlertsIndices(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    expect(result.aggregated_occurrences.map((b) => b.count)).toEqual([5, 0, 1, 0, 0, 0]);
  });

  it('returns an empty response when the alerts index is missing (verification_exception)', async () => {
    const link = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([link]);

    esqlQuery.mockRejectedValueOnce(
      makeEsError(400, 'verification_exception', 'Unknown index [.alerts-streams.alerts-default]')
    );

    const result = await readSignificantEventsFromAlertsIndices(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    expect(result.significant_events).toHaveLength(1);
    expect(result.significant_events[0].occurrences).toEqual([]);
    expect(result.aggregated_occurrences).toEqual([]);
  });

  it('rethrows non-Unknown-index verification_exception (e.g. unknown column)', async () => {
    const link = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([link]);

    // Simulates an ES|QL regression — unknown column, malformed query, mapping
    // mismatch. Must NOT be silently swallowed as "alerts index missing".
    esqlQuery.mockRejectedValueOnce(
      makeEsError(400, 'verification_exception', 'Unknown column [kibana.alert.rule.bogus_field]')
    );

    await expect(
      readSignificantEventsFromAlertsIndices(
        { from: FROM, to: TO, bucketSize: BUCKET },
        { kiClient, scopedClusterClient }
      )
    ).rejects.toThrow(/verification_exception|Unknown column/);
  });

  it('rethrows security_exception as SecurityError with the underlying cause attached', async () => {
    const link = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([link]);

    const cause = makeEsError(403, 'security_exception', 'missing privileges');
    esqlQuery.mockRejectedValueOnce(cause);

    await expect(
      readSignificantEventsFromAlertsIndices(
        { from: FROM, to: TO, bucketSize: BUCKET },
        { kiClient, scopedClusterClient }
      )
    ).rejects.toBeInstanceOf(SecurityError);
  });

  it('rethrows unexpected errors (not security or verification exceptions)', async () => {
    const link = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([link]);

    const boom = new Error('cluster meltdown');
    esqlQuery.mockRejectedValueOnce(boom);

    await expect(
      readSignificantEventsFromAlertsIndices(
        { from: FROM, to: TO, bucketSize: BUCKET },
        { kiClient, scopedClusterClient }
      )
    ).rejects.toThrow('cluster meltdown');
  });

  it('returns the empty response shape when expected ES|QL columns are missing', async () => {
    const link = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([link]);

    // Simulate a future schema regression where `rule_uuid` is renamed/missing.
    esqlQuery.mockResolvedValueOnce({
      columns: [
        { name: 'count', type: 'long' as const },
        { name: 'bucket', type: 'date' as const },
      ],
      values: [[1, '2026-01-01T00:00:00.000Z']],
      took: 0,
    });

    const result = await readSignificantEventsFromAlertsIndices(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    expect(result.significant_events).toHaveLength(1);
    expect(result.significant_events[0].occurrences).toEqual([]);
    expect(result.aggregated_occurrences).toEqual([]);
  });

  it('getQueryOccurrences keeps per-rule buckets sparse and gap-fills only the aggregate', async () => {
    const linkA = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const linkB = makeQueryLink({ id: 'qb', rule_id: 'rule-b' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([linkA, linkB]);

    esqlQuery.mockResolvedValueOnce(
      makeStatsResponse([
        { rule_uuid: 'rule-a', bucket: '2026-01-01T00:00:00.000Z', count: 2 },
        { rule_uuid: 'rule-a', bucket: '2026-01-01T00:02:00.000Z', count: 1 },
      ])
    );

    const queryOccurrences = await getQueryOccurrences(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    // Sparse: only the two firing buckets, no zero-filled gaps.
    expect(queryOccurrences.sparseByRule.get('rule-a')).toEqual([
      { date: '2026-01-01T00:00:00.000Z', count: 2 },
      { date: '2026-01-01T00:02:00.000Z', count: 1 },
    ]);
    expect(queryOccurrences.sparseByRule.has('rule-b')).toBe(false);
    // Aggregate is gap-filled to the full 6-bucket window.
    expect(queryOccurrences.aggregatedOccurrences.map((b) => b.count)).toEqual([2, 0, 1, 0, 0, 0]);
  });

  it('buildQueryOccurrences gap-fills a firing rule and returns [] for a silent rule', async () => {
    const linkA = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const linkSilent = makeQueryLink({ id: 'qb', rule_id: 'rule-b' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([linkA, linkSilent]);

    esqlQuery.mockResolvedValueOnce(
      makeStatsResponse([{ rule_uuid: 'rule-a', bucket: '2026-01-01T00:01:00.000Z', count: 5 }])
    );

    const queryOccurrences = await getQueryOccurrences(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    expect(
      buildQueryOccurrences({ queryLink: linkA, queryOccurrences }).map((b) => b.count)
    ).toEqual([0, 5, 0, 0, 0, 0]);
    expect(buildQueryOccurrences({ queryLink: linkSilent, queryOccurrences })).toEqual([]);
  });

  it('converts route-style bucket sizes ("1m") into ES|QL units ("minutes") in the rendered query', async () => {
    const link = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([link]);

    esqlQuery.mockResolvedValueOnce(makeStatsResponse([]));

    await readSignificantEventsFromAlertsIndices(
      { from: FROM, to: TO, bucketSize: '1m' },
      { kiClient, scopedClusterClient }
    );

    expect(esqlQuery).toHaveBeenCalledTimes(1);
    const calledWith = esqlQuery.mock.calls[0][0] as { query: string };
    expect(calledWith.query).toEqual(expect.stringContaining('minutes'));
    expect(calledWith.query).not.toMatch(/BUCKET\([^)]*1m\)/);
  });

  it('appends an explicit LIMIT (rules × buckets) to the rendered query', async () => {
    const linkA = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const linkB = makeQueryLink({ id: 'qb', rule_id: 'rule-b' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([linkA, linkB]);

    esqlQuery.mockResolvedValueOnce(makeStatsResponse([]));

    await getQueryOccurrences(
      { from: FROM, to: TO, bucketSize: BUCKET },
      { kiClient, scopedClusterClient }
    );

    // 2 rules × 6 buckets = 12.
    const calledWith = esqlQuery.mock.calls[0][0] as { query: string };
    expect(calledWith.query).toMatch(/LIMIT 12\b/);
  });

  it('batches rules across parallel requests so none are dropped by the row cap', async () => {
    const linkA = makeQueryLink({ id: 'qa', rule_id: 'rule-a' });
    const linkB = makeQueryLink({ id: 'qb', rule_id: 'rule-b' });
    const linkC = makeQueryLink({ id: 'qc', rule_id: 'rule-c' });
    const { kiClient, scopedClusterClient, esqlQuery } = createMocks([linkA, linkB, linkC]);

    // ~6001 buckets → one rule fits per request → one request per rule, merged.
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-05T04:00:00.000Z'); // +6000 minutes
    esqlQuery
      .mockResolvedValueOnce(
        makeStatsResponse([{ rule_uuid: 'rule-a', bucket: from.toISOString(), count: 1 }])
      )
      .mockResolvedValueOnce(
        makeStatsResponse([{ rule_uuid: 'rule-b', bucket: from.toISOString(), count: 2 }])
      )
      .mockResolvedValueOnce(
        makeStatsResponse([{ rule_uuid: 'rule-c', bucket: from.toISOString(), count: 3 }])
      );

    const queryOccurrences = await getQueryOccurrences(
      { from, to, bucketSize: '1m' },
      { kiClient, scopedClusterClient }
    );

    expect(esqlQuery).toHaveBeenCalledTimes(3);
    expect([...queryOccurrences.sparseByRule.keys()].sort()).toEqual([
      'rule-a',
      'rule-b',
      'rule-c',
    ]);
  });

  it('computeOccurrences queries only the rule ids it is given (page-scoping)', async () => {
    const { scopedClusterClient, esqlQuery } = createMocks();
    esqlQuery.mockResolvedValueOnce(makeStatsResponse([]));

    await computeOccurrences(
      { ruleIds: ['rule-a'], from: FROM, to: TO, bucketSize: BUCKET },
      { scopedClusterClient }
    );

    const calledWith = esqlQuery.mock.calls[0][0] as { query: string };
    expect(calledWith.query).toContain('rule-a');
    expect(calledWith.query).not.toContain('rule-b');
  });

  it('computeOccurrences skips ES|QL entirely when given no rule ids', async () => {
    const { scopedClusterClient, esqlQuery } = createMocks();

    const result = await computeOccurrences(
      { ruleIds: [], from: FROM, to: TO, bucketSize: BUCKET },
      { scopedClusterClient }
    );

    expect(esqlQuery).not.toHaveBeenCalled();
    expect(result.sparseByRule.size).toBe(0);
    expect(result.aggregatedOccurrences).toEqual([]);
  });
});
