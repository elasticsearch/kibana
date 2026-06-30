/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface SignificantEventsTuningConfig {
  sample_size: number;
  max_iterations: number;
  feature_ttl_days: number;
  entity_filtered_ratio: number;
  diverse_ratio: number;
  max_excluded_features_in_prompt: number;
  max_entity_filters: number;
  semantic_min_score: number;
  rrf_rank_constant: number;
}

export const DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG: SignificantEventsTuningConfig = {
  sample_size: 20,
  max_iterations: 5,
  feature_ttl_days: 30,
  entity_filtered_ratio: 0.4,
  diverse_ratio: 0.4,
  max_excluded_features_in_prompt: 10,
  max_entity_filters: 10,
  semantic_min_score: 0.15,
  rrf_rank_constant: 20,
};
