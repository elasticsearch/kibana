/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { EntityType } from '@kbn/entity-store/common';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import { euid } from '@kbn/entity-store/common/euid_helpers';
import { ENTITY_ANOMALY_DEFAULT_LOOKBACK } from '../../../../common/constants';
import { getSecurityMlJobIds } from './get_security_ml_job_ids';
import type { AnomalyHit, RawAnomalyRecord } from './types';

interface RequiredHit {
  _id: string;
  _source: Required<RawAnomalyRecord>;
  fields?: Record<string, unknown>;
}

const mapToAnomalyHit = (hit: RequiredHit): AnomalyHit | undefined => {
  const { _id: id, _source: src } = hit;
  const entityId = (hit.fields?.entity_id as string[] | undefined)?.[0];
  if (!entityId) return undefined;
  return {
    _id: id,
    entityId,
    jobId: src.job_id,
    detectorIndex: src.detector_index,
    detectorFunction: src.function ?? '',
    timestamp: src.timestamp,
    recordScore: src.record_score,
    actual: src.actual[0],
    typical: src.typical[0],
    fieldName: src.field_name,
    byFieldName: src.by_field_name,
    byFieldValue: src.by_field_value,
    overFieldName: src.over_field_name,
    overFieldValue: src.over_field_value,
    partitionFieldName: src.partition_field_name,
    partitionFieldValue: src.partition_field_value,
  };
};

export interface EntityAnomalies {
  [jobId: string]: AnomalyHit[];
}

export type AnomalySortField = 'timestamp' | 'record_score' | 'job_id';
export type AnomalySortOrder = 'asc' | 'desc';

const ANOMALY_SORT_FIELD_MAP: Record<AnomalySortField, string> = {
  timestamp: 'timestamp',
  record_score: 'record_score',
  job_id: 'job_id',
};

const DEFAULT_SORT_SPEC: Array<{ field: AnomalySortField; order: AnomalySortOrder }> = [
  { field: 'timestamp', order: 'desc' },
];

export interface SearchEntityAnomaliesOpts {
  entityType: EntityType;
  entityId: string;
  fromMs?: number;
  toMs?: number;
  minScore?: number;
  maxScore?: number;
  jobIds?: string[];
  sort?: Array<{ field: AnomalySortField; order: AnomalySortOrder }>;
  from?: number;
  size?: number;
  logger: Logger;
  ml: MlPluginSetup;
  request: KibanaRequest;
  securityJobIds?: string[];
  soClient: SavedObjectsClientContract;
}

export interface SearchEntityAnomaliesResult {
  hits: AnomalyHit[];
  total: number;
}

export const searchEntityAnomalies = async ({
  entityType,
  entityId,
  fromMs,
  toMs,
  minScore,
  maxScore,
  jobIds: filterJobIds,
  sort = DEFAULT_SORT_SPEC,
  from = 0,
  size = 100,
  logger,
  ml,
  request,
  securityJobIds,
  soClient,
}: SearchEntityAnomaliesOpts): Promise<SearchEntityAnomaliesResult> => {
  const mlSystem = ml.mlSystemProvider(request, soClient);
  const jobIds = securityJobIds ?? (await getSecurityMlJobIds({ ml, request, soClient }));

  const empty: SearchEntityAnomaliesResult = { hits: [], total: 0 };

  if (jobIds.length === 0) return empty;

  // Intersect the caller-supplied job filter with the known security job IDs.
  const effectiveJobIds = filterJobIds?.length
    ? jobIds.filter((id) => filterJobIds.includes(id))
    : jobIds;

  if (effectiveJobIds.length === 0) return empty;

  try {
    const resp = await mlSystem.mlAnomalySearch<RawAnomalyRecord>(
      {
        from,
        size,
        track_total_hits: true,
        runtime_mappings: {
          entity_id: euid.painless.getEuidRuntimeMapping(entityType),
        },
        fields: ['entity_id'],
        query: {
          bool: {
            filter: [
              { term: { result_type: 'record' } },
              { term: { is_interim: false } },
              {
                range: {
                  record_score: {
                    gte: minScore || 1,
                    ...(maxScore !== undefined ? { lt: maxScore } : {}),
                  },
                },
              },
              {
                range: {
                  timestamp: {
                    gte: fromMs ?? `now-${ENTITY_ANOMALY_DEFAULT_LOOKBACK}`,
                    ...(toMs !== undefined ? { lte: toMs } : {}),
                  },
                },
              },
              { term: { entity_id: entityId } },
              { terms: { job_id: effectiveJobIds } },
            ],
          },
        },
        sort: sort.map(({ field, order }) => ({ [ANOMALY_SORT_FIELD_MAP[field]]: { order } })),
      },
      []
    );

    const rawTotal = resp.hits.total;
    const total = rawTotal == null ? 0 : typeof rawTotal === 'number' ? rawTotal : rawTotal.value;

    const hits = resp.hits.hits
      .filter(
        (hit): hit is typeof hit & RequiredHit =>
          hit._id != null &&
          hit._source?.actual?.[0] != null &&
          hit._source?.typical?.[0] != null &&
          hit._source?.detector_index != null &&
          (hit.fields?.entity_id as string[] | undefined)?.[0] != null
      )
      .map(mapToAnomalyHit)
      .filter((hit): hit is AnomalyHit => hit != null);

    return { hits, total };
  } catch (error) {
    logger.warn(
      `Error searching anomalies for entity "${entityId}" (type: ${entityType}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return empty;
  }
};
