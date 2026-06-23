/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceConnector } from '@kbn/inference-common';
import { InferenceConnectorType } from '@kbn/inference-common';
import type { CompactionSummary } from '@kbn/agent-builder-common';
import { computeContextBudget, shouldTriggerCompaction } from './context_budget';

const createMockConnector = (contextWindowSize?: number): InferenceConnector => ({
  type: InferenceConnectorType.OpenAI,
  isInferenceEndpoint: false,
  isPreconfigured: false,
  name: 'test-connector',
  connectorId: 'test-id',
  config: {
    ...(contextWindowSize !== undefined ? { contextWindowLength: contextWindowSize } : {}),
  },
  capabilities: {
    ...(contextWindowSize !== undefined ? { contextWindowSize } : {}),
  },
});

const createSummary = (summarizedRoundCount: number, tokenCount: number): CompactionSummary =>
  ({
    summarized_round_count: summarizedRoundCount,
    created_at: new Date().toISOString(),
    token_count: tokenCount,
    structured_data: {},
  } as unknown as CompactionSummary);

describe('computeContextBudget', () => {
  it('should compute budget from connector context window size', () => {
    const connector = createMockConnector(128000);
    const budget = computeContextBudget(connector);

    expect(budget.totalBudget).toBe(128000);
    expect(budget.historyBudget).toBe(89600); // 128000 * 0.7 (1 - RESERVED_FRACTION)
    expect(budget.triggerThreshold).toBe(71680); // 89600 * 0.8 (TRIGGER_FRACTION)
  });

  it('should use default context window when connector has no size', () => {
    const connector = createMockConnector();
    // Override config to not have contextWindowLength
    connector.config = {};
    const budget = computeContextBudget(connector);

    expect(budget.totalBudget).toBe(128000); // default
    expect(budget.historyBudget).toBe(89600); // 128000 * 0.7
    expect(budget.triggerThreshold).toBe(71680); // 89600 * 0.8
  });

  it('should scale with large context windows', () => {
    const connector = createMockConnector(1000000);
    const budget = computeContextBudget(connector);

    expect(budget.totalBudget).toBe(1000000);
    expect(budget.historyBudget).toBe(700000); // 1000000 * 0.7
    expect(budget.triggerThreshold).toBe(560000); // 700000 * 0.8
  });
});

describe('shouldTriggerCompaction', () => {
  const budget = computeContextBudget(createMockConnector(128000)); // triggerThreshold 71680

  it('should not trigger when total round tokens are under the threshold', () => {
    expect(shouldTriggerCompaction([100, 200, 300], budget)).toBe(false);
  });

  it('should trigger when total round tokens exceed the threshold', () => {
    expect(shouldTriggerCompaction([50_000, 30_000], budget)).toBe(true); // 80_000 > 71_680
  });

  it('should return false for empty conversations', () => {
    expect(shouldTriggerCompaction([], budget)).toBe(false);
  });

  it('should count only rounds beyond an existing summary plus the summary cost', () => {
    const counts = [60_000, 60_000, 5_000];
    const existingSummary = createSummary(2, 1_000);

    // effective = 1_000 (summary) + 5_000 (uncovered round) = 6_000 -> under threshold
    expect(shouldTriggerCompaction(counts, budget, existingSummary)).toBe(false);
    // without the summary, the raw total (125_000) exceeds the threshold
    expect(shouldTriggerCompaction(counts, budget)).toBe(true);
  });
});
