/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnomalyThreshold } from '@kbn/apm-types';
import { anomalyThresholdRt } from '@kbn/apm-types';
import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';

export { anomalyThresholdRt, type AnomalyThreshold } from '@kbn/apm-types';

export const DEFAULT_ANOMALY_THRESHOLD = ML_ANOMALY_SEVERITY.MAJOR;

export const getAnomalyThreshold = (value: string | null | undefined): AnomalyThreshold => {
  if (!value) {
    return DEFAULT_ANOMALY_THRESHOLD;
  }

  if (!ensureAnomalyThreshold(value)) {
    return DEFAULT_ANOMALY_THRESHOLD;
  }

  return value;
};

function ensureAnomalyThreshold(value: string): value is AnomalyThreshold {
  return anomalyThresholdRt.is(value);
}
