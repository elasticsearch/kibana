/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  parseMatrixConfig,
  DEFAULT_EXCLUDED_EVALUATORS,
  applyModelOverrides,
  parseModelOverride,
} from './load_matrix_config';

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
    expect(config.overall).toEqual({
      label: 'Overall',
      mode: 'weighted',
      excludeSaturatedEvaluators: false,
    });
    expect(config.showOverall).toBe(true);
    expect(config.composites).toEqual([]);
    expect(config.layout).toBeUndefined();
    expect(config.columns[0].weight).toBe(1);
    expect(config.columns[0].group).toBeUndefined();
    expect(config.models[0].openSource).toBe(false);
    expect(config.excludeEvaluators).toEqual([...DEFAULT_EXCLUDED_EVALUATORS]);
  });

  it('accepts grouped columns, composites, a layout, and showOverall', () => {
    const config = parseMatrixConfig({
      ...minimalConfig,
      showOverall: false,
      columns: [
        { id: 'a', label: 'A', group: 'Agent Builder', suites: ['s-a'] },
        { id: 'b', label: 'B', group: 'Agent Builder', suites: ['s-b'] },
      ],
      composites: [{ id: 'ab', label: 'AB Score', from: ['a', 'b'] }],
      layout: ['a', 'b', 'ab'],
    });

    expect(config.showOverall).toBe(false);
    expect(config.columns[0].group).toBe('Agent Builder');
    expect(config.composites).toEqual([{ id: 'ab', label: 'AB Score', from: ['a', 'b'] }]);
    expect(config.layout).toEqual(['a', 'b', 'ab']);
  });

  it('throws when a composite has no source columns', () => {
    expect(() =>
      parseMatrixConfig({
        ...minimalConfig,
        composites: [{ id: 'ab', label: 'AB', from: [] }],
      })
    ).toThrow();
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

describe('applyModelOverrides', () => {
  const base = parseMatrixConfig({
    title: 'Weekly',
    columns: [{ id: 'triage', label: 'Triage', suites: ['suite-a'], weight: 1 }],
    models: [
      { id: 'weekly-1', label: 'Weekly One' },
      { id: 'weekly-2', label: 'Weekly Two' },
    ],
  });

  it('returns the config untouched when no overrides are given', () => {
    expect(applyModelOverrides(base, [])).toBe(base);
  });

  it('replaces rather than appends, so an on-demand run shows only what was asked for', () => {
    const result = applyModelOverrides(base, ['custom-a']);
    expect(result.models).toEqual([{ id: 'custom-a', label: 'custom-a', openSource: false }]);
  });

  it('does not mutate the weekly config', () => {
    applyModelOverrides(base, ['custom-a']);
    expect(base.models.map((m) => m.id)).toEqual(['weekly-1', 'weekly-2']);
  });

  it('parses label and explicit open-source marker', () => {
    expect(applyModelOverrides(base, ['qwen3-72b:Qwen3 72B:open-source']).models[0]).toEqual({
      id: 'qwen3-72b',
      label: 'Qwen3 72B',
      openSource: true,
    });
  });

  it('defaults the label to the id and openSource to false', () => {
    expect(parseModelOverride('gpt-5')).toEqual({
      id: 'gpt-5',
      label: 'gpt-5',
      openSource: false,
    });
  });

  it('rejects a bogus third segment instead of silently treating it as proprietary', () => {
    expect(() => parseModelOverride('gpt-5:GPT-5:oss')).toThrow(/literal "open-source"/);
  });

  it('rejects too many segments', () => {
    expect(() => parseModelOverride('a:b:open-source:c')).toThrow(/at most 3/);
  });

  it('rejects an empty id', () => {
    expect(() => parseModelOverride(':Label')).toThrow(/model id is required/);
  });

  it('rejects duplicate ids', () => {
    expect(() => applyModelOverrides(base, ['dup', 'dup:Other'])).toThrow(/Duplicate --model id/);
  });
});
