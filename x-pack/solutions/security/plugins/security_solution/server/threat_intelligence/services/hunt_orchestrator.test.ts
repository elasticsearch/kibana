/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { ScopedModel } from '@kbn/agent-builder-server';
import type { HuntForThreatResult } from './hunt_for_threat';
import type { HuntBehaviorResult } from './hunt_behavior';
import { toIndexedBehaviors } from './indexed_behaviors';
import { huntForThreat } from './hunt_for_threat';
import { huntBehavior } from './hunt_behavior';
import { writeHuntFeedbackSafe } from './write_hunt_feedback';
import { huntOrchestrated } from './hunt_orchestrator';

jest.mock('./hunt_for_threat');
jest.mock('./hunt_behavior');
jest.mock('./write_hunt_feedback');

const huntForThreatMock = huntForThreat as jest.MockedFunction<typeof huntForThreat>;
const huntBehaviorMock = huntBehavior as jest.MockedFunction<typeof huntBehavior>;
const writeHuntFeedbackSafeMock = writeHuntFeedbackSafe as jest.MockedFunction<
  typeof writeHuntFeedbackSafe
>;

/**
 * Minimum-viable `HuntForThreatResult` factories — each builder targets
 * one of the documented Tier 1 statuses so the orchestrator's
 * `decideTier2Skip` branching can be exercised without standing up a
 * real ES client. The shapes mirror the real service so accidental
 * field renames surface as compile errors.
 */
const tier1WithHits = (overrides?: Partial<HuntForThreatResult>): HuntForThreatResult => ({
  status: 'environment_hits_found',
  report_id: 'report-1',
  searched_iocs: 2,
  searched_techniques: 1,
  resolved_iocs: [
    { type: 'ip', value: '198.51.100.5' },
    { type: 'domain', value: 'evil.example.com' },
  ],
  resolved_techniques: ['T1059.003'],
  time_range: { from: '2026-04-01T00:00:00Z', to: '2026-05-01T00:00:00Z' },
  counts: { total_hits: 7, returned_hits: 7, affected_hosts: 2, affected_users: 1 },
  hits: [
    {
      index: '.alerts-security.alerts-default',
      id: 'alert-1',
      score: 1,
      'kibana.alert.rule.name': 'Suspicious cmd.exe execution',
      'event.dataset': 'endpoint.events',
      'host.name': 'web01',
      'user.name': 'svc-app',
      'source.ip': '10.0.0.5',
    },
  ],
  affected_assets: {
    hosts: [
      { name: 'web01', hit_count: 5 },
      { name: 'db01', hit_count: 2 },
    ],
    users: [{ name: 'svc-app', hit_count: 7 }],
  },
  per_index: [{ index: '.alerts-security.alerts-default', hit_count: 7 }],
  next_step: 'Render affected_assets…',
  ...overrides,
});

const tier1NoHits = (): HuntForThreatResult => ({
  status: 'no_environment_hits',
  report_id: 'report-1',
  searched_iocs: 2,
  searched_techniques: 1,
  time_range: { from: '2026-04-01T00:00:00Z', to: '2026-05-01T00:00:00Z' },
  counts: { total_hits: 0, returned_hits: 0, affected_hosts: 0, affected_users: 0 },
  hits: [],
  affected_assets: { hosts: [], users: [] },
  per_index: [],
  next_step: 'No environment matches…',
});

const tier1NoSearchableInput = (): HuntForThreatResult => ({
  status: 'no_searchable_input',
  searched_iocs: 0,
  searched_techniques: 0,
  counts: { total_hits: 0, returned_hits: 0, affected_hosts: 0, affected_users: 0 },
  hits: [],
  affected_assets: { hosts: [], users: [] },
  per_index: [],
  message: 'No IOCs or ATT&CK technique IDs to hunt against.',
  next_step: 'Re-run with explicit IOCs / techniques.',
});

const tier2Behaviors = [
  {
    technique_id: 'T1059.003',
    evidence_quote: 'The attacker invokes cmd.exe with a long obfuscated argument…',
    llm_confidence: 0.9,
    confidence: 0.9,
    technique_name: 'Windows Command Shell',
    reference: 'https://attack.mitre.org/techniques/T1059/003/',
    tactic_ids: ['execution'],
    parent_technique_id: 'T1059',
    proposed_esql_rule: 'FROM logs-* | …',
    rule_name: 'Cmd shell — T1059.003',
    severity: 'high' as const,
    risk_score: 73,
    finding_id: 'report-1:T1059.003',
  },
];

const tier2Result = (): HuntBehaviorResult => ({
  status: 'behaviors_proposed',
  report_id: 'report-1',
  behaviors: tier2Behaviors,
  indexed_behaviors: toIndexedBehaviors(tier2Behaviors),
  attachment_hints: [],
  next_step: 'Emit each behavior as a finding card…',
});

