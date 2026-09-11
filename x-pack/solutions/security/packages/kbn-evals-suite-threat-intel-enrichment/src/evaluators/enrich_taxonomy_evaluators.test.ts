/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TaxonomyResponse } from '../types';
import {
  createCategoryRecallEvaluator,
  createRegionRecallEvaluator,
} from './enrich_taxonomy_evaluators';

const taxonomyOutput = (overrides: Partial<TaxonomyResponse> = {}): TaxonomyResponse => ({
  categories: [],
  regions: [],
  relevance: 0,
  diamond_suitable: false,
  ...overrides,
});

describe('createCategoryRecallEvaluator', () => {
  const evaluator = createCategoryRecallEvaluator();

  it('returns full recall when every labelled category appears in the output', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: taxonomyOutput({ categories: ['cloud-security', 'data-breach', 'ransomware'] }),
      expected: { categories: ['cloud-security', 'data-breach'], regions: [] },
    });
    expect(result.score).toBe(1);
  });

  it('returns partial recall when only some labelled categories appear', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: taxonomyOutput({ categories: ['cloud-security'] }),
      expected: { categories: ['cloud-security', 'data-breach'], regions: [] },
    });
    expect(result.score).toBe(0.5);
  });

  it('returns score 0 when the output categories are not an array', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: taxonomyOutput({ categories: undefined as unknown as string[] }),
      expected: { categories: ['cloud-security'], regions: [] },
    });
    expect(result.score).toBe(0);
  });

  it('returns a null score when there are no labelled categories to recall', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: taxonomyOutput({ categories: ['cloud-security'] }),
      expected: { categories: [], regions: [] },
    });
    expect(result.score).toBeNull();
  });

  it('labels the empty-set case N/A so it is dropped from the mean', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: taxonomyOutput({ categories: ['cloud-security'] }),
      expected: { categories: [], regions: [] },
    });
    expect(result.label).toBe('N/A');
  });
});

describe('createRegionRecallEvaluator', () => {
  const evaluator = createRegionRecallEvaluator();

  it('returns a null score when a pack has no labelled regions to recall', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: taxonomyOutput({ regions: ['north-america'] }),
      expected: { categories: ['cloud-security'], regions: [] },
    });
    expect(result.score).toBeNull();
  });

  it('returns full recall when every labelled region appears in the output', async () => {
    const result = await evaluator.evaluate({
      input: undefined,
      metadata: undefined,
      output: taxonomyOutput({ regions: ['north-america', 'europe'] }),
      expected: { categories: [], regions: ['europe'] },
    });
    expect(result.score).toBe(1);
  });
});
