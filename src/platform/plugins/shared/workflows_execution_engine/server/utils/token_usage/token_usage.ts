/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowTokenUsage } from '@kbn/workflows';

/**
 * Normalizes LLM token usage reported by token-consuming steps so the engine
 * can aggregate it uniformly. Steps emit usage under `output.metadata.usage`
 * (the contract established by the `ai.agent` step); this helper reads that
 * shape defensively and returns a `WorkflowTokenUsage` only when at least one
 * of `inputTokens` / `outputTokens` is present and valid.
 *
 * Returns `undefined` for any step that did not report usage (the common
 * case), so callers can treat "no usage" and "zero usage" distinctly and avoid
 * writing empty `usage` objects onto non-AI steps.
 *
 * `totalTokens` is always recomputed from input + output rather than trusting
 * the reported total, so the per-step and per-execution sums stay internally
 * consistent even if a producer reports an inconsistent total. As a corollary,
 * a "total-only" report (a `totalTokens` with no input/output split) is
 * deliberately NOT honored — it returns `undefined` — since the engine has no
 * input/output breakdown to recompute from.
 */
export const extractTokenUsage = (output: unknown): WorkflowTokenUsage | undefined => {
  if (output == null || typeof output !== 'object') {
    return undefined;
  }

  const metadata = (output as { metadata?: unknown }).metadata;
  if (metadata == null || typeof metadata !== 'object') {
    return undefined;
  }

  const usage = (metadata as { usage?: unknown }).usage;
  if (usage == null || typeof usage !== 'object') {
    return undefined;
  }

  const inputTokens = toFiniteNumber((usage as { inputTokens?: unknown }).inputTokens);
  const outputTokens = toFiniteNumber((usage as { outputTokens?: unknown }).outputTokens);

  // A step reported usage only if at least one of the token fields is a valid
  // number. Otherwise treat it as "no usage" so we don't tag the step.
  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }

  const normalizedInput = inputTokens ?? 0;
  const normalizedOutput = outputTokens ?? 0;

  return {
    inputTokens: normalizedInput,
    outputTokens: normalizedOutput,
    totalTokens: normalizedInput + normalizedOutput,
  };
};

/**
 * Sums two token-usage records, treating `undefined` operands as "no usage".
 * Returns `undefined` only when both operands are absent, so the per-execution
 * aggregate stays absent until the first step reports usage.
 *
 * Always returns a fresh object (never an operand by reference), so the
 * per-execution aggregate and a step's own usage record never alias — mutating
 * one can never affect the other.
 */
export const sumTokenUsage = (
  current: WorkflowTokenUsage | undefined,
  next: WorkflowTokenUsage | undefined
): WorkflowTokenUsage | undefined => {
  if (!current && !next) {
    return undefined;
  }
  return {
    inputTokens: (current?.inputTokens ?? 0) + (next?.inputTokens ?? 0),
    outputTokens: (current?.outputTokens ?? 0) + (next?.outputTokens ?? 0),
    totalTokens: (current?.totalTokens ?? 0) + (next?.totalTokens ?? 0),
  };
};

const toFiniteNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};
