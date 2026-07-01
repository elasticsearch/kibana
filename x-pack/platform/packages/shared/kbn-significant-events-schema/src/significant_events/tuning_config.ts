/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export interface TuningConfigFieldBounds {
  min: number;
  max?: number;
  /** UI hint: field should be a whole number. config-schema's schema.number() does not enforce this. */
  integer?: boolean;
}

// Shape-only schema — no bounds or cross-field checks. Bounds and validation
// logic live exclusively in SIGNIFICANT_EVENTS_TUNING_FIELD_BOUNDS and
// validateSignificantEventsTuningConfig to avoid drift between two sources.
export const significantEventsTuningConfigSchema = z.object({
  sample_size: z.number(),
  max_iterations: z.number(),
  feature_ttl_days: z.number(),
  entity_filtered_ratio: z.number(),
  diverse_ratio: z.number(),
  max_excluded_features_in_prompt: z.number(),
  max_entity_filters: z.number(),
  semantic_min_score: z.number(),
  rrf_rank_constant: z.number(),
});

export type SignificantEventsTuningConfig = z.infer<typeof significantEventsTuningConfigSchema>;

export const SIGNIFICANT_EVENTS_TUNING_FIELD_BOUNDS: Record<
  keyof SignificantEventsTuningConfig,
  TuningConfigFieldBounds
> = {
  sample_size: { min: 1, max: 100, integer: true },
  max_iterations: { min: 1, max: 20, integer: true },
  feature_ttl_days: { min: 1, integer: true },
  entity_filtered_ratio: { min: 0, max: 1 },
  diverse_ratio: { min: 0, max: 1 },
  max_excluded_features_in_prompt: { min: 0, max: 50, integer: true },
  max_entity_filters: { min: 1, max: 50, integer: true },
  semantic_min_score: { min: 0, max: 1 },
  rrf_rank_constant: { min: 1, max: 100, integer: true },
};

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

/**
 * Validates a partial config object and returns user-facing error strings.
 * Missing keys are allowed and fall back to defaults at runtime.
 */
export function validateSignificantEventsTuningConfig(parsed: Record<string, unknown>): string[] {
  const errors: string[] = [];

  const knownKeys = new Set(Object.keys(SIGNIFICANT_EVENTS_TUNING_FIELD_BOUNDS));
  for (const key of Object.keys(parsed)) {
    if (!knownKeys.has(key)) {
      errors.push(`Unknown key: "${key}"`);
    }
  }

  for (const [key, bounds] of Object.entries(SIGNIFICANT_EVENTS_TUNING_FIELD_BOUNDS)) {
    const value = parsed[key];
    if (value === undefined) continue;

    if (typeof value !== 'number') {
      errors.push(`"${key}" must be a number, got ${typeof value}`);
      continue;
    }
    if (Number.isNaN(value)) {
      errors.push(`"${key}" must be a number, got NaN`);
      continue;
    }
    if (bounds.integer && !Number.isInteger(value)) {
      errors.push(`"${key}" must be an integer`);
    }
    if (value < bounds.min || (typeof bounds.max === 'number' && value > bounds.max)) {
      if (typeof bounds.max === 'number') {
        errors.push(`"${key}" must be between ${bounds.min} and ${bounds.max}`);
      } else {
        errors.push(`"${key}" must be at least ${bounds.min}`);
      }
    }
  }

  const entityRatio =
    typeof parsed.entity_filtered_ratio === 'number'
      ? parsed.entity_filtered_ratio
      : DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG.entity_filtered_ratio;
  const diverseRatio =
    typeof parsed.diverse_ratio === 'number'
      ? parsed.diverse_ratio
      : DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG.diverse_ratio;
  if (entityRatio + diverseRatio > 1.0) {
    errors.push(
      `entity_filtered_ratio (${entityRatio}) + diverse_ratio (${diverseRatio}) must be <= 1.0 ` +
        `(remainder ${(1 - entityRatio - diverseRatio).toFixed(2)} is used for random sampling)`
    );
  }

  return errors;
}
