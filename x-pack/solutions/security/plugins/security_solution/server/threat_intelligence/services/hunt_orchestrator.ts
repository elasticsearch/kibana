/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import {
  proposeAtomicEsqlFromIocs,
  THREAT_REPORTS_INDEX_PATTERN,
  type AtomicEsqlProposal,
  type HuntTier2When,
  type TelemetryProbeTier,
} from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from '../lib/space_filter';
import { huntForThreat } from './hunt_for_threat';
import type { HuntForThreatParams, HuntForThreatResult, HuntIoc } from './hunt_for_threat';
import { huntBehavior } from './hunt_behavior';
import type {
  HuntBehaviorArticleContext,
  HuntBehaviorParams,
  HuntBehaviorResult,
} from './hunt_behavior';
import { writeHuntFeedbackSafe } from './write_hunt_feedback';
import type { HuntFeedbackTarget } from './write_hunt_feedback';

/**
 * Domain capability module for the `hunt_orchestrated` action.
 *
 * Chains the two-tier tradecraft hunt model in a single service call so
 * workflows (digest delivery, hit provenance backfill, future advisory
 * synthesis) and the Agent Builder skill don't have to encode the
 * `huntForThreat` → `huntBehavior` sequence themselves:
 *
 *   - Tier 1 (`huntForThreat`)  — atomic IOC / technique lookups across
 *                                 the customer environment indices.
 *   - Tier 2 (`huntBehavior`)   — LLM-refined behavioral rules against
 *                                 the report text, optionally informed
 *                                 by the Tier 1 hit context (affected
 *                                 hosts/users + a small sample of hit
 *                                 documents). Skipped when the caller
 *                                 sets `tier2_when: 'never'`, when
 *                                 there's no GenAI connector, or when
 *                                 `tier2_when: 'on_hits'` (default) and
 *                                 Tier 1 didn't match anything.
 *
 * The granular services remain individually addressable so power users
 * and the LLM can still call either tier directly; the orchestrator is
 * the convenience surface workflows depend on.
 *
 * The result carries an explicit `tier` discriminator on each sub-result
 * so consumers can distinguish "Tier 1 only" from "Tier 1 + Tier 2"
 * without inspecting the underlying structures. The discriminator type
 * (`TelemetryProbeTier`) is reserved for the future Streams KI probe
 * registry — when that lands, the two `hunt*` calls below become
 * "execute the registered probes for this tier" without changing this
 * orchestration loop.
 *
 * @reference
 * This service is the reference implementation of the cross-team
 * orchestration pattern described in
 * `docs/rfcs/0001_streams_layer3_grounded_hypothesis_flow.md` §4. The
 * runtime contract every probe (Tier 1, Tier 2, future Layer 3
 * Streams KIs) implements is
 * `common/threat_intelligence/hub/telemetry_probe.ts` — see the RFC
 * mapping table for how this orchestrator's sub-results align with
 * `TelemetryProbeResult`.
 */

export type HuntOrchestratedStatus =
  | 'tier1_only'
  | 'tier1_and_tier2'
  | 'tier2_only_skipped'
  | 'tier1_skipped';

export type HuntOrchestratedTier2SkipReason =
  | 'configured_never'
  | 'no_inference'
  | 'no_environment_hits'
  | 'no_searchable_input'
  | 'no_report_text';

export interface HuntOrchestratedParams {
  report_id?: string;
  spaceId: string;
  /**
   * Override the report text used for Tier 2 extraction. When omitted,
   * the orchestrator falls back to fetching `content.body_text` from the
   * `report_id`. Either `text` or a valid `report_id` (whose body can be
   * loaded) is required to run Tier 2.
   */
  text?: string;
  /**
   * Explicit IOCs / techniques passed through to Tier 1. Same shape as
   * `huntForThreat` accepts. When both are omitted, `report_id` must be
   * provided so Tier 1 can self-resolve from the report's `extracted`
   * block.
   */
  iocs?: HuntIoc[];
  techniques?: string[];
  time_range?: { from: string; to: string };
  size?: number;
  max_assets?: number;
  llm_confidence_threshold?: number;
  /**
   * Tier 2 gating policy. See {@link HuntTier2When}. Default: `'on_hits'`
   * — tradecraft's corroboration semantic. Set `'always'` to propose
   * rules from the report text even when Tier 1 didn't hit (useful for
   * digest / advisory synthesis flows). Set `'never'` to disable Tier 2
   * entirely.
   */
  tier2_when?: HuntTier2When;
  /**
   * Maximum number of hit samples to include in the Tier 2 article
   * context. Keeps the LLM prompt bounded — five samples is enough to
   * convey the pattern without bloating the context window.
   */
  max_tier2_sample_events?: number;
}

