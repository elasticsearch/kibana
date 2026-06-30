/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { prepareTrendInputs } from './prepare_trend_inputs';

const thresholdRule = (query: object): RuleResponse =>
  ({ id: 'rule1', query } as unknown as RuleResponse);

const breachComposed = {
  format: 'composed',
  base: 'FROM logs-* | STATS count = COUNT(*) BY `host.name`',
  breach: { segment: '| WHERE count > 100' },
};

describe('prepareTrendInputs', () => {
  it('returns null when the rule is missing', () => {
    expect(prepareTrendInputs(undefined)).toBeNull();
  });

  it('returns null when the rule query is not a parseable threshold rule', () => {
    const standalone = { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 10' } };
    expect(prepareTrendInputs(thresholdRule(standalone))).toBeNull();
  });

  it('returns one group per threshold-referenced metric', () => {
    const groups = prepareTrendInputs(thresholdRule(breachComposed));
    expect(groups).not.toBeNull();
    expect(groups).toHaveLength(1);
    expect(groups![0].metricLabel).toBe('count');
    expect(groups![0].thresholds).toEqual([
      { id: expect.any(String), metric: 'count', label: 'count > 100', values: [100] },
    ]);
  });

  it('plots only threshold-referenced metrics, excluding stats used solely in evals', () => {
    const breachWithEval = {
      format: 'composed',
      base: 'FROM logs-* | STATS errors = COUNT(*) WHERE status >= 500, total = COUNT(*) | EVAL error_rate = errors / total * 100',
      breach: { segment: '| WHERE error_rate > 5' },
    };
    const groups = prepareTrendInputs(thresholdRule(breachWithEval));
    expect(groups).toHaveLength(1);
    expect(groups![0].metricLabel).toBe('error_rate');
  });

  it('returns one group per metric when multiple metrics have thresholds', () => {
    const breachMixed = {
      format: 'composed',
      base: 'FROM logs-* | STATS errors = COUNT(*), total = COUNT(*) | EVAL error_rate = errors / total * 100',
      breach: { segment: '| WHERE errors > 10 AND error_rate > 5' },
    };
    const groups = prepareTrendInputs(thresholdRule(breachMixed));
    expect(groups).toHaveLength(2);
    expect(groups!.map((g) => g.metricLabel)).toEqual(['errors', 'error_rate']);
  });

  it('assigns all threshold conditions for a metric to its group', () => {
    const breachMultiThreshold = {
      format: 'composed',
      base: 'FROM logs-* | STATS count = COUNT(*)',
      breach: { segment: '| WHERE count > 100 AND count < 500' },
    };
    const groups = prepareTrendInputs(thresholdRule(breachMultiThreshold));
    expect(groups).toHaveLength(1);
    expect(groups![0].thresholds).toHaveLength(2);
  });
});
