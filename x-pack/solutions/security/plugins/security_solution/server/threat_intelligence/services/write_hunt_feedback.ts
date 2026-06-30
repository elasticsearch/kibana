/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { THREAT_REPORTS_INDEX_PATTERN } from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from '../lib/space_filter';
import type { HuntForThreatResult } from './hunt_for_threat';

/**
 * Hunt-feedback writer.
 *
 * Closes the orchestrator → ranking feedback loop introduced in mapping
 * v9: after every Tier 1 hunt the orchestrator delegates here to refresh
 * the report's `feedback` block and recompute `corroborated_rank_score`
 * so subsequent `search_reports` sort_by='rank' calls naturally float
 * corroborated reports to the top of digests and the dashboard.
 *
 * Design notes:
 *
 *   - One ES round-trip per write. The orchestrator resolves
 *     `{ index, id, rank_score }` once at the start of the run (the same
 *     lookup that hydrates Tier 2's `text` fallback) and forwards them
 *     here, so the helper does not re-issue the search itself. Callers
 *     that don't have the cached values can use the convenience
 *     {@link resolveHuntFeedbackTarget} below.
 *   - Idempotent. The partial doc completely replaces `feedback.*` and
 *     `corroborated_rank_score`, so rerunning the same hunt over the
 *     same window converges on the same values.
 *   - Failure-tolerant. Callers must wrap in try/catch (or use
 *     {@link writeHuntFeedbackSafe}) — a transient ES error or a
 *     concurrent extraction rewrite must not fail the hunt response,
 *     which is the user-visible artifact.
 *   - Bounded boost. `corroborated_rank_score = rank_score * (1 + boost)`
 *     where `boost ∈ [0, 0.5]`. A noisy report with 10k IOC hits cannot
 *     dominate a clean high-relevance one — see {@link computeBoost}.
 */

const MAX_BOOST = 0.5;
const IOC_BOOST_WEIGHT = 0.15;
const TTP_BOOST_WEIGHT = 0.1;

export interface HuntFeedbackTarget {
  /** Concrete backing index — `_update` cannot target a data-stream alias. */
  index: string;
  /** Document id within the backing index. */
  id: string;
  /** Existing `rank_score` (if any) used to derive `corroborated_rank_score`. */
  rank_score?: number;
}

export interface HuntFeedbackInputs {
  target: HuntFeedbackTarget;
  tier1: HuntForThreatResult;
  /** Override the wall-clock — primarily a test seam. */
  now?: Date;
}

export interface HuntFeedbackWrite {
  feedback: {
    ioc_hit_count: number;
    ttp_hit_count: number;
    affected_host_count: number;
    affected_user_count: number;
    last_hunted_at: string;
    last_hunt_status: string;
    last_hunt_window?: { from: string; to: string };
  };
  /** Omitted (rather than zero) when the base `rank_score` is unknown. */
  corroborated_rank_score?: number;
}

/**
 * Bounded, monotone, log-based boost factor.
 *
 *   boost(0, 0)   = 0          → corroborated == rank_score
 *   boost(1, 0)   ≈ 0.10       → 10% lift on first matching IOC
 *   boost(10, 0)  ≈ 0.36       → diminishing returns
 *   boost(100, 0) = 0.50       → clamped
 *   boost(*, *)   ≤ 0.50       → noisy reports can never exceed 1.5×
 *
 * IOC matches weight higher than TTP matches because Tier 1 atomic IOC
 * matches are stronger evidence than the keyword-only ATT&CK technique
 * filter on `.alerts-security.*` (which has more false-positive surface
 * area).
 */
export const computeBoost = (iocHits: number, ttpHits: number): number => {
  const safeIoc = Math.max(0, iocHits);
  const safeTtp = Math.max(0, ttpHits);
  const raw = IOC_BOOST_WEIGHT * Math.log1p(safeIoc) + TTP_BOOST_WEIGHT * Math.log1p(safeTtp);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(MAX_BOOST, raw);
};

/**
 * Pure builder for the partial doc that gets sent to `_update`. Split
 * out from the network call so tests can assert the exact shape /
 * arithmetic without standing up an ES client mock.
 */
