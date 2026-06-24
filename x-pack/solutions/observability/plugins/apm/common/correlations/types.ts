/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { Environment } from '../environment_rt';

export interface FieldValuePair {
  fieldName: string;
  // For dynamic fieldValues we only identify fields as `string`,
  // but for example `http.response.status_code` which is part of
  // of the list of predefined field candidates is of type long/number.
  fieldValue: string | number;
  isFallbackResult?: boolean;
}

export interface HistogramItem {
  key: number;
  doc_count: number;
}

export interface ResponseHitSource {
  [s: string]: unknown;
}

export interface ResponseHit {
  _source: ResponseHitSource;
}

export interface CommonCorrelationsQueryParams {
  start: number;
  end: number;
  kuery: string;
  environment: Environment;
  query: QueryDslQueryContainer;
}

export type EntityType = 'transaction' | 'exit_span';
export type Metric = 'latency' | 'failure_rate' | 'throughput' | 'infra_metrics';

export interface UnifiedCorrelation {
  fieldName: string;
  fieldValue: string | number;
  correlation?: number;
  ksTest?: number;
  pValue?: number | null;
  score?: number;
  normalizedScore?: number;
  histogram?: HistogramItem[];
  isFallbackResult?: boolean;
  rpmDelta?: number;
  rpmBaseline?: number;
  doc_count?: number;
  bg_count?: number;
  failurePercentage?: number;
  successPercentage?: number;
}

export interface CorrelationsResponse {
  overallHistogram?: HistogramItem[];
  errorHistogram?: HistogramItem[];
  totalDocCount: number;
  percentileThresholdValue?: number | null;
  durationMin: number;
  durationMax: number;
  fieldCandidates: string[];
  correlations: UnifiedCorrelation[];
  ccsWarning: boolean;
  fallbackResult?: UnifiedCorrelation;
}
