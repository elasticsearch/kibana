/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnomalyHit } from './types';

// ---------------------------------------------------------------------------
// AnomalyHit
// ---------------------------------------------------------------------------

export const makeAnomaly = (overrides: Partial<AnomalyHit> = {}): AnomalyHit => ({
  _id: 'anomaly-hit-1',
  entityId: 'user:alice',
  jobId: 'security-job-1',
  detectorIndex: 0,
  detectorFunction: 'rare',
  timestamp: 1778241600000,
  recordScore: 75,
  actual: 5,
  typical: 1,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Raw ML anomaly search hit (used by fetch_anomalies tests)
// ---------------------------------------------------------------------------

export const makeHit = (
  overrides: {
    id?: string;
    entityId?: string;
    jobId?: string;
    detectorIndex?: number;
    timestamp?: number;
    recordScore?: number;
    byFieldName?: string;
    byFieldValue?: string;
    actual?: number[];
    typical?: number[];
    sort?: unknown[];
    noSource?: boolean;
    noEntityId?: boolean;
    detectorFunction?: string;
  } = {}
) => {
  const {
    id,
    entityId = 'user:alice',
    jobId = 'security-job-1',
    detectorIndex = 0,
    timestamp = 1778241600000,
    recordScore = 75,
    byFieldName = 'client.geo.name',
    byFieldValue = 'Iran',
    actual = [5],
    typical = [1],
    sort = [timestamp, jobId, detectorIndex],
    noSource = false,
    noEntityId = false,
    detectorFunction = 'rare',
  } = overrides;

  return {
    _id: id ?? 'hit-1',
    _source: noSource
      ? undefined
      : {
          job_id: jobId,
          detector_index: detectorIndex,
          result_type: 'record',
          probability: 0.01,
          multi_bucket_impact: 0.5,
          timestamp,
          record_score: recordScore,
          initial_record_score: recordScore,
          function: detectorFunction,
          bucket_span: 900,
          is_interim: false,
          by_field_name: byFieldName,
          by_field_value: byFieldValue,
          partition_field_name: 'host.name',
          partition_field_value: 'web-01',
          function_description: 'rare',
          actual,
          typical,
        },
    fields: noEntityId ? {} : { entity_id: [entityId] },
    sort,
  };
};

export const makeResponse = (hits: ReturnType<typeof makeHit>[], total?: number) => ({
  hits: { hits, total: { value: total ?? hits.length, relation: 'eq' as const } },
});

// ---------------------------------------------------------------------------
// msearch responses (used by fetch_baseline_behavior tests)
// ---------------------------------------------------------------------------

export const makeMsearchResponse = (responses: unknown[]) => ({ responses });