export interface HuntOrchestratedTier1 extends HuntForThreatResult {
  tier: TelemetryProbeTier;
  /**
   * One ES|QL proposal per resolved IOC, capped at 20 (see
   * `common/threat_intelligence/hub/rule_export.ts`). Populated whenever
   * Tier 1 returned `environment_hits_found` AND the resolved IOC list
   * is non-empty — these are durable atomic rules that catch the exact
   * pattern that fired. The LLM uses these alongside the Tier 2
   * behavioral proposals when deciding what to hand off to
   * `security.create_detection_rule`.
   */
  proposed_atomic_rules?: AtomicEsqlProposal[];
}

export interface HuntOrchestratedTier2 extends HuntBehaviorResult {
  tier: TelemetryProbeTier;
}

export interface HuntOrchestratedResult {
  status: HuntOrchestratedStatus;
  report_id?: string;
  tier1: HuntOrchestratedTier1;
  tier2?: HuntOrchestratedTier2;
  /**
   * Populated whenever Tier 2 didn't execute. Lets workflows render an
   * unambiguous "Tier 2 skipped because …" attribution instead of having
   * to infer it from a missing `tier2` field.
   */
  tier2_skipped_reason?: HuntOrchestratedTier2SkipReason;
  /**
   * Brief operational message describing the run's outcome. Useful for
   * workflow-execution logs and the Agent Builder LLM's narrative
   * summarization step.
   */
  message: string;
  /** Same convention as the other hunt services — agent-facing guidance. */
  next_step: string;
}

const DEFAULT_TIER2_SAMPLE_EVENTS = 5;

/**
 * Extract a compact one-line summary of an environment hit document so a
 * small set of samples can be passed to the Tier 2 LLM prompt without
 * forwarding entire raw events.
 */
const summarizeHit = (hit: HuntForThreatResult['hits'][number]): string => {
  const parts: string[] = [];
  const ruleName = (hit as Record<string, unknown>)['kibana.alert.rule.name'];
  const eventDataset = (hit as Record<string, unknown>)['event.dataset'];
  const hostName = (hit as Record<string, unknown>)['host.name'];
  const userName = (hit as Record<string, unknown>)['user.name'];
  const sourceIp = (hit as Record<string, unknown>)['source.ip'];
  const destIp = (hit as Record<string, unknown>)['destination.ip'];
  const urlFull = (hit as Record<string, unknown>)['url.full'];
  if (typeof ruleName === 'string') parts.push(`rule="${ruleName}"`);
  if (typeof eventDataset === 'string') parts.push(`dataset=${eventDataset}`);
  if (typeof hostName === 'string') parts.push(`host=${hostName}`);
  if (typeof userName === 'string') parts.push(`user=${userName}`);
  if (typeof sourceIp === 'string') parts.push(`src=${sourceIp}`);
  if (typeof destIp === 'string') parts.push(`dst=${destIp}`);
  if (typeof urlFull === 'string') parts.push(`url=${urlFull}`);
  return parts.length > 0 ? parts.join(' ') : `_index=${hit.index} _id=${hit.id}`;
};

/**
 * Combined report-context lookup used by the orchestrator. One ES
 * round-trip pulls everything downstream might need:
 *
 *   - `text`               : optional pre-supplied override that wins
 *                            over the ES lookup (test seam + caller
 *                            convenience for analyst-paste flows).
 *   - `index` / `id`       : concrete backing index — required by
 *                            `_update` since data-stream aliases reject
 *                            id-targeted updates.
 *   - `rank_score`         : base score forwarded to
 *                            `writeHuntFeedbackSafe` so the
 *                            corroborated derivative can be recomputed
 *                            in one shot.
 *
 * Returns `undefined` only when the caller didn't pass `report_id` at
 * all. A `report_id` that points at no doc returns a result with
 * `body_text: undefined` so the orchestrator can still emit a clean
 * `no_report_text` skip reason for Tier 2.
 */
interface ReportContext {
  target?: HuntFeedbackTarget;
  body_text?: string;
}

