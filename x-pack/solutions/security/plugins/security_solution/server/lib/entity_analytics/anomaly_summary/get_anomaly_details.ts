/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { EntityType } from '@kbn/entity-store/common';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import type { AnomalySummaryEntry } from '../../../../common/api/entity_analytics';
import type {
  AnomalySortField,
  AnomalySortOrder,
  EnrichedAnomalyHit,
  JobConfig,
} from '../ml_anomaly_detection';
import {
  fetchBaselineBehavior,
  getJobConfig,
  getSecurityMlJobIds,
  searchEntityAnomalies,
} from '../ml_anomaly_detection';

const mapToAnomalySummaryEntry = (
  hit: EnrichedAnomalyHit,
  jobConfig: JobConfig | undefined
): AnomalySummaryEntry => ({
  jobId: hit.jobId,
  jobName: jobConfig?.jobName ?? null,
  threatTactics: jobConfig?.threatTactics,
  threatTechniques: jobConfig?.threatTechniques,
  detectorIndex: hit.detectorIndex,
  detectorFunction: hit.detectorFunction,
  fieldName: hit.fieldName ?? null,
  byFieldName: hit.byFieldName ?? null,
  byFieldValue: hit.byFieldValue ?? null,
  overFieldName: hit.overFieldName ?? null,
  overFieldValue: hit.overFieldValue ?? null,
  partitionFieldName: hit.partitionFieldName ?? null,
  partitionFieldValue: hit.partitionFieldValue ?? null,
  recordScore: hit.recordScore,
  timestamp: new Date(hit.timestamp).toISOString(),
  actual: hit.actual != null ? [hit.actual] : [],
  typical: hit.typical != null ? [hit.typical] : [],
  baselineValues: (hit.baselineValues ?? []).map(String),
  anomalousValue: hit.anomalousValue != null ? String(hit.anomalousValue) : undefined,
  anomalousValueCount: hit.anomalousValueCount,
});

interface GetEntityAnomaliesParams {
  entityId: string;
  entityType: EntityType;
  esClient: ElasticsearchClient;
  fromMs?: number;
  toMs?: number;
  minScore?: number;
  maxScore?: number;
  jobIds?: string[];
  threatTactics?: string[];
  logger: Logger;
  ml: MlPluginSetup;
  offset?: number;
  pageSize?: number;
  sort?: Array<{ field: AnomalySortField; order: AnomalySortOrder }>;
  soClient: SavedObjectsClientContract;
}

export interface GetEntityAnomaliesResult {
  anomalies: AnomalySummaryEntry[];
  total: number;
}

export const getEntityAnomalies = async ({
  entityId,
  entityType,
  esClient,
  fromMs,
  toMs,
  minScore,
  maxScore,
  jobIds,
  threatTactics,
  logger,
  ml,
  offset = 0,
  pageSize = 100,
  sort,
  soClient,
}: GetEntityAnomaliesParams): Promise<GetEntityAnomaliesResult> => {
  const allSecurityJobIds = await getSecurityMlJobIds({ ml, soClient });
  const allConfigs = await getJobConfig({ jobIds: allSecurityJobIds, logger, ml, soClient });

  let resolvedJobIds = jobIds;
  if (threatTactics && threatTactics.length > 0) {
    const tacticMatchedIds = allSecurityJobIds.filter((id) =>
      allConfigs.get(id)?.threatTactics.some((t) => threatTactics.includes(t))
    );

    resolvedJobIds = jobIds?.length
      ? jobIds.filter((id) => tacticMatchedIds.includes(id))
      : tacticMatchedIds;

    if (resolvedJobIds.length === 0) return { anomalies: [], total: 0 };
  }

  // 1. Fetch a single sorted, paginated page from the anomalies index.
  const { hits: page, total } = await searchEntityAnomalies({
    entityType,
    entityId,
    fromMs,
    toMs,
    minScore,
    maxScore,
    jobIds: resolvedJobIds,
    sort,
    from: offset,
    size: pageSize,
    logger,
    ml,
    soClient,
  });

  if (page.length === 0) return { anomalies: [], total };

  // 2. Enrich each anomaly with behavioral context information
  //    Failures fall back to the un-enriched record.
  const enriched = await Promise.all(
    page.map((anomaly) =>
      fetchBaselineBehavior({
        anomaly,
        entityId,
        entityType,
        esClient,
        fromMs,
        toMs,
        jobConfig: allConfigs.get(anomaly.jobId) ?? null,
        jobId: anomaly.jobId,
        logger,
      })
    )
  );

  return {
    anomalies: enriched.map((hit) => mapToAnomalySummaryEntry(hit, allConfigs.get(hit.jobId))),
    total,
  };
};
