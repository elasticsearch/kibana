/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { EntityType } from '@kbn/entity-store/common';
import { euid } from '@kbn/entity-store/common/euid_helpers';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import { compact } from 'lodash';
import { ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS } from '../../../../common/constants';
import { deriveBucketInterval } from '../../../../common/entity_analytics/anomalies/derive_bucket_interval';
import type {
  AnomalyOverviewEntry,
  AnomalyOverviewHit,
} from '../../../../common/api/entity_analytics';
import { getJobConfig, getSecurityMlJobIds } from '../ml_anomaly_detection';
import type { RawAnomalyRecord } from '../ml_anomaly_detection/types';

const NUM_RECENT_ANOMALIES = 3;
export const DEFAULT_OVERVIEW_LOOKBACK_MS =
  ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

interface TimeBucket {
  key_as_string: string;
  key: number;
  doc_count: number;
  max_score: { value: number | null };
  jobs: { buckets: Array<{ key: string; doc_count: number }> };
}

interface OverviewAggs {
  by_time: { buckets: TimeBucket[] };
  all_jobs: { buckets: Array<{ key: string }> };
}

interface GetEntityAnomalyOverviewParams {
  entityId: string;
  entityType: EntityType;
  fromMs?: number;
  toMs?: number;
  minScore?: number;
  maxScore?: number;
  threatTactics?: string[];
  logger: Logger;
  ml: MlPluginSetup;
  soClient: SavedObjectsClientContract;
}

const buildTacticCounts = (
  buckets: TimeBucket[],
  tacticsByJob: Map<string, string[]>
): Record<string, number> =>
  buckets
    .flatMap((b) => b.jobs.buckets)
    .flatMap(({ key, doc_count }) =>
      (tacticsByJob.get(key) ?? []).map((tactic) => ({ tactic, doc_count }))
    )
    .reduce<Record<string, number>>((acc, { tactic, doc_count }) => {
      acc[tactic] = (acc[tactic] ?? 0) + doc_count;
      return acc;
    }, {});

interface AnomalyOverview {
  anomalyByTimeBucket: AnomalyOverviewEntry[];
  recentAnomalies: AnomalyOverviewHit[];
  tacticCounts: Record<string, number>;
  totalAnomaliesCount: number;
  from: number;
  to: number;
}

