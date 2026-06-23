/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * React Query key factory for the rule form.
 *
 * Centralises cache keys so queries can be invalidated or matched consistently.
 *
 * The preview key intentionally does **not** include a caller-specific segment
 * (e.g. 'rulePreview' vs 'recoveryPreview'). When two previews resolve to the
 * same ES|QL query + timeField + lookback, they share a single cache entry so
 * React Query deduplicates the request and both consumers receive identical
 * data. This prevents the subtle bug where two independent fetches of the same
 * query compute slightly different `Date.now()` time windows and return
 * different rows.
 */
export const ruleFormKeys = {
  all: ['ruleForm'] as const,
  indexSources: () => [...ruleFormKeys.all, 'indexSources'] as const,
  preview: (query: string, timeField: string, lookback: string) =>
    [...ruleFormKeys.all, 'preview', query, timeField, lookback] as const,
  queryColumns: (query: string) => [...ruleFormKeys.all, 'queryColumns', query] as const,
  dataFields: (query: string) => [...ruleFormKeys.all, 'dataFields', query] as const,
  composeDiscoverApiTimeField: (fromSourceQuery: string) =>
    [...ruleFormKeys.all, 'composeDiscoverApiTimeField', fromSourceQuery] as const,
};
