/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';

export const anomalyThresholdRt = t.union([
  t.literal(ML_ANOMALY_SEVERITY.CRITICAL),
  t.literal(ML_ANOMALY_SEVERITY.MAJOR),
  t.literal(ML_ANOMALY_SEVERITY.MINOR),
  t.literal(ML_ANOMALY_SEVERITY.WARNING),
  t.literal(ML_ANOMALY_SEVERITY.LOW),
  t.literal('none'),
]);

export type AnomalyThreshold = t.TypeOf<typeof anomalyThresholdRt>;