export const getEntityAnomalyOverview = async ({
  entityId,
  entityType,
  fromMs,
  toMs,
  minScore,
  maxScore,
  threatTactics,
  logger,
  ml,
  soClient,
}: GetEntityAnomalyOverviewParams): Promise<AnomalyOverview> => {
  const effectiveToMs = toMs ?? Date.now();
  const effectiveFromMs = fromMs ?? effectiveToMs - DEFAULT_OVERVIEW_LOOKBACK_MS;
  const bucketInterval = deriveBucketInterval(effectiveFromMs, effectiveToMs);
  const empty: AnomalyOverview = {
    anomalyByTimeBucket: [],
    recentAnomalies: [],
    tacticCounts: {},
    totalAnomaliesCount: 0,
    from: effectiveFromMs,
    to: effectiveToMs,
  };

  const mlSystem = ml.mlSystemProvider({} as KibanaRequest, soClient);
  const allSecurityJobIds = await getSecurityMlJobIds({ ml, soClient });

  if (allSecurityJobIds.length === 0) return empty;

  const allJobConfigs = await getJobConfig({ jobIds: allSecurityJobIds, logger, ml, soClient });

  let resolvedJobIds = allSecurityJobIds;
  if (threatTactics && threatTactics.length > 0) {
    const tacticMatchedIds = allSecurityJobIds.filter((id) =>
      allJobConfigs.get(id)?.threatTactics.some((t) => threatTactics.includes(t))
    );
    resolvedJobIds = tacticMatchedIds;
  }

  if (threatTactics && threatTactics.length > 0 && resolvedJobIds.length === 0) return empty;

  let aggs: OverviewAggs | undefined;
  let rawHits: RawAnomalyRecord[] = [];
  let totalAnomaliesCount = 0;

  try {
    const resp = await mlSystem.mlAnomalySearch<RawAnomalyRecord>(
      {
        size: NUM_RECENT_ANOMALIES,
        track_total_hits: true,
        runtime_mappings: {
          entity_id: euid.painless.getEuidRuntimeMapping(entityType),
        },
        query: {
          bool: {
            filter: [
              { term: { result_type: 'record' } },
              { term: { is_interim: false } },
              {
                range: {
                  record_score: {
                    gte: minScore ?? 1,
                    ...(maxScore !== undefined ? { lte: maxScore } : {}),
                  },
                },
              },
              { range: { timestamp: { gte: effectiveFromMs, lte: effectiveToMs } } },
              { term: { entity_id: entityId } },
              ...(resolvedJobIds.length > 0 ? [{ terms: { job_id: resolvedJobIds } }] : []),
            ],
          },
        },
        sort: [{ timestamp: { order: 'desc' } }, { record_score: { order: 'desc' } }],
        aggs: {
          by_time: {
            date_histogram: {
              field: 'timestamp',
              fixed_interval: `${bucketInterval.value}${bucketInterval.unit}`,
            },
            aggs: {
              max_score: { max: { field: 'record_score' } },
              jobs: { terms: { field: 'job_id', size: 200 } },
            },
          },
          all_jobs: {
            terms: { field: 'job_id', size: 200 },
          },
        },
      },
      []
    );

    aggs = resp.aggregations as unknown as OverviewAggs | undefined;
    rawHits = compact(resp.hits.hits.map((h) => h._source));
    const total = resp.hits.total;
    totalAnomaliesCount = total == null ? 0 : typeof total === 'number' ? total : total.value;
  } catch (err) {
    logger.warn(`Error fetching anomaly overview for "${entityId}": ${err}`);
    return empty;
  }

  const presentJobIds = (aggs?.all_jobs?.buckets ?? []).map((b) => b.key);
  if (presentJobIds.length === 0) return empty;

  // Build jobId → tactics lookup once, reused per bucket.
  const tacticsByJob = new Map(
    presentJobIds.map((id) => [id, allJobConfigs.get(id)?.threatTactics ?? []])
  );

  const anomalyByTimeBucket: AnomalyOverviewEntry[] = (aggs?.by_time?.buckets ?? [])
    .filter((b) => b.doc_count > 0 && b.max_score.value !== null)
    .map((b) => {
      const bucketJobIds = b.jobs.buckets.map((j) => j.key);
      const tactics = [...new Set(bucketJobIds.flatMap((id) => tacticsByJob.get(id) ?? []))];
      return {
        timestamp: new Date(b.key).toISOString(),
        maxScore: b.max_score.value as number,
        threatTactics: tactics,
      };
    });

  const tacticCounts = buildTacticCounts(aggs?.by_time?.buckets ?? [], tacticsByJob);

  const recentAnomalies: AnomalyOverviewHit[] = rawHits.map((anomaly) => {
    const jobConfig = allJobConfigs.get(anomaly.job_id);
    const detector = jobConfig?.detectors[anomaly.detector_index];

    let anomalousValue: string | undefined;

    if (detector?.function === 'rare') {
      anomalousValue = anomaly.by_field_value;
    } else {
      anomalousValue = anomaly.actual?.[0] != null ? String(anomaly.actual[0]) : undefined;
    }
    return {
      jobId: anomaly.job_id,
      jobName: jobConfig?.jobName ?? anomaly.job_id,
      timestamp: new Date(anomaly.timestamp).toISOString(),
      anomalousValue: anomalousValue ?? null,
    };
  });

  return {
    anomalyByTimeBucket,
    recentAnomalies,
    tacticCounts,
    totalAnomaliesCount,
    from: effectiveFromMs,
    to: effectiveToMs,
  };
};
