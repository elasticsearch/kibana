/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { HuntForThreatResult } from './hunt_for_threat';
import {
  buildHuntFeedbackDoc,
  computeBoost,
  resolveHuntFeedbackTarget,
  writeHuntFeedback,
  writeHuntFeedbackSafe,
} from './write_hunt_feedback';

const FIXED_NOW = new Date('2026-05-14T12:00:00.000Z');

const tier1Hits = (overrides?: Partial<HuntForThreatResult>): HuntForThreatResult => ({
  status: 'environment_hits_found',
  report_id: 'report-1',
  searched_iocs: 4,
  searched_techniques: 2,
  time_range: { from: '2026-04-14T00:00:00Z', to: '2026-05-14T00:00:00Z' },
  counts: { total_hits: 7, returned_hits: 7, affected_hosts: 3, affected_users: 2 },
  hits: [],
  affected_assets: { hosts: [], users: [] },
  per_index: [],
  next_step: 'render…',
  ...overrides,
});

const tier1NoHits = (): HuntForThreatResult => ({
  status: 'no_environment_hits',
  report_id: 'report-1',
  searched_iocs: 4,
  searched_techniques: 0,
  time_range: { from: '2026-04-14T00:00:00Z', to: '2026-05-14T00:00:00Z' },
  counts: { total_hits: 0, returned_hits: 0, affected_hosts: 0, affected_users: 0 },
  hits: [],
  affected_assets: { hosts: [], users: [] },
  per_index: [],
  next_step: 'no hits…',
});

const tier1NoSearchableInput = (): HuntForThreatResult => ({
  status: 'no_searchable_input',
  searched_iocs: 0,
  searched_techniques: 0,
  counts: { total_hits: 0, returned_hits: 0, affected_hosts: 0, affected_users: 0 },
  hits: [],
  affected_assets: { hosts: [], users: [] },
  per_index: [],
  next_step: 'no input…',
});

describe('computeBoost', () => {
  it('returns 0 for zero hits', () => {
    expect(computeBoost(0, 0)).toBe(0);
  });

  it('is monotone non-decreasing with IOC hits', () => {
    const b1 = computeBoost(1, 0);
    const b10 = computeBoost(10, 0);
    const b100 = computeBoost(100, 0);
    expect(b10).toBeGreaterThan(b1);
    expect(b100).toBeGreaterThanOrEqual(b10);
  });

  it('clamps to the documented 0.5 ceiling for large hit counts', () => {
    expect(computeBoost(100_000, 100_000)).toBeLessThanOrEqual(0.5);
    expect(computeBoost(100_000, 100_000)).toBeCloseTo(0.5, 5);
  });

  it('weights IOC hits more heavily than TTP hits', () => {
    expect(computeBoost(5, 0)).toBeGreaterThan(computeBoost(0, 5));
  });

  it('treats negative hit counts as zero (defensive)', () => {
    expect(computeBoost(-5, -5)).toBe(0);
  });

  it('returns 0 when inputs are NaN', () => {
    expect(computeBoost(Number.NaN, Number.NaN)).toBe(0);
  });
});

describe('buildHuntFeedbackDoc', () => {
  const target = { index: '.ds-.kibana-threat-reports-000001', id: 'report-1' };

  it('records every counter and the wall-clock', () => {
    const doc = buildHuntFeedbackDoc({
      target,
      tier1: tier1Hits(),
      now: FIXED_NOW,
    });
    expect(doc.feedback).toEqual({
      ioc_hit_count: 7,
      ttp_hit_count: 7, // searched_techniques > 0 → upper-bound = total_hits
      affected_host_count: 3,
      affected_user_count: 2,
      last_hunted_at: FIXED_NOW.toISOString(),
      last_hunt_status: 'environment_hits_found',
      last_hunt_window: { from: '2026-04-14T00:00:00Z', to: '2026-05-14T00:00:00Z' },
    });
  });

  it('treats searched_techniques=0 as ttp_hit_count=0 to avoid inflating the boost', () => {
    const doc = buildHuntFeedbackDoc({
      target,
      tier1: tier1Hits({ searched_techniques: 0 }),
      now: FIXED_NOW,
    });
    expect(doc.feedback.ttp_hit_count).toBe(0);
  });

  it('omits last_hunt_window when Tier 1 returned no time_range', () => {
    const doc = buildHuntFeedbackDoc({
      target,
      tier1: tier1NoSearchableInput(),
      now: FIXED_NOW,
    });
    expect(doc.feedback.last_hunt_window).toBeUndefined();
    expect(doc.feedback.last_hunt_status).toBe('no_searchable_input');
  });

  it('omits corroborated_rank_score when the base rank_score is unknown', () => {
    const doc = buildHuntFeedbackDoc({
      target,
      tier1: tier1Hits(),
      now: FIXED_NOW,
    });
    expect(doc.corroborated_rank_score).toBeUndefined();
  });

  it('computes corroborated_rank_score = rank_score * (1 + boost) when rank_score is provided', () => {
    const doc = buildHuntFeedbackDoc({
      target: { ...target, rank_score: 0.4 },
      tier1: tier1Hits({
        counts: { total_hits: 10, returned_hits: 10, affected_hosts: 2, affected_users: 2 },
      }),
      now: FIXED_NOW,
    });
    const expectedBoost = computeBoost(10, 10);
    expect(doc.corroborated_rank_score).toBeCloseTo(0.4 * (1 + expectedBoost), 6);
  });

  it('is byte-identical to rank_score when no environment hits matched', () => {
    const doc = buildHuntFeedbackDoc({
      target: { ...target, rank_score: 0.4 },
      tier1: tier1NoHits(),
      now: FIXED_NOW,
    });
    expect(doc.corroborated_rank_score).toBeCloseTo(0.4, 6);
    expect(doc.feedback.ioc_hit_count).toBe(0);
  });

  it('caps corroborated_rank_score at 1.5x the base rank_score', () => {
    const doc = buildHuntFeedbackDoc({
      target: { ...target, rank_score: 0.6 },
      tier1: tier1Hits({
        counts: {
          total_hits: 1_000_000,
          returned_hits: 1_000_000,
          affected_hosts: 1,
          affected_users: 1,
        },
      }),
      now: FIXED_NOW,
    });
    expect(doc.corroborated_rank_score).toBeLessThanOrEqual(0.6 * 1.5 + 1e-9);
    expect(doc.corroborated_rank_score).toBeCloseTo(0.6 * 1.5, 5);
  });

  it('floors negative counters to zero before boosting', () => {
    const doc = buildHuntFeedbackDoc({
      target: { ...target, rank_score: 0.4 },
      tier1: tier1Hits({
        counts: { total_hits: -5, returned_hits: 0, affected_hosts: -1, affected_users: -1 },
      }),
      now: FIXED_NOW,
    });
    expect(doc.feedback.ioc_hit_count).toBe(0);
    expect(doc.feedback.affected_host_count).toBe(0);
    expect(doc.feedback.affected_user_count).toBe(0);
    expect(doc.corroborated_rank_score).toBeCloseTo(0.4, 6);
  });
});

