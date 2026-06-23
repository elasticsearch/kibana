/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import { resolveSeverityFormat } from '../../../../common/util/severity_threshold';

/**
 * Normalizes `tableSeverity` from SMV page vs embeddable vs dashboard into `SeverityThreshold[]`
 * for `getAnomaliesTableData`.
 *
 * - **Array** — already API-shaped; returned by reference.
 * - **Number** — legacy single minimum → canonical severity ranges at or above that value.
 * - **`{ val: SeverityThreshold[] }`** — publishing / app-state wrapper (must be a non-null array).
 * - **Anything else** — all canonical severity ranges.
 */
export function normalizeSeverityThresholdForApi(tableSeverity: unknown): SeverityThreshold[] {
  if (Array.isArray(tableSeverity)) {
    return tableSeverity as SeverityThreshold[];
  }

  if (typeof tableSeverity === 'number') {
    return resolveSeverityFormat(tableSeverity);
  }

  if (tableSeverity !== null && typeof tableSeverity === 'object' && 'val' in tableSeverity) {
    const val = (tableSeverity as { val: unknown }).val;
    if (Array.isArray(val)) {
      return val as SeverityThreshold[];
    }
  }

  return resolveSeverityFormat(ML_ANOMALY_THRESHOLD.LOW);
}