const resolveReportContext = async (
  esClient: ElasticsearchClient,
  params: HuntOrchestratedParams,
  logger: Logger
): Promise<ReportContext> => {
  const explicitText =
    typeof params.text === 'string' && params.text.length > 0 ? params.text : undefined;
  if (!params.report_id) {
    return { body_text: explicitText };
  }
  try {
    const response = await esClient.search({
      index: THREAT_REPORTS_INDEX_PATTERN,
      size: 1,
      query: {
        bool: {
          filter: [
            buildSpaceFilterTerms(params.spaceId),
            { ids: { values: [params.report_id] } },
          ],
        },
      },
      _source: ['content.body_text', 'rank_score'],
    });
    const hit = response.hits.hits[0];
    if (!hit) {
      // Report id is unknown to ES — Tier 2 can still run if `text`
      // was supplied, but no feedback write can target it. Caller will
      // surface the right skip reason from the missing `target`.
      return { body_text: explicitText };
    }
    const source = hit._source as
      | { content?: { body_text?: string }; rank_score?: number }
      | undefined;
    const body = source?.content?.body_text;
    return {
      target: {
        index: hit._index,
        id: hit._id ?? params.report_id,
        rank_score: typeof source?.rank_score === 'number' ? source.rank_score : undefined,
      },
      body_text: explicitText ?? (typeof body === 'string' && body.length > 0 ? body : undefined),
    };
  } catch (err) {
    logger.warn(`hunt_orchestrated report lookup failed: ${(err as Error).message}`);
    return { body_text: explicitText };
  }
};

/**
 * Build the {@link HuntBehaviorArticleContext} block from a Tier 1
 * result. Returns `undefined` when Tier 1 produced no hits so the Tier 2
 * extractor's prompt is byte-identical to the pre-orchestrator,
 * text-only invocation in that case.
 *
 * `proposedAtomicRules` is threaded through (when non-empty) so the
 * Tier 2 LLM knows which IOCs already have atomic ES|QL coverage. The
 * preamble in `hunt_behavior.ts` steers the LLM away from
 * re-proposing those as behavioral rules — see
 * `services/hunt_behavior.ts` CONTEXT_PREAMBLE.
 */
const buildArticleContext = (
  tier1: HuntForThreatResult,
  maxSamples: number,
  proposedAtomicRules?: AtomicEsqlProposal[]
): HuntBehaviorArticleContext | undefined => {
  if (tier1.status !== 'environment_hits_found') return undefined;
  const context: HuntBehaviorArticleContext = {};
  const hosts = tier1.affected_assets.hosts.map((h) => h.name).filter((n) => n.length > 0);
  const users = tier1.affected_assets.users.map((u) => u.name).filter((n) => n.length > 0);
  if (hosts.length > 0) context.affected_hosts = hosts;
  if (users.length > 0) context.affected_users = users;
  if (tier1.hits.length > 0) {
    context.sample_events = tier1.hits.slice(0, maxSamples).map(summarizeHit);
  }
  if (tier1.time_range) context.time_range = tier1.time_range;
  if (proposedAtomicRules && proposedAtomicRules.length > 0) {
    // Map down to the minimal shape `HuntBehaviorArticleContext` accepts
    // so the orchestrator's internal `AtomicEsqlProposal` (which carries
    // the full ES|QL body, severity, risk score) doesn't leak into the
    // prompt — see the field docstring on `proposed_atomic_rules`.
    context.proposed_atomic_rules = proposedAtomicRules.map((rule) => ({
      rule_name: rule.rule_name,
      ioc_type: rule.ioc_type,
      ioc_value: rule.ioc_value,
    }));
  }
  // If nothing meaningful was attached, return undefined so the prompt
  // stays unchanged from the standalone hunt_behavior path.
  return Object.keys(context).length === 0 ? undefined : context;
};

/**
 * Decide whether to run Tier 2 given the policy and the Tier 1 outcome.
 * Returns either `null` (= run Tier 2) or a structured skip reason that
 * the orchestrator surfaces back to the caller.
 */
