/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ML_INTERNAL_BASE_PATH } from '../../common/constants/app';
import { wrapError } from '../client/error_wrapper';
import type { RouteInitialization } from '../types';
import {
  anomaliesTableDataSchema,
  categoryDefinitionSchema,
  categoryExamplesSchema,
  getDatafeedResultsChartDataSchema,
  maxAnomalyScoreSchema,
  partitionFieldValuesSchema,
  anomalySearchSchema,
  getAnomalyChartsSchema,
  getAnomalyRecordsSchema,
} from './schemas/results_service_schema';
import { resultsServiceProvider } from '../models/results_service';
import { jobIdSchema } from './schemas/anomaly_detectors_schema';
import {
  getCategorizerStatsSchema,
  getCategorizerStoppedPartitionsSchema,
} from './schemas/results_service_schema';
import type { MlClient } from '../lib/ml_client';
import { getTopInfluencers } from '../models/results_service/top_influencers';
import {
  getScoresByBucket,
  getInfluencerValueMaxScoreByTime,
} from '../models/results_service/view_by';
import {
  getTopInfluencersSchema,
  getScoresByBucketSchema,
  getInfluencerValueMaxScoreByTimeSchema,
} from './schemas/results_service_schema';
import { anomalyChartsDataProvider } from '../models/results_service/anomaly_charts';

function getAnomaliesTableData(mlClient: MlClient, payload: any) {
  const rs = resultsServiceProvider(mlClient);
  const {
    jobIds,
    criteriaFields,
    influencers,
    aggregationInterval,
    threshold,
    earliestMs,
    latestMs,
    dateFormatTz,
    maxRecords,
    maxExamples,
    influencersFilterQuery,
    functionDescription,
  } = payload;
  return rs.getAnomaliesTableData(
    jobIds,
    criteriaFields,
    influencers,
    aggregationInterval,
    threshold,
    earliestMs,
    latestMs,
    dateFormatTz,
    maxRecords,
    maxExamples,
    influencersFilterQuery,
    functionDescription
  );
}

function getCategoryDefinition(mlClient: MlClient, payload: any) {
  const rs = resultsServiceProvider(mlClient);
  return rs.getCategoryDefinition(payload.jobId, payload.categoryId);
}

function getCategoryExamples(mlClient: MlClient, payload: any) {
  const rs = resultsServiceProvider(mlClient);
  const { jobId, categoryIds, maxExamples } = payload;
  return rs.getCategoryExamples(jobId, categoryIds, maxExamples);
}

function getMaxAnomalyScore(mlClient: MlClient, payload: any) {
  const rs = resultsServiceProvider(mlClient);
  const { jobIds, earliestMs, latestMs } = payload;
  return rs.getMaxAnomalyScore(jobIds, earliestMs, latestMs);
}

function getPartitionFieldsValues(mlClient: MlClient, payload: any) {
  const rs = resultsServiceProvider(mlClient);
  const { jobId, searchTerm, criteriaFields, earliestMs, latestMs, fieldsConfig } = payload;
  return rs.getPartitionFieldsValues(
    jobId,
    searchTerm,
    criteriaFields,
    earliestMs,
    latestMs,
    fieldsConfig
  );
}

function getCategorizerStats(mlClient: MlClient, params: any, query: any) {
  const { jobId } = params;
  const { partitionByValue } = query;
  const rs = resultsServiceProvider(mlClient);
  return rs.getCategorizerStats(jobId, partitionByValue);
}

function getCategoryStoppedPartitions(mlClient: MlClient, payload: any) {
  const { jobIds, fieldToBucket } = payload;
  const rs = resultsServiceProvider(mlClient);
  return rs.getCategoryStoppedPartitions(jobIds, fieldToBucket);
}

/**
 * Routes for results service
 */
