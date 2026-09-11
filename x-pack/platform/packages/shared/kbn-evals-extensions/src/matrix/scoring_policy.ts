/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { VERDICT_LADDERS, scoreVerdict } from './jury';
import { isEisBacked, describeJudge } from './judge_provenance';

/**
 * Scoring policy shared by the two paths that turn raw score documents into
 * matrix cells: the CLI transport (`query_matrix_scores`) and the golden
 * driver (`scripts/extract_golden_aggregate.ts`).
 *
 * Both used to implement this independently, and only the CLI implemented it
 * at all -- so a board rendered from a golden extract silently disagreed with
 * the published board by ~2 points per cell while exiting 0. Keeping the
 * per-document decision here means the two paths cannot drift again.
 */

/**
 * Where each judged evaluator stores its categorical verdict. Taken from live
 * score documents, not inferred: Groundedness writes
 * `groundednessAnalysis.summary_verdict`, while Factuality and Relevance both
 * hang off the shared `correctnessAnalysis.summary` block under different keys.
 */
export const VERDICT_PATHS: Record<string, [string, string]> = {
  Groundedness: ['groundednessAnalysis', 'summary_verdict'],
  Factuality: ['correctnessAnalysis', 'factual_accuracy_summary'],
  Relevance: ['correctnessAnalysis', 'relevance_summary'],
};

export interface ScoringPolicy {
  /** Drop scores from judges that are not EIS-backed connectors. */
  requireEisJudge?: boolean;
  /** Drop scores where the judge and the graded model are the same id. */
  excludeSelfJudged?: boolean;
  /** Score the judge's categorical verdict via an ordinal ladder. */
  useVerdictLadder?: boolean;
}

/** Minimal shape the policy reads; both callers' document types satisfy it. */
export interface PolicyScoreDoc {
  task?: { model?: { id?: string | null } | null } | null;
  evaluator?: {
    name?: string | null;
    score?: number | null;
    label?: string | null;
    direction?: string | null;
    model?: { id?: string | null } | null;
    metadata?: unknown;
  } | null;
}

export type PolicyRejection = 'non-quality' | 'non-eis' | 'self-judged' | 'unmapped-verdict';

export interface PolicyDecision {
  /** Effective score for the cell, or null when the document is dropped. */
  score: number | null;
  /** Why the document was dropped, when it was. */
  rejected?: PolicyRejection;
}

export interface PolicyExclusionCounts {
  nonQuality: number;
  nonEis: number;
  selfJudged: number;
  unmappedVerdict: number;
}

export const emptyExclusionCounts = (): PolicyExclusionCounts => ({
  nonQuality: 0,
  nonEis: 0,
  selfJudged: 0,
  unmappedVerdict: 0,
});

/**
 * Ladder score for a judged evaluator, or the stored continuous score for
 * evaluators with no verdict vocabulary.
 *
 * The scores route strips `evaluator.metadata` server-side (UNBOUNDED_SCORE_FIELDS,
 * #286691). When the block is absent there is no verdict to ladder, but the
 * numeric grade is still trustworthy -- fall back to it rather than rejecting a
 * valid score. Treating this as "unmapped" silently blanked per-prefix columns.
 * Measured on golden: only 64% of persona score docs retain `evaluator.metadata`,
 * so this fallback is the common path, not an edge case.
 */
export function resolveVerdictScore(
  evaluatorName: string,
  doc: PolicyScoreDoc
): number | null | undefined {
  const ladder = VERDICT_LADDERS[evaluatorName];
  const path = VERDICT_PATHS[evaluatorName];
  if (!ladder || !path) {
    return doc.evaluator?.score;
  }

  const [blockKey, verdictKey] = path;
  const metadata = doc.evaluator?.metadata as Record<string, unknown> | undefined;
  if (metadata === undefined) {
    return doc.evaluator?.score;
  }
  const block = metadata?.[blockKey] as Record<string, unknown> | undefined;
  // Groundedness puts its verdict at the top of the block; the correctness
  // evaluators nest theirs one level deeper under `summary`.
  const summary = (block?.summary as Record<string, unknown> | undefined) ?? block;
  const verdict = summary?.[verdictKey];

  const mapped = scoreVerdict(typeof verdict === 'string' ? verdict : undefined, ladder);
  return mapped ?? undefined;
}

/**
 * Apply the scoring policy to a single score document.
 *
 * `isExcludedName` reports whether an evaluator name is excluded by the
 * config's evaluator allowlist (Latency, Tool Calls, ...). Upstream now
 * persists evaluator polarity (#284027), but only 2.3% of persona score docs
 * carry `evaluator.direction`, so the name allowlist remains the primary
 * signal and polarity is used only when present.
 */
export function applyScoringPolicy(
  doc: PolicyScoreDoc,
  policy: ScoringPolicy,
  isExcludedName: (evaluatorName: string) => boolean
): PolicyDecision {
  const evaluatorName = doc.evaluator?.name;
  if (!evaluatorName) {
    return { score: null, rejected: 'non-quality' };
  }

  const judgeId = doc.evaluator?.model?.id;
  const taskModelId = doc.task?.model?.id;

  if (policy.requireEisJudge && judgeId && !isEisBacked(judgeId)) {
    return { score: null, rejected: 'non-eis' };
  }
  if (
    policy.excludeSelfJudged &&
    judgeId &&
    taskModelId &&
    describeJudge(judgeId, taskModelId).selfJudged
  ) {
    return { score: null, rejected: 'self-judged' };
  }

  const direction = doc.evaluator?.direction;
  if (direction && direction !== 'maximize') {
    return { score: null, rejected: 'non-quality' };
  }
  if (isExcludedName(evaluatorName)) {
    return { score: null, rejected: 'non-quality' };
  }

  const score = policy.useVerdictLadder
    ? resolveVerdictScore(evaluatorName, doc)
    : doc.evaluator?.score;

  if (typeof score !== 'number') {
    return { score: null, rejected: policy.useVerdictLadder ? 'unmapped-verdict' : undefined };
  }
  return { score };
}

/** Tally a rejection into the running exclusion counts. */
export function tallyRejection(
  counts: PolicyExclusionCounts,
  rejected: PolicyRejection | undefined
): void {
  if (rejected === 'non-quality') counts.nonQuality += 1;
  else if (rejected === 'non-eis') counts.nonEis += 1;
  else if (rejected === 'self-judged') counts.selfJudged += 1;
  else if (rejected === 'unmapped-verdict') counts.unmappedVerdict += 1;
}
