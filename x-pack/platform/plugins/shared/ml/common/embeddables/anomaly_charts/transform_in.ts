/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Reference } from '@kbn/content-management-utils';
import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';

export function transformIn(state: AnomalyChartsEmbeddableState): {
  state: AnomalyChartsEmbeddableState;
  references: Reference[];
} {
  return { state, references: [] };
}
