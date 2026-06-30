/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * React-query cache keys for the signal rule overview (firing-frequency
 * histogram + KPIs). Kept separate from `ruleOverviewQueryKeys`, which is
 * scoped to the episode/alert timeline.
 */
export const signalOverviewQueryKeys = {
  all: ['alerting-v2', 'signal-overview'] as const,
  firingsHistogram: (ruleId: string, gteMs: number, lteMs: number, interval: string) =>
    [...signalOverviewQueryKeys.all, 'firings-histogram', ruleId, gteMs, lteMs, interval] as const,
  firingsSummary: (ruleId: string, gteMs: number, lteMs: number) =>
    [...signalOverviewQueryKeys.all, 'firings-summary', ruleId, gteMs, lteMs] as const,
};
