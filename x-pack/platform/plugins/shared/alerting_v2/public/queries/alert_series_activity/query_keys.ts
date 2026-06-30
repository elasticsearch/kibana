/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * React-query cache keys for the rule details overview tab. Owned by this
 * feature folder; the `@kbn/alerting-v2-episodes-ui` package owns its own
 * episode-scoped key namespace separately.
 */
export const ruleOverviewQueryKeys = {
  all: ['alerting-v2', 'rule-overview'] as const,
  topNSeries: (ruleId: string, windowStartMs: number, windowEndMs: number) =>
    [...ruleOverviewQueryKeys.all, 'top-n-series', ruleId, windowStartMs, windowEndMs] as const,
  episodeSelection: (
    ruleId: string,
    windowStartMs: number,
    windowEndMs: number,
    perLaneLimit: number,
    groupHashes: readonly string[]
  ) =>
    [
      ...ruleOverviewQueryKeys.all,
      'episode-selection',
      ruleId,
      windowStartMs,
      windowEndMs,
      perLaneLimit,
      [...groupHashes].sort(),
    ] as const,
  timelineSummary: (ruleId: string, windowStartMs: number, windowEndMs: number) =>
    [...ruleOverviewQueryKeys.all, 'timeline-summary', ruleId, windowStartMs, windowEndMs] as const,
  episodePhases: (
    ruleId: string,
    windowStartMs: number,
    windowEndMs: number,
    episodeIds: readonly string[]
  ) =>
    [
      ...ruleOverviewQueryKeys.all,
      'episode-phases',
      ruleId,
      windowStartMs,
      windowEndMs,
      [...episodeIds].sort(),
    ] as const,
  // Untimed: an episode's start is window-independent, so the cache survives time-range changes.
  episodeStarts: (ruleId: string, episodeIds: readonly string[]) =>
    [...ruleOverviewQueryKeys.all, 'episode-starts', ruleId, [...episodeIds].sort()] as const,
  seriesGroupingValues: (
    ruleId: string,
    groupHashes: readonly string[],
    groupingFields: readonly string[]
  ) =>
    [
      ...ruleOverviewQueryKeys.all,
      'series-grouping-values',
      ruleId,
      [...groupHashes].sort(),
      [...groupingFields].sort(),
    ] as const,
};
