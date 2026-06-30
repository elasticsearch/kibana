/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureWithFilter } from '@kbn/significant-events-schema';
import type { Condition } from '@kbn/streamlang';

export function getEntityFilters(features: FeatureWithFilter[], maxFilters: number): Condition[] {
  if (features.length === 0) {
    return [];
  }

  const capped = [...features]
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .slice(0, maxFilters);
  return capped.map(({ filter }) => filter);
}
