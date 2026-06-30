/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SignificantEventsTuningConfig } from '@kbn/streams-plugin/common';

interface FieldBounds {
  min: number;
  max?: number;
  integer?: boolean;
}

const FIELD_BOUNDS: Record<keyof SignificantEventsTuningConfig, FieldBounds> = {
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

export function validateSignificantEventsTuningConfig(parsed: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Check for unknown keys
  const knownKeys = new Set(Object.keys(FIELD_BOUNDS));
  for (const key of Object.keys(parsed)) {
    if (!knownKeys.has(key)) {
      errors.push(`Unknown key: "${key}"`);
    }
  }

  // Validate each known field
  for (const [key, bounds] of Object.entries(FIELD_BOUNDS)) {
    const value = parsed[key];
    if (value === undefined) continue; // Missing keys use defaults

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

  // Cross-field validation
  const entityRatio =
    typeof parsed.entity_filtered_ratio === 'number' ? parsed.entity_filtered_ratio : 0.4;
  const diverseRatio = typeof parsed.diverse_ratio === 'number' ? parsed.diverse_ratio : 0.4;
  if (entityRatio + diverseRatio > 1.0) {
    errors.push(
      `entity_filtered_ratio (${entityRatio}) + diverse_ratio (${diverseRatio}) must be <= 1.0 ` +
        `(remainder ${(1 - entityRatio - diverseRatio).toFixed(2)} is used for random sampling)`
    );
  }

  return errors;
}