const decideTier2Skip = (
  tier2When: HuntTier2When,
  tier1: HuntForThreatResult
): HuntOrchestratedTier2SkipReason | null => {
  if (tier2When === 'never') return 'configured_never';
  if (tier1.status === 'no_searchable_input' || tier1.status === 'no_searchable_terms') {
    // Without IOCs or techniques to anchor the search, Tier 1 didn't run
    // meaningfully — Tier 2 against the report text alone is still
    // valuable when explicitly requested, but the default 'on_hits'
    // policy treats this as "nothing to corroborate".
    if (tier2When === 'always') return null;
    return 'no_searchable_input';
  }
  if (tier2When === 'on_hits' && tier1.status !== 'environment_hits_found') {
    return 'no_environment_hits';
  }
  return null;
};

const buildMessage = (
  status: HuntOrchestratedStatus,
  tier1: HuntForThreatResult,
  tier2?: HuntBehaviorResult,
  skipReason?: HuntOrchestratedTier2SkipReason
): string => {
  const tier1Summary =
    tier1.status === 'environment_hits_found'
      ? `Tier 1: ${tier1.counts.total_hits} hit(s) across ${tier1.counts.affected_hosts} host(s) ` +
        `and ${tier1.counts.affected_users} user(s)`
      : `Tier 1: ${tier1.status}`;
  if (status === 'tier1_only' || status === 'tier1_skipped') {
    return `${tier1Summary}. Tier 2 skipped (${skipReason ?? 'unknown'}).`;
  }
  const tier2Summary = tier2
    ? `Tier 2: ${tier2.status} (${tier2.behaviors.length} proposed)`
    : 'Tier 2: not run';
  return `${tier1Summary}. ${tier2Summary}.`;
};

const buildNextStep = (
  status: HuntOrchestratedStatus,
  tier1: HuntForThreatResult,
  tier2?: HuntBehaviorResult,
  atomicRuleCount = 0
): string => {
  const atomicHint =
    atomicRuleCount > 0
      ? ` The Tier 1 result also carries ${atomicRuleCount} atomic ES|QL proposal(s) on ` +
        '`tier1.proposed_atomic_rules` — these are durable rules that catch the exact ' +
        'IOC pattern that fired. Prefer them over behavioral proposals for hash / IP / URL ' +
        'IOCs and over `security.create_detection_rule` indicator-match for high-confidence ' +
        'atomic matches.'
      : '';
  if (tier2 && tier2.status === 'behaviors_proposed' && tier2.behaviors.length > 0) {
    return (
      `Emit each behavior as a \`threat-intel-finding-card\` attachment (fill report_title / ` +
      `report_source_name from the originating ingest_report / search_reports result). ` +
      `For the highest-confidence behavior, propose a Detection Engine rule via ` +
      `\`security.create_detection_rule\` using the matching \`proposed_esql_rule\` body. ` +
      `If Tier 1 also returned environment hits, optionally open a Case via the \`cases\` tool ` +
      `with the report_id + the top affected assets.${atomicHint}`
    );
  }
  if (status === 'tier1_only' && tier1.status === 'environment_hits_found') {
    return (
      `Tier 1 matched but Tier 2 was skipped. Render the affected_assets block as a short ` +
      `prose summary. If durable rule proposals are needed, re-run with \`tier2_when: "always"\`.${atomicHint}`
    );
  }
  if (tier1.status === 'no_environment_hits') {
    return (
      'No environment matches in the searched time range. Consider widening `time_range` or ' +
      're-running with `tier2_when: "always"` to propose durable rules from the report text alone.'
    );
  }
  return tier1.next_step;
};

