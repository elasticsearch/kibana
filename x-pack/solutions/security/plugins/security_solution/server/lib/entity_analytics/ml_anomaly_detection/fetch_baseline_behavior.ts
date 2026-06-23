/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type {
  MappingRuntimeFields,
  MlDetector,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import type { EntityType } from '@kbn/entity-store/common';
import { euid } from '@kbn/entity-store/common/euid_helpers';
import { DEFAULT_ML_AD_LOOKBACK } from './constants';
import type { AnomalyHit, EnrichedAnomalyHit } from './types';
import type { JobConfig } from './get_job_config';

/**
 * ML AD job function types
 *
 * --- Metric functions ---
 * The actual and typical values in the anomaly record represent
 * the anomalous metric value and the baseline metric value.
 * No need to reach back into the source documents
 * ------------------------
 * high_mean / high_median / high_sum / high_varp / high_non_zero_count
 * high_distinct_count / high_info_content / high_count / low_count
 * ------------------------
 *
 * -- Occurrence functions --
 * Observed occurrence rate of the by_field_value.
 * Requires reaching back into the source documents for baseline values and counts.
 * ------------------------
 * rare
 * ------------------------
 *
 * -- Temporal functions --
 * The actual and typical values represent anomalous and baseline temporal patterns.
 * Requires reaching back into the source documents for a count of documents
 * in the anomalous time bucket (+/- 1 hr).
 * ------------------------
 * time_of_day - seconds since midnight
 * time_of_week - seconds since Sunday midnight
 * ------------------------
 */

// Collect detector field names that are not entity-type identifiers (e.g. user.name, host.name)
const getNonEntityGroupFields = (detector: MlDetector, entityType: string): string[] =>
  [
    detector.field_name,
    detector.by_field_name,
    detector.over_field_name,
    detector.partition_field_name,
  ].filter((f): f is string => f != null && !f.startsWith(`${entityType}.`));

// For each by/over/partition field that made it into groupFields, collect the anomalous value
const buildGroupFieldValues = (
  detector: MlDetector,
  groupFields: string[],
  anomaly: AnomalyHit
): Record<string, string[]> => {
  const dimensionalFields: Array<[string | undefined, string | undefined]> = [
    [detector.by_field_name, anomaly.byFieldValue],
    [detector.over_field_name, anomaly.overFieldValue],
    [detector.partition_field_name, anomaly.partitionFieldValue],
  ];
  return Object.fromEntries(
    dimensionalFields
      .filter(
        (entry): entry is [string, string] =>
          entry[0] != null && groupFields.includes(entry[0]) && entry[1] != null
      )
      .map(([fieldName, value]) => [fieldName, [value]])
  );
};

interface RareBucket {
  key: string;
  doc_count: number;
}

interface BaselineAggType {
  baseline: { buckets: RareBucket[] };
  anomaly: { doc_count: number };
  time_bucket: { doc_count: number };
}

interface QuerySharedOpts {
  anomaly: AnomalyHit;
  detector: MlDetector;
  entityId: string;
  entityType: EntityType;
  esClient: ElasticsearchClient;
  fromMs?: number;
  toMs?: number;
  jobConfig: JobConfig;
  jobId: string;
  logger: Logger;
  runtimeMappings: MappingRuntimeFields;
}

const fetchRareBaselineForAnomaly = async ({
  anomaly,
  entityId,
  esClient,
  fromMs,
  toMs,
  jobConfig,
  jobId,
  logger,
  runtimeMappings,
}: QuerySharedOpts): Promise<EnrichedAnomalyHit> => {
  try {
    if (!anomaly.byFieldName) {
      logger.warn(
        `Cannot fetch rare baseline for anomaly without by_field_name (job: ${jobId}, entity: ${entityId})`
      );
      return { ...anomaly, anomalousValue: anomaly.byFieldValue };
    }

    const additionalFilters = anomaly.byFieldName
      ? [{ exists: { field: anomaly.byFieldName } }]
      : [];

    const resp = await esClient.search<unknown, BaselineAggType>({
      index: jobConfig.sourceIndex,
      ignore_unavailable: true,
      size: 0,
      runtime_mappings: runtimeMappings,
      query: {
        bool: {
          filter: [
            jobConfig.datafeedQuery,
            { term: { entity_id: entityId } },
            ...additionalFilters,
            {
              range: {
                '@timestamp': {
                  lte:
                    toMs !== undefined
                      ? Math.min(toMs, anomaly.timestamp + jobConfig.bucketSpanMs)
                      : anomaly.timestamp + jobConfig.bucketSpanMs,
                  gte: fromMs ?? `now-${DEFAULT_ML_AD_LOOKBACK}`,
                },
              },
            },
          ],
        },
      },
      aggs: {
        baseline: {
          terms: {
            field: anomaly.byFieldName,
            size: 3,
            order: { _count: 'desc' },
            exclude: anomaly.byFieldValue != null ? [anomaly.byFieldValue] : [],
          },
        },
        anomaly: {
          filter:
            anomaly.byFieldName && anomaly.byFieldValue != null
              ? { term: { [anomaly.byFieldName]: anomaly.byFieldValue } }
              : { match_none: {} },
        },
      },
    });

    const aggs = resp.aggregations as unknown as BaselineAggType | undefined;
    return {
      ...anomaly,
      baselineValues: (aggs?.baseline?.buckets ?? []).map((b) => b.key),
      anomalousValue: anomaly.byFieldValue,
      anomalousValueCount: aggs?.anomaly?.doc_count ?? 0,
    };
  } catch (err) {
    logger.warn(`Baseline agg failed for job ${jobId}, entity ${entityId}: ${err}`);
    return { ...anomaly, anomalousValue: anomaly.byFieldValue };
  }
};

const defaultBaselineForAnomaly = ({ anomaly }: QuerySharedOpts): EnrichedAnomalyHit => ({
  ...anomaly,
  anomalousValue: anomaly.actual,
  baselineValues: [anomaly.typical],
});

const fetchTimeBaselineForAnomaly = async ({
  anomaly,
  detector,
  entityId,
  entityType,
  esClient,
  fromMs,
  toMs,
  jobConfig,
  jobId,
  logger,
  runtimeMappings,
}: QuerySharedOpts): Promise<EnrichedAnomalyHit> => {
  try {
    const termsFields = getNonEntityGroupFields(detector, entityType);
    const isTimeOfWeek = detector.function === 'time_of_week';
    const groupFieldValues = buildGroupFieldValues(detector, termsFields, anomaly);
    const additionalFilters = termsFields.map((field) => {
      const values = groupFieldValues[field] ?? [];
      return values.length > 0 ? { terms: { [field]: values } } : { exists: { field } };
    });

    // Derive the anomalous hour and day from actual (seconds since midnight / week-start)
    const anomalousHour = Math.floor(
      (isTimeOfWeek ? anomaly.actual % 86400 : anomaly.actual) / 3600
    );
    const anomalousDay = isTimeOfWeek ? Math.floor(anomaly.actual / 86400) : null;

    const timeBucketFilter: QueryDslQueryContainer =
      isTimeOfWeek && anomalousDay != null
        ? {
            bool: {
              filter: [
                { term: { day_of_week: anomalousDay } },
                { term: { hour_of_day: anomalousHour } },
              ],
            },
          }
        : { term: { hour_of_day: anomalousHour } };

    const resp = await esClient.search<unknown, BaselineAggType>({
      index: jobConfig.sourceIndex,
      ignore_unavailable: true,
      size: 0,
      runtime_mappings: {
        ...runtimeMappings,
        hour_of_day: {
          type: 'long' as const,
          script: { source: "emit(doc['@timestamp'].value.getHour())" },
        },
        // Java DayOfWeek: Mon=1…Sun=7; mod 7 gives Sun=0…Sat=6
        day_of_week: {
          type: 'long' as const,
          script: { source: "emit(doc['@timestamp'].value.getDayOfWeekEnum().getValue() % 7)" },
        },
      },
      query: {
        bool: {
          filter: [
            jobConfig.datafeedQuery,
            { term: { entity_id: entityId } },
            ...additionalFilters,
            {
              range: {
                '@timestamp': {
                  lte:
                    toMs !== undefined
                      ? Math.min(toMs, anomaly.timestamp + jobConfig.bucketSpanMs)
                      : anomaly.timestamp + jobConfig.bucketSpanMs,
                  gte: fromMs ?? `now-${DEFAULT_ML_AD_LOOKBACK}`,
                },
              },
            },
          ],
        },
      },
      aggs: {
        time_bucket: { filter: timeBucketFilter },
      },
    });

    const aggs = resp.aggregations as unknown as BaselineAggType | undefined;
    return {
      ...anomaly,
      baselineValues: [anomaly.typical],
      anomalousValue: anomaly.actual,
      anomalousValueCount: aggs?.time_bucket?.doc_count ?? 0,
    };
  } catch (err) {
    logger.warn(`Baseline agg failed for job ${jobId}, entity ${entityId}: ${err}`);
    return { ...anomaly };
  }
};

interface FetchBaselineBehaviorOpts {
  anomaly: AnomalyHit;
  entityId: string;
  entityType: EntityType;
  esClient: ElasticsearchClient;
  fromMs?: number;
  toMs?: number;
  jobConfig: JobConfig | null;
  jobId: string;
  logger: Logger;
}

export const fetchBaselineBehavior = async ({
  anomaly,
  entityId,
  entityType,
  esClient,
  fromMs,
  toMs,
  jobConfig,
  jobId,
  logger,
}: FetchBaselineBehaviorOpts): Promise<EnrichedAnomalyHit> => {
  try {
    if (!jobConfig || jobConfig.sourceIndex.length === 0 || jobConfig.detectors.length === 0) {
      return anomaly;
    }

    const detector = jobConfig.detectors[anomaly.detectorIndex];
    const runtimeMappings: MappingRuntimeFields = {
      entity_id: euid.painless.getEuidRuntimeMapping(entityType),
    };
    const opts = {
      anomaly,
      detector,
      entityId,
      entityType,
      esClient,
      fromMs,
      toMs,
      jobConfig,
      jobId,
      logger,
      runtimeMappings,
    };

    if (detector?.function === 'rare') {
      return fetchRareBaselineForAnomaly(opts);
    } else if (detector?.function?.startsWith('time_')) {
      return fetchTimeBaselineForAnomaly(opts);
    } else {
      return defaultBaselineForAnomaly(opts);
    }
  } catch (err) {
    logger.warn(`Failed to fetch baseline behavior for job ${jobId}, entity ${entityId}: ${err}`);
    return anomaly;
  }
};
