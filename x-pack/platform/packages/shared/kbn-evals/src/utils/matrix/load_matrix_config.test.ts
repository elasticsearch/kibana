/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseMatrixConfig, DEFAULT_EXCLUDED_EVALUATORS } from './load_matrix_config';

describe('parseMatrixConfig', () => {
  const minimalConfig = {
    columns: [{ id: 'alert_triage', label: 'Alert Triage', suites: ['security-alert-triage'] }],
    models: [{ id: 'eis/foo', label: 'Foo' }],
  };

  it('applies defaults for optional fields', () => {
    const config = parseMatrixConfig(minimalConfig);

    expect(config.branch).toBe('main');
    expect(config.defaultScale).toBe(10);
    expect(config.decimals).toBe(2);
    expect(config.notRecommendedBelow).toBe(0);
    expect(config.notRecommendedLabel).toBe('Not recommended');
    expect(config.notRecommendedCountsAsZeroInOverall).toBe(true);
    expect(config.overall).toEqual({ label: 'Overall', mode: 'weighted' });
    expect(config.columns[0].weight).toBe(1);
    expect(config.models[0].openSource).toBe(false);
    expect(config.excludeEvaluators).toEqual([...DEFAULT_EXCLUDED_EVALUATORS]);
  });

  it('allows overriding the evaluator exclusion list (including emptying it)', () => {
    expect(
      parseMatrixConfig({ ...minimalConfig, excludeEvaluators: [] }).excludeEvaluators
    ).toEqual([]);
    expect(
      parseMatrixConfig({ ...minimalConfig, excludeEvaluators: ['Latency'] }).excludeEvaluators
    ).toEqual(['Latency']);
  });

  it('throws when a column has no suites', () => {
    expect(() =>
      parseMatrixConfig({
        ...minimalConfig,
        columns: [{ id: 'x', label: 'X', suites: [] }],
      })
    ).toThrow();
  });

  it('throws when there are no columns or models', () => {
    expect(() => parseMatrixConfig({ columns: [], models: [] })).toThrow();
  });

  it('rejects an invalid overall mode', () => {
    expect(() => parseMatrixConfig({ ...minimalConfig, overall: { mode: 'nope' } })).toThrow();
  });
});
