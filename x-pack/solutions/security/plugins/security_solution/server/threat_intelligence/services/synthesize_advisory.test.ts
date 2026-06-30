/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { synthesizeAdvisory } from './synthesize_advisory';

const TIME_RANGE = { from: '2026-04-14T00:00:00Z', to: '2026-05-14T00:00:00Z' } as const;

interface MockHit {
  _id: string;
  _index?: string;
  threat_actors?: string[];
  categories?: string[];
  regions?: string[];
  title?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  techniques?: string[];
  iocHits?: number;
  rank_score?: number;
  corroborated_rank_score?: number;
}

/**
 * Build an ES client whose `_search` returns the supplied hits as a
 * canonical threat-reports search response. The orchestrator does one
 * search (top-N reports) so a single mocked response is enough; the
 * persist branch adds a second `_index` call that we mock separately.
 */
const buildEsClient = (hits: MockHit[]) => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.search.mockResolvedValue({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: { value: hits.length, relation: 'eq' },
      max_score: hits.length > 0 ? 1 : null,
      hits: hits.map((hit) => ({
        _index: hit._index ?? '.ds-.kibana-threat-reports-000001',
        _id: hit._id,
        _score: 1,
        _source: {
          '@timestamp': '2026-05-10T00:00:00Z',
          source: { type: 'rss', name: 'Vendor X' },
          content: { title: hit.title ?? `report-${hit._id}` },
          severity: { level: hit.severity ?? 'high', score: 0.7 },
          rank_score: hit.rank_score ?? 0.5,
          corroborated_rank_score: hit.corroborated_rank_score ?? 0.55,
          extracted: {
            threat_actors: hit.threat_actors,
            categories: hit.categories,
            ttps: { techniques: hit.techniques },
          },
          geography: { regions: hit.regions },
          feedback: { ioc_hit_count: hit.iocHits ?? 0 },
        },
      })),
    },
  } as unknown as Awaited<ReturnType<typeof esClient.search>>);
  esClient.index.mockResolvedValue({
    _index: '.kibana-threat-intel-advisories',
    _id: 'advisory-123',
    _version: 1,
    result: 'created',
    _shards: { total: 1, successful: 1, failed: 0 },
    _seq_no: 0,
    _primary_term: 1,
  } as unknown as Awaited<ReturnType<typeof esClient.index>>);
  return esClient;
};

const buildModel = (
  output: { theme_title: string; narrative_markdown: string; recommended_actions: string[] } = {
    theme_title: 'Volt Typhoon — escalating webshell activity in EMEA finance',
    narrative_markdown:
      'Across the last 30 days, **Volt Typhoon**-attributed campaigns dominated reporting…',
    recommended_actions: [
      'Verify Detection Engine coverage of T1505.003 (webshell).',
      'Review Indicator Match rules against the published C2 IPs.',
      'Open a Case for the highest-confidence behavior and assign to IR.',
    ],
  }
): { model: ScopedModel; invoke: jest.Mock } => {
  const invoke = jest.fn().mockResolvedValue(output);
  const structured = { invoke };
  const withStructuredOutput = jest.fn().mockReturnValue(structured);
  const chatModel = { withStructuredOutput } as unknown as ScopedModel['chatModel'];
  return { model: { chatModel } as ScopedModel, invoke };
};

