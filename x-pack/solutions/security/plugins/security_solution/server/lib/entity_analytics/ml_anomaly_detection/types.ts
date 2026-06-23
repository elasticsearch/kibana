/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface AnomalyHit {
  _id: string;
  entityId: string;
  jobId: string;
  detectorIndex: number;
  detectorFunction: string;
  timestamp: number;
  recordScore: number;
  actual: number;
  typical: number;
  fieldName?: string;
  byFieldName?: string;
  byFieldValue?: string;
  overFieldName?: string;
  overFieldValue?: string;
  partitionFieldName?: string;
  partitionFieldValue?: string;
}

export type EnrichedAnomalyHit = AnomalyHit & {
  // anomalous value - this is copied from the anomaly record
  anomalousValue?: number | string;
  // this is computed with a query against the source index
  anomalousValueCount?: number;

  // baseline values - this can either be computed with a query against the source index
  // or copied from the anomaly record typical field
  baselineValues?: Array<number | string>;
};