export const buildHuntFeedbackDoc = ({
  target,
  tier1,
  now = new Date(),
}: HuntFeedbackInputs): HuntFeedbackWrite => {
  const iocHits = Math.max(0, tier1.counts.total_hits ?? 0);
  // The `huntForThreat` service does not currently split IOC- vs
  // technique-hit counts on the returned `counts` block; conservatively
  // treat `searched_techniques > 0 ? total_hits : 0` as the upper bound
  // on TTP hits. The boost weight on TTP hits is intentionally smaller
  // (see `computeBoost`) so this approximation cannot inflate
  // `corroborated_rank_score` materially. When the service grows a
  // per-tier hit breakdown we'll wire it through here.
  const ttpHits = tier1.searched_techniques > 0 ? iocHits : 0;
  const feedback: HuntFeedbackWrite['feedback'] = {
    ioc_hit_count: iocHits,
    ttp_hit_count: ttpHits,
    affected_host_count: Math.max(0, tier1.counts.affected_hosts ?? 0),
    affected_user_count: Math.max(0, tier1.counts.affected_users ?? 0),
    last_hunted_at: now.toISOString(),
    last_hunt_status: tier1.status,
  };
  if (tier1.time_range) {
    feedback.last_hunt_window = { from: tier1.time_range.from, to: tier1.time_range.to };
  }
  const write: HuntFeedbackWrite = { feedback };
  if (typeof target.rank_score === 'number' && Number.isFinite(target.rank_score)) {
    const boost = computeBoost(iocHits, ttpHits);
    write.corroborated_rank_score = target.rank_score * (1 + boost);
  }
  return write;
};

/**
 * Convenience lookup for callers that don't already have the report's
 * `{ index, rank_score }` cached. Returns `undefined` when the report
 * is missing — the orchestrator treats this as "skip feedback, the
 * report id is stale or the data stream isn't initialized yet".
 */
export const resolveHuntFeedbackTarget = async (
  esClient: ElasticsearchClient,
  reportId: string,
  spaceId: string
): Promise<HuntFeedbackTarget | undefined> => {
  const response = await esClient.search({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: 1,
    query: {
      bool: { filter: [buildSpaceFilterTerms(spaceId), { ids: { values: [reportId] } }] },
    },
    _source: ['rank_score'],
  });
  const hit = response.hits.hits[0];
  if (!hit) return undefined;
  const source = hit._source as { rank_score?: number } | undefined;
  return {
    index: hit._index,
    id: hit._id ?? reportId,
    rank_score: typeof source?.rank_score === 'number' ? source.rank_score : undefined,
  };
};

/**
 * Issues the partial-doc `_update` against the resolved backing index.
 * Throws on failure — callers responsible for catching (typically with
 * a warn log) so the hunt response itself never fails on feedback
 * write errors.
 */
export const writeHuntFeedback = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  inputs: HuntFeedbackInputs
): Promise<void> => {
  const doc = buildHuntFeedbackDoc(inputs);
  await esClient.update({
    index: inputs.target.index,
    id: inputs.target.id,
    doc,
  });
  logger.debug(
    `hunt_feedback updated report_id=${inputs.target.id} ` +
      `ioc_hits=${doc.feedback.ioc_hit_count} ttp_hits=${doc.feedback.ttp_hit_count} ` +
      `corroborated_rank_score=${doc.corroborated_rank_score ?? 'n/a'}`
  );
};

/**
 * Try/catch wrapper used by the orchestrator. Logs and swallows so a
 * concurrent extraction-rewrite version conflict, a transient ES error,
 * or a deleted report cannot fail the user-visible hunt response.
 */
export const writeHuntFeedbackSafe = async (
  esClient: ElasticsearchClient,
  logger: Logger,
  inputs: HuntFeedbackInputs
): Promise<void> => {
  try {
    await writeHuntFeedback(esClient, logger, inputs);
  } catch (err) {
    logger.warn(
      `hunt_feedback write failed for report_id=${inputs.target.id}: ${(err as Error).message}. ` +
        `The hunt result itself is unaffected; the next hunt will overwrite cleanly.`
    );
  }
};
