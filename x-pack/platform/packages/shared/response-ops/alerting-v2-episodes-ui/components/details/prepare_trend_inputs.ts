/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getBreachEsqlQuery, type RuleResponse } from '@kbn/alerting-v2-schemas';
import { parseThresholdEsql } from '@kbn/alerting-v2-rule-form';
import { deriveTrendThresholds } from './trend_data';
import type { TrendMetricGroup } from './trend_types';

/**
 * Reads the threshold rule to produce one {@link TrendMetricGroup} per metric that
 * appears in an alert condition — each group carries the metric label and all
 * threshold conditions that check it.
 *
 * Returns null when the rule is not a parseable threshold rule — the caller then
 * renders nothing.
 */
export const prepareTrendInputs = (rule: RuleResponse | undefined): TrendMetricGroup[] | null => {
  if (!rule) return null;

  const parsed = parseThresholdEsql(getBreachEsqlQuery(rule.query));
  if (!parsed || parsed.stats.length === 0) return null;

  const allThresholds = deriveTrendThresholds(parsed.alertConditions);
  const thresholdMetrics = new Set(allThresholds.map((t) => t.metric));

  const seen = new Set<string>();
  const groups: TrendMetricGroup[] = [];

  for (const label of [
    ...parsed.stats.map((s) => s.label),
    ...parsed.evaluations.map((e) => e.label),
  ]) {
    if (!seen.has(label) && thresholdMetrics.has(label)) {
      seen.add(label);
      groups.push({
        metricLabel: label,
        thresholds: allThresholds.filter((t) => t.metric === label),
      });
    }
  }

  return groups.length > 0 ? groups : null;
};
