/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { Coordinate } from './coordinate';
import type { AnomalyDetectorType } from './anomaly_detector_type';

export interface ServiceAnomalyTimeseries {
  jobId: string;
  type: AnomalyDetectorType;
  environment: string;
  serviceName: string;
  version: number;
  transactionType: string;
  anomalies: Array<Coordinate & { actual: number | null; environment?: string }>;
  bounds: Array<{ x: number; y0: number | null; y1: number | null }>;
}
