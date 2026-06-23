/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceConnector } from '@kbn/inference-common';
import { getContextWindowSize } from '@kbn/inference-common';
import type { CompactionSummary } from '@kbn/agent-builder-common';

/**
 * Fraction of the context window reserved for system prompt, output generation,
 * actions buffer, and other overhead that isn't conversation history.
 */
const RESERVED_FRACTION = 0.3;

/**
 * Fraction of the history budget at which compaction should trigger.
 * Setting this below 1.0 leaves headroom so compaction runs before
 * the hard limit is actually reached.
 */
const TRIGGER_FRACTION = 0.8;

/** Fallback context window when the model's size can't be determined */
const DEFAULT_CONTEXT_WINDOW = 128_000;

export interface ContextBudget {
  /** Total context window size for the model in tokens */
  totalBudget: number;
  /** Token budget available for conversation history (after reserving for overhead) */
  historyBudget: number;
  /** Token count at which compaction should be triggered */
  triggerThreshold: number;
}

/**
 * Computes the token budget for conversation history based on the
 * connector's context window size.
 */
export const computeContextBudget = (connector: InferenceConnector): ContextBudget => {
  const totalBudget = getContextWindowSize(connector) ?? DEFAULT_CONTEXT_WINDOW;
  const historyBudget = Math.floor(totalBudget * (1 - RESERVED_FRACTION));
  const triggerThreshold = Math.floor(historyBudget * TRIGGER_FRACTION);

  return { totalBudget, historyBudget, triggerThreshold };
};

const sumTokens = (counts: number[]): number => counts.reduce((total, count) => total + count, 0);

/**
 * Determines whether compaction should be triggered given precomputed per-round
 * token counts, the context budget, and any existing compaction summary.
 *
 * When an existing summary is provided, the effective token count is the summary's
 * token cost plus only the rounds not yet covered by the summary, rather than the
 * raw total of all stored rounds.
 */
export const shouldTriggerCompaction = (
  perRoundTokenCounts: number[],
  budget: ContextBudget,
  existingSummary?: CompactionSummary
): boolean => {
  const effectiveTokens = existingSummary
    ? existingSummary.token_count +
      sumTokens(perRoundTokenCounts.slice(existingSummary.summarized_round_count))
    : sumTokens(perRoundTokenCounts);
  return effectiveTokens > budget.triggerThreshold;
};
