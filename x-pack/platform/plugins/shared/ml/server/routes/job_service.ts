/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { schema } from '@kbn/config-schema';
import { categorizationExamplesProvider } from '@kbn/ml-category-validator';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { Job } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import { ML_INTERNAL_BASE_PATH } from '../../common/constants/app';
import { wrapError } from '../client/error_wrapper';
import type { RouteInitialization } from '../types';
import {
  categorizationFieldValidationSchema,
  basicChartSchema,
  populationChartSchema,
  forceStartDatafeedSchema,
  jobIdsSchema,
  optionalJobIdsSchema,
  lookBackProgressSchema,
  topCategoriesSchema,
  updateGroupsSchema,
  revertModelSnapshotSchema,
  jobsExistSchema,
  datafeedPreviewSchema,
  bulkCreateSchema,
  deleteJobsSchema,
  stopDatafeedsSchema,
} from './schemas/job_service_schema';

import { jobForCloningSchema, jobIdSchema } from './schemas/anomaly_detectors_schema';

import { jobServiceProvider } from '../models/job_service';

/**
 * Routes for job service
 */
export function jobServiceRoutes({ router, routeGuard }: RouteInitialization) {
  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/force_start_datafeeds`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canStartStopDatafeed'],
        },
      },
      summary: 'Starts datafeeds',
      description: 'Starts one or more datafeeds.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: forceStartDatafeedSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { forceStartDatafeeds } = jobServiceProvider(client, mlClient);
          const { datafeedIds, start, end } = request.body;
          const resp = await forceStartDatafeeds(datafeedIds, start, end);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/stop_datafeeds`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canStartStopDatafeed'],
        },
      },
      summary: 'Stops datafeeds',
      description: 'Stops one or more datafeeds.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: stopDatafeedsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { stopDatafeeds } = jobServiceProvider(client, mlClient);
          const { datafeedIds, closeJobs } = request.body;
          const resp = await stopDatafeeds(datafeedIds, closeJobs);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/delete_jobs`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canDeleteJob'],
        },
      },
      summary: 'Deletes jobs',
      description: 'Deletes an existing anomaly detection job.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: deleteJobsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response, context }) => {
        try {
          const alerting = await context.alerting;
          const rulesClient = await alerting?.getRulesClient();
          const { deleteJobs } = jobServiceProvider(client, mlClient, rulesClient);

          const { jobIds, deleteUserAnnotations, deleteAlertingRules } = request.body;

          const resp = await deleteJobs(jobIds, deleteUserAnnotations, deleteAlertingRules);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/close_jobs`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCloseJob'],
        },
      },
      summary: 'Closes jobs',
      description: 'Closes one or more anomaly detection jobs.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: jobIdsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { closeJobs } = jobServiceProvider(client, mlClient);
          const { jobIds } = request.body;
          const resp = await closeJobs(jobIds);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/reset_jobs`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canResetJob'],
        },
      },
      summary: 'Resets jobs',
      description: 'Resets one or more anomaly detection jobs.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: deleteJobsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { resetJobs } = jobServiceProvider(client, mlClient);
          const { jobIds, deleteUserAnnotations } = request.body;
          const resp = await resetJobs(jobIds, deleteUserAnnotations);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/force_stop_and_close_job`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCloseJob', 'ml:canStartStopDatafeed'],
        },
      },
      summary: 'Force stops and closes job',
      description:
        'Force stops the datafeed and then force closes the anomaly detection job specified by job ID',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: jobIdSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { forceStopAndCloseJob } = jobServiceProvider(client, mlClient);
          const { jobId } = request.body;
          const resp = await forceStopAndCloseJob(jobId);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_summary`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Jobs summary',
      description:
        'Returns a list of anomaly detection jobs, with summary level information for every job. For any supplied job IDs, full job information will be returned, which include the analysis configuration, job stats, datafeed stats, and calendars',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: { body: optionalJobIdsSchema },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response, context }) => {
        try {
          const alerting = await context.alerting;
          const rulesClient = await alerting?.getRulesClient();
          const { jobsSummary } = jobServiceProvider(client, mlClient, rulesClient);
          const { jobIds } = request.body;
          const resp = await jobsSummary(jobIds);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_with_geo`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Jobs with geo',
      description:
        'Returns a list of anomaly detection jobs with analysis config with fields supported by maps.',
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, response, context }) => {
        try {
          const alerting = await context.alerting;
          const rulesClient = await alerting?.getRulesClient();
          const { getJobIdsWithGeo } = jobServiceProvider(client, mlClient, rulesClient);

          const resp = await getJobIdsWithGeo();

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_with_time_range`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Jobs with time range',
      description: "Creates a list of jobs with data about the job's time range.",
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { jobsWithTimerange } = jobServiceProvider(client, mlClient);
          const resp = await jobsWithTimerange();

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/job_for_cloning`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get job for cloning',
      description: 'Get the job configuration with auto generated fields excluded for cloning',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: jobForCloningSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { getJobForCloning } = jobServiceProvider(client, mlClient);
          const { jobId, retainCreatedBy } = request.body;

          const resp = await getJobForCloning(jobId, retainCreatedBy);
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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Create jobs list',
      description: 'Creates a list of jobs.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: optionalJobIdsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response, context }) => {
        try {
          const alerting = await context.alerting;
          const rulesClient = await alerting?.getRulesClient();

          const { createFullJobsList } = jobServiceProvider(client, mlClient, rulesClient);
          const { jobIds } = request.body;
          const resp = await createFullJobsList(jobIds);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/groups`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get all groups',
      description: 'Returns array of group objects with job ids listed for each group.',
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, response }) => {
        try {
          const { getAllGroups } = jobServiceProvider(client, mlClient);
          const resp = await getAllGroups();

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/update_groups`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canUpdateJob'],
        },
      },
      summary: 'Update job groups',
      description: 'Updates the groups property of an anomaly detection job.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: updateGroupsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { updateGroups } = jobServiceProvider(client, mlClient);
          const { jobs } = request.body;
          const resp = await updateGroups(jobs);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/blocking_jobs_tasks`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get blocking job tasks',
      description: 'Gets the ids of deleting, resetting or reverting anomaly detection jobs.',
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, response }) => {
        try {
          const { blockingJobTasks } = jobServiceProvider(client, mlClient);
          const resp = await blockingJobTasks();

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_exist`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Check if jobs exist',
      description:
        'Checks if each of the jobs in the specified list of IDs exist. If allSpaces is true, the check will look across all spaces.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: jobsExistSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { jobsExist } = jobServiceProvider(client, mlClient);
          const { jobIds, allSpaces } = request.body;
          const resp = await jobsExist(jobIds, allSpaces);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/new_job_caps/{indexPattern}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get new job capabilities',
      description: 'Retrieve the capabilities of fields for indices',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({ indexPattern: schema.string({ maxLength: 10000 }) }),
            query: schema.maybe(
              schema.object({ rollup: schema.maybe(schema.string({ maxLength: 10000 })) })
            ),
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, mlClient, request, response, getDataViewsService }) => {
          try {
            const { indexPattern } = request.params;
            const isRollup = request.query?.rollup === 'true';
            const { newJobCaps } = jobServiceProvider(client, mlClient);

            const dataViewsService = await getDataViewsService();
            const resp = await newJobCaps(indexPattern, isRollup, dataViewsService);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/new_job_line_chart`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Get job line chart data',
      description: 'Returns line chart data for anomaly detection job',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object(basicChartSchema),
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const {
            indexPatternTitle,
            timeField,
            start,
            end,
            intervalMs,
            query,
            aggFieldNamePairs,
            splitFieldName,
            splitFieldValue,
            runtimeMappings,
            indicesOptions,
          } = request.body;

          const { newJobLineChart } = jobServiceProvider(client, mlClient);
          const resp = await newJobLineChart(
            indexPatternTitle,
            timeField,
            start,
            end,
            intervalMs,
            query,
            aggFieldNamePairs,
            splitFieldName,
            splitFieldValue,
            runtimeMappings,
            indicesOptions
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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/new_job_population_chart`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Get job population chart data',
      description: 'Returns population chart data for anomaly detection job',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object(populationChartSchema),
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const {
            indexPatternTitle,
            timeField,
            start,
            end,
            intervalMs,
            query,
            aggFieldNamePairs,
            splitFieldName,
            runtimeMappings,
            indicesOptions,
          } = request.body;

          const { newJobPopulationChart } = jobServiceProvider(client, mlClient);
          const resp = await newJobPopulationChart(
            indexPatternTitle,
            timeField,
            start,
            end,
            intervalMs,
            query,
            aggFieldNamePairs,
            splitFieldName,
            runtimeMappings,
            indicesOptions
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
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/all_jobs_and_group_ids`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get all job and group IDs',
      description: 'Returns a list of all job IDs and all group IDs',
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, response }) => {
        try {
          const { getAllJobAndGroupIds } = jobServiceProvider(client, mlClient);
          const resp = await getAllJobAndGroupIds();

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/look_back_progress`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Get lookback progress',
      description: 'Returns current progress of anomaly detection job',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object(lookBackProgressSchema),
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { getLookBackProgress } = jobServiceProvider(client, mlClient);
          const { jobId, start, end } = request.body;
          const resp = await getLookBackProgress(jobId, start, end);

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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/categorization_field_validation`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Get categorization field examples',
      description: 'Returns examples of categorization field',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object(categorizationFieldValidationSchema),
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { validateCategoryExamples } = categorizationExamplesProvider(client);
          const {
            indexPatternTitle,
            timeField,
            query,
            size,
            field,
            start,
            end,
            analyzer,
            runtimeMappings,
            indicesOptions,
          } = request.body;

          const resp = await validateCategoryExamples(
            indexPatternTitle,
            query,
            size,
            field,
            timeField,
            start,
            end,
            analyzer,
            runtimeMappings,
            indicesOptions,
            undefined
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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/top_categories`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get top categories',
      description: 'Returns list of top categories',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: schema.object(topCategoriesSchema),
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { topCategories } = jobServiceProvider(client, mlClient);
          const { jobId, count } = request.body;
          const resp = await topCategories(jobId, count);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  /**
   * @apiGroup JobService
   *
   * @api {post} /internal/ml/jobs/datafeed_preview Get datafeed preview
   * @apiName DatafeedPreview
   * @apiDescription Returns a preview of the datafeed search
   *
   * @apiSchema (body) datafeedPreviewSchema
   */
  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/datafeed_preview`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canPreviewDatafeed'],
        },
      },
      summary: 'Get datafeed preview',
      description: 'Returns a preview of the datafeed search',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: datafeedPreviewSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { datafeedId, job, datafeed } = request.body;

          const payload =
            datafeedId !== undefined
              ? {
                  datafeed_id: datafeedId,
                }
              : ({
                  body: {
                    job_config: job,
                    datafeed_config: datafeed,
                  },
                } as estypes.MlPreviewDatafeedRequest);

          const body = await mlClient.previewDatafeed(payload, {
            maxRetries: 0,
          });
          return response.ok({
            body,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/revert_model_snapshot`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob', 'ml:canStartStopDatafeed'],
        },
      },
      summary: 'Revert model snapshot',
      description:
        'Reverts a job to a specified snapshot. Also allows the job to replayed to a specified date and to auto create calendars to skip analysis of specified date ranges',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: revertModelSnapshotSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const { revertModelSnapshot } = jobServiceProvider(client, mlClient);
          const { jobId, snapshotId, replay, end, deleteInterveningResults, calendarEvents } =
            request.body;
          const resp = await revertModelSnapshot(
            jobId,
            snapshotId,
            replay,
            end,
            deleteInterveningResults,
            calendarEvents
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
      path: `${ML_INTERNAL_BASE_PATH}/jobs/bulk_create`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canPreviewDatafeed'],
        },
      },
      summary: 'Bulk create jobs and datafeeds',
      description: 'Bulk create jobs and datafeeds.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: bulkCreateSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
        try {
          const bulkJobs = request.body;

          const { bulkCreate } = jobServiceProvider(client, mlClient);
          const jobs = (Array.isArray(bulkJobs) ? bulkJobs : [bulkJobs]) as Array<{
            job: Job;
            datafeed: Datafeed;
          }>;
          const body = await bulkCreate(jobs);
          return response.ok({
            body,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );
}