export const huntOrchestrated = async (
  esClient: ElasticsearchClient,
  model: ScopedModel | undefined,
  logger: Logger,
  params: HuntOrchestratedParams
): Promise<HuntOrchestratedResult> => {
  const {
    report_id: reportId,
    iocs,
    techniques,
    time_range: timeRange,
    size,
    max_assets: maxAssets,
    llm_confidence_threshold: llmThreshold,
    tier2_when: tier2When = 'on_hits',
    max_tier2_sample_events: maxSamples = DEFAULT_TIER2_SAMPLE_EVENTS,
    spaceId,
  } = params;

  const tier1Params: HuntForThreatParams = {
    report_id: reportId,
    iocs,
    techniques,
    time_range: timeRange,
    size,
    max_assets: maxAssets,
    spaceId,
  };
  const tier1Raw = await huntForThreat(esClient, logger, tier1Params);
  // Atomic-rule proposals are emitted only when Tier 1 *actually*
  // matched in the environment (status === 'environment_hits_found').
  // The proposals are durable detections derived from the matching
  // IOC set; without an environment hit they're speculative and would
  // confuse the LLM into proposing rules for things that aren't fired.
  const proposedAtomicRules =
    tier1Raw.status === 'environment_hits_found' &&
    tier1Raw.resolved_iocs &&
    tier1Raw.resolved_iocs.length > 0
      ? proposeAtomicEsqlFromIocs(tier1Raw.resolved_iocs, tier1Raw.report_id)
      : undefined;
  const tier1: HuntOrchestratedTier1 = {
    ...tier1Raw,
    tier: 1,
    ...(proposedAtomicRules && proposedAtomicRules.length > 0
      ? { proposed_atomic_rules: proposedAtomicRules }
      : {}),
  };

  // Resolve report context once: shared by Tier 2 (body fallback) and
  // the feedback writer (backing index + base rank_score). Done after
  // Tier 1 so we don't pay the round-trip when Tier 1 itself fails
  // hard, but before Tier 2 gating so we have the target to write
  // feedback against regardless of the Tier 2 outcome.
  const reportContext = reportId
    ? await resolveReportContext(esClient, params, logger)
    : { body_text: params.text };

  // Fire-and-await the feedback write. We deliberately do not block
  // Tier 2 on it (it runs in parallel with the LLM extraction below
  // via Promise.all) but we do collect its outcome so any future
  // structured "feedback_written: true" hint can land in the response.
  // `writeHuntFeedbackSafe` swallows its own errors so the main hunt
  // response is never failed by a feedback write.
  const feedbackPromise =
    reportContext.target !== undefined
      ? writeHuntFeedbackSafe(esClient, logger, {
          target: reportContext.target,
          tier1: tier1Raw,
        })
      : Promise.resolve();

  const skipReason = decideTier2Skip(tier2When, tier1Raw);
  if (skipReason) {
    await feedbackPromise;
    const message = buildMessage('tier1_only', tier1Raw, undefined, skipReason);
    return {
      status: 'tier1_only',
      report_id: reportId,
      tier1,
      tier2_skipped_reason: skipReason,
      message,
      next_step: buildNextStep('tier1_only', tier1Raw, undefined, proposedAtomicRules?.length ?? 0),
    };
  }

  if (!model) {
    // Inference plugin / GenAI connector missing — Tier 2 can't run.
    // Distinct from `configured_never` so the UI can render "configure a
    // GenAI connector to enable durable rule proposals" instead of
    // assuming the caller opted out.
    await feedbackPromise;
    return {
      status: 'tier1_only',
      report_id: reportId,
      tier1,
      tier2_skipped_reason: 'no_inference',
      message: buildMessage('tier1_only', tier1Raw, undefined, 'no_inference'),
      next_step:
        'Tier 2 requires a GenAI connector. Configure one via Stack Management → Connectors ' +
        'or set `genAi:defaultAIConnector` in advanced settings to enable behavioral rule ' +
        'proposals.',
    };
  }

  const reportText = reportContext.body_text;
  if (!reportText) {
    await feedbackPromise;
    return {
      status: 'tier2_only_skipped',
      report_id: reportId,
      tier1,
      tier2_skipped_reason: 'no_report_text',
      message: buildMessage('tier2_only_skipped', tier1Raw, undefined, 'no_report_text'),
      next_step:
        'Tier 2 needs report text. Pass `text` explicitly or use a `report_id` whose ' +
        '`content.body_text` has been ingested (the `nl_extraction_behavioral` workflow ' +
        'fills this in within ~30m of source_ingestion).',
    };
  }

  const articleContext = buildArticleContext(tier1Raw, maxSamples, proposedAtomicRules);
  const tier2Params: HuntBehaviorParams = {
    text: reportText,
    report_id: reportId,
    llm_confidence_threshold: llmThreshold,
    article_context: articleContext,
  };
  const [tier2Raw] = await Promise.all([huntBehavior(model, logger, tier2Params), feedbackPromise]);
  const tier2: HuntOrchestratedTier2 = { ...tier2Raw, tier: 2 };

  return {
    status: 'tier1_and_tier2',
    report_id: reportId,
    tier1,
    tier2,
    message: buildMessage('tier1_and_tier2', tier1Raw, tier2Raw),
    next_step: buildNextStep(
      'tier1_and_tier2',
      tier1Raw,
      tier2Raw,
      proposedAtomicRules?.length ?? 0
    ),
  };
};
