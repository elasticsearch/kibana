/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackDiscovery } from '@kbn/elastic-assistant-common';
import {
  createNoFabricationEvaluator,
  NO_FABRICATION_EVALUATOR_NAME,
} from './no_fabrication_evaluator';
import type { AttackDiscoveryTaskOutput } from '../types';

const insight = (): AttackDiscovery =>
  ({ title: 'x', summaryMarkdown: 'x', detailsMarkdown: 'x', alertIds: [] } as AttackDiscovery);

const params = (
  insights: AttackDiscoveryTaskOutput['insights'],
  { negative }: { negative: boolean }
) => ({
  input: { mode: 'bundledAlerts' as const, anonymizedAlerts: [] },
  output: { insights },
  expected: { attackDiscoveries: [] },
  metadata: negative ? { testType: 'negative' } : {},
});

describe('createNoFabricationEvaluator', () => {
  it('has the expected name and CODE kind', () => {
    const evaluator = createNoFabricationEvaluator();
    expect(evaluator.name).toBe(NO_FABRICATION_EVALUATOR_NAME);
    expect(evaluator.kind).toBe('CODE');
  });

  it('passes a negative case that produced no insights', async () => {
    const evaluator = createNoFabricationEvaluator();
    const result = await evaluator.evaluate(params([], { negative: true }));
    expect(result.score).toBe(1);
    expect(result.label).toBe('PASS');
  });

  it('returns N/A on a negative case whose task errored (null insights)', async () => {
    const evaluator = createNoFabricationEvaluator();
    const result = await evaluator.evaluate(params(null, { negative: true }));
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('fails a negative case that fabricated insights', async () => {
    const evaluator = createNoFabricationEvaluator();
    const result = await evaluator.evaluate(params([insight(), insight()], { negative: true }));
    expect(result.score).toBe(0);
    expect(result.label).toBe('FAIL');
    expect(result.metadata?.insightCount).toBe(2);
  });

  it('returns N/A (null score) on positive examples', async () => {
    const evaluator = createNoFabricationEvaluator();
    const result = await evaluator.evaluate(params([insight()], { negative: false }));
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });
});
