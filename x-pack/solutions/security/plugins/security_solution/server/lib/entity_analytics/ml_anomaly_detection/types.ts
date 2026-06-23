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

export interface RawAnomalyRecord {
  _id?: string;
  timestamp: number;
  job_id: string;
  detector_index: number;
  function?: string;
  record_score: number;
  field_name?: string;
  by_field_name?: string;
  by_field_value?: string;
  over_field_name?: string;
  over_field_value?: string;
  partition_field_name?: string;
  partition_field_value?: string;
  actual?: number[];
  typical?: number[];
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