describe('synthesizeAdvisory', () => {
  const logger = loggingSystemMock.createLogger();
  beforeEach(() => jest.clearAllMocks());

  describe('input-set handling', () => {
    it('returns "no_reports" with a stable theme_id when the search comes back empty', async () => {
      const esClient = buildEsClient([]);
      const { model } = buildModel();
      const result = await synthesizeAdvisory(esClient, model, logger, 'default', {
        time_range: TIME_RANGE,
      });
      expect(result.status).toBe('no_reports');
      expect(result.report_ids).toEqual([]);
      expect(result.theme_id).toMatch(/^[0-9a-f]{64}$/);
      expect(esClient.index).not.toHaveBeenCalled();
    });

    it('returns "no_inference" when reports exist but no model is provided', async () => {
      const esClient = buildEsClient([
        { _id: 'r1', threat_actors: ['Volt Typhoon'] },
        { _id: 'r2', threat_actors: ['Volt Typhoon'] },
      ]);
      const result = await synthesizeAdvisory(esClient, undefined, logger, 'default', {
        time_range: TIME_RANGE,
      });
      expect(result.status).toBe('no_inference');
      expect(result.report_ids).toEqual(['r1', 'r2']);
      expect(result.grouping.threat_actors).toEqual([{ name: 'Volt Typhoon', count: 2 }]);
      expect(esClient.index).not.toHaveBeenCalled();
    });
  });

  describe('grouping aggregates', () => {
    it('counts and sorts threat_actors / categories / regions across the top-N reports', async () => {
      const esClient = buildEsClient([
        {
          _id: 'r1',
          threat_actors: ['Volt Typhoon', 'APT29'],
          categories: ['ransomware'],
          regions: ['Americas'],
        },
        { _id: 'r2', threat_actors: ['Volt Typhoon'], categories: ['ransomware', 'phishing'] },
        { _id: 'r3', threat_actors: ['APT29'], categories: ['phishing'], regions: ['EMEA'] },
      ]);
      const { model } = buildModel();
      const result = await synthesizeAdvisory(esClient, model, logger, 'default', {
        time_range: TIME_RANGE,
      });
      expect(result.grouping.threat_actors).toEqual([
        { name: 'Volt Typhoon', count: 2 },
        { name: 'APT29', count: 2 },
      ]);
      expect(result.grouping.categories).toEqual([
        { name: 'ransomware', count: 2 },
        { name: 'phishing', count: 2 },
      ]);
      // Region order is deterministic: tally ordering ties on insertion
      // order (Map keeps insertion order); both regions appear once so
      // we assert on set equality rather than ordering.
      expect(new Set(result.grouping.regions.map((r) => r.name))).toEqual(
        new Set(['Americas', 'EMEA'])
      );
    });
  });

  describe('LLM invocation', () => {
    it('passes the structured output schema to the chat model and bubbles the parsed output back', async () => {
      const esClient = buildEsClient([{ _id: 'r1', threat_actors: ['Volt Typhoon'] }]);
      const { model, invoke } = buildModel();
      const result = await synthesizeAdvisory(esClient, model, logger, 'default', {
        time_range: TIME_RANGE,
      });
      expect(result.status).toBe('advisory_generated');
      expect(result.theme_title).toContain('Volt Typhoon');
      expect(result.recommended_actions).toHaveLength(3);
      expect(invoke).toHaveBeenCalledTimes(1);
      const prompt = invoke.mock.calls[0][0] as string;
      expect(prompt).toContain('Volt Typhoon');
      expect(prompt).toContain(TIME_RANGE.from);
      expect(prompt).toContain(TIME_RANGE.to);
    });

    it('includes the analyst hint verbatim in the prompt when description is supplied', async () => {
      const esClient = buildEsClient([{ _id: 'r1' }]);
      const { model, invoke } = buildModel();
      await synthesizeAdvisory(esClient, model, logger, 'default', {
        time_range: TIME_RANGE,
        description: 'Focus on rule_candidate reports only.',
      });
      const prompt = invoke.mock.calls[0][0] as string;
      expect(prompt).toContain('Focus on rule_candidate reports only.');
    });
  });

  describe('persistence branch', () => {
    it('writes the advisory to the companion index and returns advisory_id', async () => {
      const esClient = buildEsClient([
        { _id: 'r1', threat_actors: ['Volt Typhoon'] },
        { _id: 'r2', threat_actors: ['Volt Typhoon'] },
      ]);
      const { model } = buildModel();
      const result = await synthesizeAdvisory(esClient, model, logger, 'default', {
        time_range: TIME_RANGE,
        persist: true,
        generated_by: 'unit-test',
      });
      expect(result.status).toBe('advisory_persisted');
      expect(result.advisory_id).toBe('advisory-123');
      expect(esClient.index).toHaveBeenCalledTimes(1);
      const [arg] = esClient.index.mock.calls[0];
      expect(arg.index).toBe('.kibana-threat-intel-advisories');
      const document = arg.document as Record<string, unknown>;
      expect(document.theme_id).toEqual(result.theme_id);
      expect(document.report_ids).toEqual(['r1', 'r2']);
      expect(document.generated_by).toBe('unit-test');
      expect(document.space_id).toBe('default');
    });

    it('falls back to "advisory_generated" when the persist write fails (ephemeral advisory still returned)', async () => {
      const esClient = buildEsClient([{ _id: 'r1' }]);
      esClient.index.mockRejectedValueOnce(new Error('index_not_found'));
      const { model } = buildModel();
      const result = await synthesizeAdvisory(esClient, model, logger, 'default', {
        time_range: TIME_RANGE,
        persist: true,
      });
      expect(result.status).toBe('advisory_generated');
      expect(result.advisory_id).toBeUndefined();
      expect(result.narrative_markdown).toBeTruthy();
      expect((logger.warn as jest.Mock).mock.calls[0][0]).toContain('persistence failed');
    });
  });

  describe('theme_id determinism', () => {
    it('produces the same theme_id for the same time_range + report set, in any order', async () => {
      const { model } = buildModel();
      const resultA = await synthesizeAdvisory(
        buildEsClient([{ _id: 'r2' }, { _id: 'r1' }, { _id: 'r3' }]),
        model,
        logger,
        'default',
        { time_range: TIME_RANGE }
      );
      const resultB = await synthesizeAdvisory(
        buildEsClient([{ _id: 'r3' }, { _id: 'r1' }, { _id: 'r2' }]),
        model,
        logger,
        'default',
        { time_range: TIME_RANGE }
      );
      expect(resultA.theme_id).toBe(resultB.theme_id);
    });

    it('changes the theme_id when the time_range bounds change', async () => {
      const { model } = buildModel();
      const a = await synthesizeAdvisory(buildEsClient([{ _id: 'r1' }]), model, logger, 'default', {
        time_range: TIME_RANGE,
      });
      const b = await synthesizeAdvisory(buildEsClient([{ _id: 'r1' }]), model, logger, 'default', {
        time_range: { from: TIME_RANGE.from, to: '2026-05-15T00:00:00Z' },
      });
      expect(a.theme_id).not.toBe(b.theme_id);
    });
  });

  describe('search query shape', () => {
    it('passes corroborated_rank_score → rank_score → severity.score as the sort tiers', async () => {
      const esClient = buildEsClient([{ _id: 'r1' }]);
      const { model } = buildModel();
      await synthesizeAdvisory(esClient, model, logger, 'default', { time_range: TIME_RANGE });
      const [searchArg] = esClient.search.mock.calls[0];
      const sortArg = (searchArg as { sort?: Array<Record<string, unknown>> }).sort;
      expect(sortArg).toBeDefined();
      const sortKeys = sortArg!.map((entry) => Object.keys(entry)[0]);
      expect(sortKeys).toEqual(['corroborated_rank_score', 'rank_score', 'severity.score']);
    });

    it('filters by space_id (current + global) and the supplied time_range', async () => {
      const esClient = buildEsClient([{ _id: 'r1' }]);
      const { model } = buildModel();
      await synthesizeAdvisory(esClient, model, logger, 'team-a', { time_range: TIME_RANGE });
      const [searchArg] = esClient.search.mock.calls[0];
      const queryArg = (searchArg as { query?: Record<string, unknown> }).query;
      const filterClauses = ((queryArg as { bool?: { filter?: unknown[] } })?.bool?.filter ??
        []) as Array<Record<string, unknown>>;
      const spaceFilter = filterClauses.find(
        (clause) => (clause as { terms?: { space_id?: string[] } }).terms?.space_id !== undefined
      );
      expect(spaceFilter).toBeDefined();
      const spaceTerms = (spaceFilter as { terms: { space_id: string[] } }).terms.space_id;
      expect(spaceTerms).toContain('team-a');
      expect(spaceTerms).toContain('*');
      const rangeFilter = filterClauses.find(
        (clause) => (clause as { range?: Record<string, unknown> }).range !== undefined
      );
      expect(rangeFilter).toBeDefined();
    });

    it('hard-caps max_reports at 50 even when callers ask for more', async () => {
      const esClient = buildEsClient([{ _id: 'r1' }]);
      const { model } = buildModel();
      await synthesizeAdvisory(esClient, model, logger, 'default', {
        time_range: TIME_RANGE,
        max_reports: 5000,
      });
      const [searchArg] = esClient.search.mock.calls[0];
      const sizeArg = (searchArg as { size?: number }).size;
      expect(sizeArg).toBe(50);
    });
  });
});