const buildScopedModel = (): ScopedModel => ({} as ScopedModel);

/**
 * Build an ES client mock whose `_search` returns a controllable hit
 * for the orchestrator's report-context lookup. Pass `null` to simulate
 * a missing report (no hits); pass an object to control the `_source`
 * (notably `body_text` and `rank_score`).
 */
const buildEsClient = (
  hit:
    | { _id?: string; _index?: string; body_text?: string; rank_score?: number }
    | null
    | undefined = {}
) => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const hasHit = hit !== null && hit !== undefined;
  const source: Record<string, unknown> = {};
  if (hasHit && hit.body_text !== undefined) {
    source.content = { body_text: hit.body_text };
  }
  if (hasHit && hit.rank_score !== undefined) {
    source.rank_score = hit.rank_score;
  }
  esClient.search.mockResolvedValue({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: { value: hasHit ? 1 : 0, relation: 'eq' },
      max_score: hasHit ? 1 : null,
      hits: hasHit
        ? [
            {
              _index: hit._index ?? '.ds-.kibana-threat-reports-000001',
              _id: hit._id ?? 'report-1',
              _score: 1,
              _source: source,
            },
          ]
        : [],
    },
  } as unknown as Awaited<ReturnType<typeof esClient.search>>);
  return esClient;
};

