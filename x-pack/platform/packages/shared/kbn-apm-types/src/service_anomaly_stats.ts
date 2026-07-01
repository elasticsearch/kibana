/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnomalyDetectorType } from './anomaly_detector_type';

export interface ServiceAnomalyStats {
  transactionType?: string;
  anomalyScore?: number;
  actualValue?: number;
  jobId?: string;
  detectorType?: AnomalyDetectorType;
}