describe('writeHuntFeedback', () => {
  it('issues an _update with the partial doc against the resolved backing index', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    const logger = loggingSystemMock.createLogger();
    await writeHuntFeedback(esClient, logger, {
      target: { index: '.ds-foo-000001', id: 'report-1', rank_score: 0.4 },
      tier1: tier1Hits(),
      now: FIXED_NOW,
    });
    expect(esClient.update).toHaveBeenCalledTimes(1);
    const [arg] = esClient.update.mock.calls[0];
    expect(arg.index).toBe('.ds-foo-000001');
    expect(arg.id).toBe('report-1');
    expect(arg.doc).toBeDefined();
    // `doc` is typed as `unknown` on the wire schema — cast through the
    // helper's return type so the assertions are precise without
    // re-exporting an internal shape.
    const wireDoc = arg.doc as {
      feedback: { ioc_hit_count: number };
      corroborated_rank_score?: number;
    };
    expect(wireDoc.feedback.ioc_hit_count).toBe(7);
    expect(typeof wireDoc.corroborated_rank_score).toBe('number');
  });

  it('propagates ES errors to the caller', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.update.mockRejectedValueOnce(new Error('version_conflict_engine_exception'));
    const logger = loggingSystemMock.createLogger();
    await expect(
      writeHuntFeedback(esClient, logger, {
        target: { index: '.ds-foo-000001', id: 'report-1' },
        tier1: tier1Hits(),
      })
    ).rejects.toThrow(/version_conflict_engine_exception/);
  });
});

describe('writeHuntFeedbackSafe', () => {
  it('swallows ES errors and logs a warning instead of throwing', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.update.mockRejectedValueOnce(new Error('boom'));
    const logger = loggingSystemMock.createLogger();
    await expect(
      writeHuntFeedbackSafe(esClient, logger, {
        target: { index: '.ds-foo-000001', id: 'report-1' },
        tier1: tier1Hits(),
      })
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toContain('report-1');
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toContain('boom');
  });
});

describe('resolveHuntFeedbackTarget', () => {
  it('returns { index, id, rank_score } from the first matching hit', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.search.mockResolvedValueOnce({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: 1, relation: 'eq' },
        max_score: 1,
        hits: [
          {
            _index: '.ds-.kibana-threat-reports-000001',
            _id: 'report-1',
            _score: 1,
            _source: { rank_score: 0.42 },
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof esClient.search>>);

    const target = await resolveHuntFeedbackTarget(esClient, 'report-1', 'default');
    expect(target).toEqual({
      index: '.ds-.kibana-threat-reports-000001',
      id: 'report-1',
      rank_score: 0.42,
    });
  });

  it('returns undefined when no document matches', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.search.mockResolvedValueOnce({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: 0, relation: 'eq' },
        max_score: null,
        hits: [],
      },
    } as unknown as Awaited<ReturnType<typeof esClient.search>>);
    const target = await resolveHuntFeedbackTarget(esClient, 'missing-report', 'default');
    expect(target).toBeUndefined();
  });

  it('omits rank_score when the source document does not carry one', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.search.mockResolvedValueOnce({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: 1, relation: 'eq' },
        max_score: 1,
        hits: [
          {
            _index: '.ds-.kibana-threat-reports-000002',
            _id: 'legacy-report',
            _score: 1,
            _source: {},
          },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof esClient.search>>);
    const target = await resolveHuntFeedbackTarget(esClient, 'legacy-report', 'default');
    expect(target).toEqual({
      index: '.ds-.kibana-threat-reports-000002',
      id: 'legacy-report',
      rank_score: undefined,
    });
  });
});
