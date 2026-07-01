/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import Boom from '@hapi/boom';
import type { ServiceAnomaliesResponse } from '@kbn/apm-types';
import type { MlAnomalyDetectors } from '@kbn/ml-plugin/server';
import { rangeQuery, termQuery, wildcardQuery } from '@kbn/observability-plugin/server';
import { ML_ERRORS } from '../../../common/anomaly_detection';
import {
  AnomalyDetectorType,
  getAnomalyDetectorType,
} from '../../../common/anomaly_detection/apm_ml_detectors';
import { ENVIRONMENT_ALL } from '../../../common/environment_filter_values';
import { defaultTransactionTypes } from '../../../common/transaction_types';
import { asMutableArray } from '../../../common/utils/as_mutable_array';
import {
  anomalySearch,
  ML_SERVICE_NAME_FIELD,
  ML_TRANSACTION_TYPE_FIELD,
} from '../../lib/anomaly_detection/anomaly_search';
import { apmMlAnomalyQuery } from '../../lib/anomaly_detection/apm_ml_anomaly_query';
import { getMlJobsWithAPMGroup } from '../../lib/anomaly_detection/get_ml_jobs_with_apm_group';
import type { MlClient } from '../../lib/helpers/get_ml_client';
import { withApmSpan } from '../../utils/with_apm_span';

export const DEFAULT_ANOMALIES: ServiceAnomaliesResponse = {
  mlJobIds: [],
  serviceAnomalies: [],
};

