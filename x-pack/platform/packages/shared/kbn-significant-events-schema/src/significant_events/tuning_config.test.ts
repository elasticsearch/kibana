/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateSignificantEventsTuningConfig } from './tuning_config';

describe('validateSignificantEventsTuningConfig', () => {
  it('returns no errors for a valid config', () => {
    const errors = validateSignificantEventsTuningConfig({
      sample_size: 50,
      max_iterations: 10,
      feature_ttl_days: 30,
      entity_filtered_ratio: 0.4,
      diverse_ratio: 0.4,
      max_excluded_features_in_prompt: 10,
      max_entity_filters: 5,
      semantic_min_score: 0.15,
      rrf_rank_constant: 20,
    });
    expect(errors).toEqual([]);
  });

  it('returns no errors for an empty config (all defaults)', () => {
    expect(validateSignificantEventsTuningConfig({})).toEqual([]);
  });

  it('reports unknown keys', () => {
    const errors = validateSignificantEventsTuningConfig({ unknown_key: 42 });
    expect(errors).toEqual(['Unknown key: "unknown_key"']);
  });

  it('reports non-number values', () => {
    const errors = validateSignificantEventsTuningConfig({ sample_size: 'abc' });
    expect(errors).toEqual(['"sample_size" must be a number, got string']);
  });

  it('reports NaN values', () => {
    const errors = validateSignificantEventsTuningConfig({
      entity_filtered_ratio: NaN,
      diverse_ratio: NaN,
      semantic_min_score: NaN,
    });
    expect(errors).toEqual([
      '"entity_filtered_ratio" must be a number, got NaN',
      '"diverse_ratio" must be a number, got NaN',
      '"semantic_min_score" must be a number, got NaN',
    ]);
  });

  it('reports NaN for integer fields', () => {
    const errors = validateSignificantEventsTuningConfig({ sample_size: NaN });
    expect(errors).toEqual(['"sample_size" must be a number, got NaN']);
  });

  it('reports non-integer values for integer fields', () => {
    const errors = validateSignificantEventsTuningConfig({ sample_size: 1.5 });
    expect(errors).toEqual(['"sample_size" must be an integer']);
  });

  it('reports out-of-bounds values', () => {
    const errors = validateSignificantEventsTuningConfig({ sample_size: 200 });
    expect(errors).toEqual(['"sample_size" must be between 1 and 100']);
  });

  it('reports cross-field ratio violation', () => {
    const errors = validateSignificantEventsTuningConfig({
      entity_filtered_ratio: 0.7,
      diverse_ratio: 0.5,
    });
    expect(errors).toContainEqual(
      expect.stringContaining('entity_filtered_ratio (0.7) + diverse_ratio (0.5) must be <= 1.0')
    );
  });
});