describe('huntOrchestrated', () => {
  const logger = loggingSystemMock.createLogger();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: feedback write is a no-op. Individual tests override
    // when they want to simulate write failures.
    writeHuntFeedbackSafeMock.mockResolvedValue(undefined);
  });

  describe('Tier 2 gating', () => {
    it('returns tier1_only with skipReason="configured_never" when tier2_when="never"', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      const result = await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        report_id: 'report-1',
        tier2_when: 'never',
        spaceId: 'default',
      });
      expect(result.status).toBe('tier1_only');
      expect(result.tier2_skipped_reason).toBe('configured_never');
      expect(result.tier1.tier).toBe(1);
      expect(result.tier2).toBeUndefined();
      expect(huntBehaviorMock).not.toHaveBeenCalled();
    });

    it('returns tier1_only with "no_environment_hits" when tier2_when="on_hits" and Tier 1 missed', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1NoHits());
      const result = await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        report_id: 'report-1',
        spaceId: 'default',
      });
      expect(result.status).toBe('tier1_only');
      expect(result.tier2_skipped_reason).toBe('no_environment_hits');
      expect(huntBehaviorMock).not.toHaveBeenCalled();
    });

    it('returns tier1_only with "no_searchable_input" when default policy + no IOCs', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1NoSearchableInput());
      const result = await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        spaceId: 'default',
      });
      expect(result.status).toBe('tier1_only');
      expect(result.tier2_skipped_reason).toBe('no_searchable_input');
    });

    it('runs Tier 2 when tier2_when="always" even if Tier 1 had no searchable input', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1NoSearchableInput());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      const result = await huntOrchestrated(
        buildEsClient({ body_text: 'body of the report' }),
        buildScopedModel(),
        logger,
        {
          report_id: 'report-1',
          text: 'body of the report',
          tier2_when: 'always',
          spaceId: 'default',
        }
      );
      expect(result.status).toBe('tier1_and_tier2');
      expect(result.tier2?.behaviors).toHaveLength(1);
      expect(huntBehaviorMock).toHaveBeenCalled();
    });
  });

  describe('GenAI availability fallback', () => {
    it('returns tier1_only with "no_inference" when Tier 1 hit but model is undefined', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      const result = await huntOrchestrated(buildEsClient(), undefined, logger, {
        report_id: 'report-1',
        spaceId: 'default',
      });
      expect(result.status).toBe('tier1_only');
      expect(result.tier2_skipped_reason).toBe('no_inference');
      expect(huntBehaviorMock).not.toHaveBeenCalled();
    });
  });

  describe('Tier 2 with environment context', () => {
    it('passes the Tier 1 hit context into huntBehavior.article_context', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());

      const result = await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        report_id: 'report-1',
        text: 'inline report text',
        spaceId: 'default',
      });

      expect(result.status).toBe('tier1_and_tier2');
      expect(result.tier1.tier).toBe(1);
      expect(result.tier2?.tier).toBe(2);

      expect(huntBehaviorMock).toHaveBeenCalledTimes(1);
      const [, , params] = huntBehaviorMock.mock.calls[0];
      expect(params.text).toBe('inline report text');
      expect(params.report_id).toBe('report-1');
      expect(params.article_context).toBeDefined();
      expect(params.article_context?.affected_hosts).toEqual(['web01', 'db01']);
      expect(params.article_context?.affected_users).toEqual(['svc-app']);
      expect(params.article_context?.sample_events).toHaveLength(1);
      expect(params.article_context?.sample_events?.[0]).toContain(
        'rule="Suspicious cmd.exe execution"'
      );
      expect(params.article_context?.sample_events?.[0]).toContain('host=web01');
      expect(params.article_context?.sample_events?.[0]).toContain('user=svc-app');
      expect(params.article_context?.time_range).toEqual({
        from: '2026-04-01T00:00:00Z',
        to: '2026-05-01T00:00:00Z',
      });
    });

    it('falls back to fetching content.body_text when text is not provided', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      const esClient = buildEsClient({ body_text: 'body fetched from .kibana-threat-reports' });

      const result = await huntOrchestrated(esClient, buildScopedModel(), logger, {
        report_id: 'report-1',
        spaceId: 'default',
      });

      expect(result.status).toBe('tier1_and_tier2');
      expect(esClient.search).toHaveBeenCalled();
      const [, , params] = huntBehaviorMock.mock.calls[0];
      expect(params.text).toBe('body fetched from .kibana-threat-reports');
    });

    it('returns tier2_only_skipped when neither text nor body_text are available', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      const esClient = buildEsClient({});

      const result = await huntOrchestrated(esClient, buildScopedModel(), logger, {
        report_id: 'report-1',
        spaceId: 'default',
      });

      expect(result.status).toBe('tier2_only_skipped');
      expect(result.tier2_skipped_reason).toBe('no_report_text');
      expect(huntBehaviorMock).not.toHaveBeenCalled();
    });

    it('omits article_context entirely when Tier 1 returned no hits but tier2_when="always"', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1NoHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());

      await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        report_id: 'report-1',
        text: 'body',
        tier2_when: 'always',
        spaceId: 'default',
      });

      const [, , params] = huntBehaviorMock.mock.calls[0];
      expect(params.article_context).toBeUndefined();
    });
  });

  describe('result discriminators', () => {
    it('tags each sub-result with its tier number', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      const result = await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        report_id: 'report-1',
        text: 'body',
        spaceId: 'default',
      });
      expect(result.tier1.tier).toBe(1);
      expect(result.tier2?.tier).toBe(2);
    });

    it('builds a message that summarises both tiers', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      const result = await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        report_id: 'report-1',
        text: 'body',
        spaceId: 'default',
      });
      expect(result.message).toContain('Tier 1');
      expect(result.message).toContain('Tier 2');
    });
  });

  describe('hunt-feedback wiring (point 4 — ranking loop)', () => {
    it('writes feedback against the resolved backing index when report_id resolves', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());

      await huntOrchestrated(
        buildEsClient({
          _index: '.ds-.kibana-threat-reports-000007',
          _id: 'report-1',
          body_text: 'body',
          rank_score: 0.5,
        }),
        buildScopedModel(),
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );

      expect(writeHuntFeedbackSafeMock).toHaveBeenCalledTimes(1);
      const [, , inputs] = writeHuntFeedbackSafeMock.mock.calls[0];
      expect(inputs.target).toEqual({
        index: '.ds-.kibana-threat-reports-000007',
        id: 'report-1',
        rank_score: 0.5,
      });
      expect(inputs.tier1.status).toBe('environment_hits_found');
    });

    it('writes feedback even when Tier 2 is skipped (no_environment_hits, on_hits policy)', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1NoHits());

      await huntOrchestrated(
        buildEsClient({ body_text: 'body', rank_score: 0.4 }),
        buildScopedModel(),
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );

      expect(writeHuntFeedbackSafeMock).toHaveBeenCalledTimes(1);
      const [, , inputs] = writeHuntFeedbackSafeMock.mock.calls[0];
      expect(inputs.tier1.status).toBe('no_environment_hits');
    });

    it('writes feedback even when GenAI is unavailable (no_inference path)', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());

      await huntOrchestrated(
        buildEsClient({ body_text: 'body', rank_score: 0.4 }),
        undefined,
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );

      expect(writeHuntFeedbackSafeMock).toHaveBeenCalledTimes(1);
    });

    it('skips the feedback write when report_id is missing entirely', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());

      await huntOrchestrated(buildEsClient(null), buildScopedModel(), logger, {
        text: 'body',
        iocs: [{ type: 'ip', value: '1.2.3.4' }],
        spaceId: 'default',
      });

      expect(writeHuntFeedbackSafeMock).not.toHaveBeenCalled();
    });

    it('skips the feedback write when report_id is unknown to the threat-reports data stream', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());

      await huntOrchestrated(buildEsClient(null), buildScopedModel(), logger, {
        report_id: 'stale-or-deleted-report',
        text: 'body',
        spaceId: 'default',
      });

      expect(writeHuntFeedbackSafeMock).not.toHaveBeenCalled();
    });

    it('attaches atomic ES|QL proposals on tier1.proposed_atomic_rules when Tier 1 matched (point 6)', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      const result = await huntOrchestrated(
        buildEsClient({ body_text: 'body', rank_score: 0.5 }),
        buildScopedModel(),
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );
      expect(result.tier1.proposed_atomic_rules).toBeDefined();
      expect(result.tier1.proposed_atomic_rules).toHaveLength(2);
      expect(result.tier1.proposed_atomic_rules?.[0].ioc_type).toBe('ip');
      expect(result.tier1.proposed_atomic_rules?.[0].ioc_value).toBe('198.51.100.5');
      expect(result.tier1.proposed_atomic_rules?.[0].esql).toContain('source.ip == "198.51.100.5"');
      // The narrative next_step nudges the agent towards the atomic
      // proposals so the LLM has clear guidance on when to prefer them.
      expect(result.next_step).toContain('proposed_atomic_rules');
    });

    it('forwards proposed_atomic_rules into huntBehavior.article_context so Tier 2 LLM avoids duplicating Tier 1 coverage', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      await huntOrchestrated(
        buildEsClient({ body_text: 'body', rank_score: 0.5 }),
        buildScopedModel(),
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );
      expect(huntBehaviorMock).toHaveBeenCalledTimes(1);
      const [, , params] = huntBehaviorMock.mock.calls[0];
      expect(params.article_context).toBeDefined();
      expect(params.article_context?.proposed_atomic_rules).toBeDefined();
      expect(params.article_context?.proposed_atomic_rules).toHaveLength(2);
      const atomicRules = params.article_context?.proposed_atomic_rules ?? [];
      expect(atomicRules[0]).toEqual(
        expect.objectContaining({ ioc_type: 'ip', ioc_value: '198.51.100.5' })
      );
      // Verify the orchestrator strips the full ES|QL body and severity
      // before forwarding — the LLM only sees the minimal shape declared
      // on `HuntBehaviorArticleContext.proposed_atomic_rules`.
      expect(atomicRules[0]).not.toHaveProperty('esql');
      expect(atomicRules[0]).not.toHaveProperty('severity');
    });

    it('omits proposed_atomic_rules from article_context when Tier 1 had no atomic rules (techniques-only hunt)', async () => {
      huntForThreatMock.mockResolvedValueOnce(
        tier1WithHits({ resolved_iocs: [], resolved_techniques: ['T1059.003'] })
      );
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      await huntOrchestrated(
        buildEsClient({ body_text: 'body', rank_score: 0.5 }),
        buildScopedModel(),
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );
      const [, , params] = huntBehaviorMock.mock.calls[0];
      expect(params.article_context?.proposed_atomic_rules).toBeUndefined();
    });

    it('omits proposed_atomic_rules when Tier 1 returned no environment hits', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1NoHits());
      const result = await huntOrchestrated(buildEsClient(), buildScopedModel(), logger, {
        report_id: 'report-1',
        spaceId: 'default',
      });
      expect(result.tier1.proposed_atomic_rules).toBeUndefined();
    });

    it('omits proposed_atomic_rules when Tier 1 hits exist but resolved_iocs is empty (techniques-only hunt)', async () => {
      huntForThreatMock.mockResolvedValueOnce(
        tier1WithHits({ resolved_iocs: [], resolved_techniques: ['T1059.003'] })
      );
      huntBehaviorMock.mockResolvedValueOnce(tier2Result());
      const result = await huntOrchestrated(
        buildEsClient({ body_text: 'body', rank_score: 0.5 }),
        buildScopedModel(),
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );
      expect(result.tier1.proposed_atomic_rules).toBeUndefined();
      // next_step should not reference the atomic block when none was emitted.
      expect(result.next_step).not.toContain('proposed_atomic_rules');
    });

    it('does not let a slow feedback write delay Tier 2 — both are awaited concurrently', async () => {
      huntForThreatMock.mockResolvedValueOnce(tier1WithHits());
      let resolveTier2: ((value: HuntBehaviorResult) => void) | undefined;
      huntBehaviorMock.mockReturnValueOnce(
        new Promise<HuntBehaviorResult>((resolve) => {
          resolveTier2 = resolve;
        })
      );
      let resolveFeedback: (() => void) | undefined;
      writeHuntFeedbackSafeMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveFeedback = resolve;
        })
      );

      const inFlight = huntOrchestrated(
        buildEsClient({ body_text: 'body', rank_score: 0.5 }),
        buildScopedModel(),
        logger,
        { report_id: 'report-1', spaceId: 'default' }
      );

      // Resolve in reverse order to assert the orchestrator awaits both.
      expect(resolveTier2).toBeDefined();
      expect(resolveFeedback).toBeDefined();
      resolveTier2!(tier2Result());
      resolveFeedback!();
      const result = await inFlight;
      expect(result.status).toBe('tier1_and_tier2');
    });
  });
});