export async function getServiceAnomalies({
  mlClient,
  environment,
  start,
  end,
  searchQuery,
  exactServiceName,
}: {
  mlClient?: MlClient;
  environment: string;
  start: number;
  end: number;
  /** Substring search (inventory, etc.); uses a case-insensitive wildcard on the ML partition field. */
  searchQuery?: string;
  /** When set, matches that service only via a `term` filter (avoids wildcard fan-out for short names). Ignores `searchQuery` for the service-name clause. */
  exactServiceName?: string;
}): Promise<ServiceAnomaliesResponse> {
  return withApmSpan('get_service_anomalies', async () => {
    if (!mlClient) {
      throw Boom.notImplemented(ML_ERRORS.ML_NOT_AVAILABLE);
    }

    const serviceNameFilter =
      exactServiceName !== undefined && exactServiceName !== ''
        ? termQuery(ML_SERVICE_NAME_FIELD, exactServiceName)
        : wildcardQuery(ML_SERVICE_NAME_FIELD, searchQuery);

    const params = {
      size: 0,
      query: {
        bool: {
          filter: [
            ...apmMlAnomalyQuery({
              detectorTypes: [
                AnomalyDetectorType.txLatency,
                AnomalyDetectorType.txThroughput,
                AnomalyDetectorType.txFailureRate,
              ],
            }),
            ...rangeQuery(Math.min(end - 30 * 60 * 1000, start), end, 'timestamp'),
            {
              terms: {
                // Only retrieving anomalies for default transaction types
                by_field_value: defaultTransactionTypes,
              },
            },
            ...serviceNameFilter,
          ] as estypes.QueryDslQueryContainer[],
        },
      },
      aggs: {
        services: {
          composite: {
            size: 5000,
            sources: [
              { serviceName: { terms: { field: ML_SERVICE_NAME_FIELD } } },
              { jobId: { terms: { field: 'job_id' } } },
            ] as Array<Record<string, estypes.AggregationsCompositeAggregationSource>>,
          },
          aggs: {
            record_results: {
              filter: {
                term: {
                  result_type: 'record',
                },
              },
              aggs: {
                metrics: {
                  top_metrics: {
                    metrics: asMutableArray([
                      { field: 'actual' },
                      { field: ML_TRANSACTION_TYPE_FIELD },
                      { field: 'record_score' },
                      { field: 'detector_index' },
                    ] as const),
                    size: 1,
                    sort: {
                      record_score: 'desc' as const,
                    },
                  },
                },
              },
            },
            // fallback to model_plot if no records are found
            model_plot_results: {
              filter: {
                term: {
                  result_type: 'model_plot',
                },
              },
              aggs: {
                metrics: {
                  top_metrics: {
                    metrics: asMutableArray([
                      { field: 'actual' },
                      { field: ML_TRANSACTION_TYPE_FIELD },
                      { field: 'detector_index' },
                    ] as const),
                    size: 1,
                    sort: {
                      timestamp: 'desc' as const,
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const [anomalyResponse, jobIds] = await Promise.all([
      withApmSpan('ml_anomaly_search', () =>
        anomalySearch(mlClient.mlSystem.mlAnomalySearch, params)
      ),
      getMLJobIds(mlClient.anomalyDetectors, environment),
    ]);

    // make sure we only return data for jobs that are available in this space
    const availableBuckets =
      anomalyResponse.aggregations?.services.buckets.filter((bucket) =>
        jobIds.includes(bucket.key.jobId as string)
      ) ?? [];

    const serviceAnomalies = availableBuckets.map((bucket) => {
      const recordMetrics = bucket.record_results.metrics.top[0]?.metrics;
      const modelPlotMetrics = bucket.model_plot_results.metrics.top[0]?.metrics;

      // Anomaly score always comes from records, 0 if no records
      const anomalyScore = recordMetrics?.record_score ? (recordMetrics.record_score as number) : 0;

      // Prefer record metrics, fallback to model_plot for context values
      const detectorIndex = (recordMetrics?.detector_index ?? modelPlotMetrics?.detector_index) as
        | number
        | undefined;

      return {
        serviceName: bucket.key.serviceName as string,
        jobId: bucket.key.jobId as string,
        transactionType: (recordMetrics?.by_field_value ||
          modelPlotMetrics?.by_field_value) as string,
        actualValue: (recordMetrics?.actual || modelPlotMetrics?.actual) as number,
        anomalyScore,
        // Detector that produced the surfaced score, so consumers can interpret
        // `actualValue` (e.g. latency as a duration, failure rate as a percentage)
        detectorType:
          detectorIndex !== undefined ? getAnomalyDetectorType(detectorIndex) : undefined,
      };
    });

    // A single service can produce more than one entry above: one per job (i.e.
    // per environment, since AD jobs are configured per environment) when no
    // specific environment is selected, and each of those entries already
    // carries the single top-scoring detector for that job (see the `size: 1`
    // `top_metrics` aggs sorted by `record_score`). Collapse to one entry per
    // service by keeping the highest anomaly score, so the surfaced anomaly is
    // the most critical one across all environments and detector types.
    const relevantAnomaliesByService = new Map<string, (typeof serviceAnomalies)[number]>();
    for (const anomaly of serviceAnomalies) {
      const existing = relevantAnomaliesByService.get(anomaly.serviceName);
      if (!existing || anomaly.anomalyScore > existing.anomalyScore) {
        relevantAnomaliesByService.set(anomaly.serviceName, anomaly);
      }
    }

    return {
      mlJobIds: jobIds,
      serviceAnomalies: Array.from(relevantAnomaliesByService.values()),
    };
  });
}

export async function getMLJobs(anomalyDetectors: MlAnomalyDetectors, environment?: string) {
  const jobs = await getMlJobsWithAPMGroup(anomalyDetectors);

  // to filter out legacy jobs we are filtering by the existence of `apm_ml_version` in `custom_settings`
  // and checking that it is compatable.
  const mlJobs = jobs.filter((job) => job.version >= 2);
  if (environment && environment !== ENVIRONMENT_ALL.value) {
    const matchingMLJob = mlJobs.find((job) => job.environment === environment);
    if (!matchingMLJob) {
      return [];
    }
    return [matchingMLJob];
  }
  return mlJobs;
}

export async function getMLJobIds(anomalyDetectors: MlAnomalyDetectors, environment?: string) {
  const mlJobs = await getMLJobs(anomalyDetectors, environment);
  return mlJobs.map((job) => job.jobId);
}