export function resultsServiceRoutes({ router, routeGuard }: RouteInitialization) {
  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/top_influencers`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get top influencers',
      description: 'Returns top influencers for requested jobs and time range.',
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { body: getTopInfluencersSchema } },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getTopInfluencers(mlClient, request.body);
          return response.ok({ body: resp });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/anomalies_table_data`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get anomalies records for table display',
      description:
        'Retrieves anomaly records for an anomaly detection job and formats them for anomalies table display.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: anomaliesTableDataSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getAnomaliesTableData(mlClient, request.body);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/category_definition`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get category definition',
      description: 'Returns the definition of the category with the specified ID and job ID.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: categoryDefinitionSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getCategoryDefinition(mlClient, request.body);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/max_anomaly_score`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get the maximum anomaly_score',
      description:
        'Returns the maximum anomaly score of the bucket results for the request job ID(s) and time range.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: maxAnomalyScoreSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getMaxAnomalyScore(mlClient, request.body);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/category_examples`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get category examples',
      description:
        'Returns examples for the categories with the specified IDs from the job with the supplied ID.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: categoryExamplesSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getCategoryExamples(mlClient, request.body);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/partition_fields_values`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get partition fields values',
      description:
        'Returns the partition fields with values that match the provided criteria for the specified job ID.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: partitionFieldValuesSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getPartitionFieldsValues(mlClient, request.body);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/anomaly_search`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Run a search on the anomaly results index',
      description:
        'Runs the supplied query against the anomaly results index for the specified job IDs.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: anomalySearchSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const { jobIds, query } = request.body;
          const body = await mlClient.anomalySearch(query, jobIds);
          return response.ok({
            body,
          });
        } catch (error) {
          return response.customError(wrapError(error));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/results/{jobId}/categorizer_stats`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get categorizer statistics',
      description: 'Returns the categorizer statistics for the specified job ID.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: jobIdSchema,
            query: getCategorizerStatsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getCategorizerStats(mlClient, request.params, request.query);
          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/category_stopped_partitions`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get partitions that have stopped being categorized',
      description:
        'Returns information on the partitions that have stopped being categorized due to the categorization status changing from ok to warn. Can return either the list of stopped partitions for each job, or just the list of job IDs.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: getCategorizerStoppedPartitionsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const resp = await getCategoryStoppedPartitions(mlClient, request.body);
          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/datafeed_results_chart`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get datafeed results chart data',
      description: 'Returns datafeed results chart data',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: getDatafeedResultsChartDataSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, mlClient, request, response, serverless }) => {
          try {
            const { getDatafeedResultsChartData } = resultsServiceProvider(
              mlClient,
              client,
              serverless
            );
            const resp = await getDatafeedResultsChartData(request.body);

            return response.ok({
              body: resp,
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/anomaly_charts`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get data for anomaly charts',
      description: 'Returns anomaly charts data',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: getAnomalyChartsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { getAnomalyChartsData } = anomalyChartsDataProvider(mlClient, client);
          const resp = await getAnomalyChartsData(request.body);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/anomaly_records`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get anomaly records for criteria',
      description: 'Returns anomaly records',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: getAnomalyRecordsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { getRecordsForCriteria } = anomalyChartsDataProvider(mlClient, client);

          const { jobIds, criteriaFields, earliestMs, latestMs, threshold, interval } =
            request.body;

          const resp = await getRecordsForCriteria(
            jobIds,
            criteriaFields,
            threshold,
            earliestMs,
            latestMs,
            interval
          );

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/view_by/scores_by_bucket`,
      access: 'internal',
      security: { authz: { requiredPrivileges: ['ml:canGetJobs'] } },
      summary: 'Get job scores by bucket',
      description: 'Returns max bucket scores per job over time for swimlane.',
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { body: getScoresByBucketSchema } },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const result = await getScoresByBucket(mlClient, request.body);
          return response.ok({ body: result });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/results/view_by/influencer_values_by_time`,
      access: 'internal',
      security: { authz: { requiredPrivileges: ['ml:canGetJobs'] } },
      summary: 'Get influencer field value max score by time',
      description: 'Returns per-value max influencer scores over time for swimlane.',
    })
    .addVersion(
      {
        version: '1',
        validate: { request: { body: getInfluencerValueMaxScoreByTimeSchema } },
      },
      routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
        try {
          const result = await getInfluencerValueMaxScoreByTime(mlClient, request.body);
          return response.ok({ body: result });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );
}
