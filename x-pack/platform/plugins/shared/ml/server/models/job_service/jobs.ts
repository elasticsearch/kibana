/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash';
import Boom from '@hapi/boom';

import type { IScopedClusterClient } from '@kbn/core/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { parseInterval } from '@kbn/ml-parse-interval';

import type {
  DatafeedWithStats,
  CombinedJobWithStats,
} from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { Job } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type {
  MlSummaryJob,
  AuditMessage,
} from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';
import type {
  JobsExistResponse,
  BulkCreateResults,
  ResetJobsResponse,
} from '@kbn/ml-common-types/job_service';
import {
  getJobActionString,
  JOB_ACTION_TASK,
  JOB_ACTION_TASKS,
  JOB_ACTION,
} from '../../../common/constants/job_actions';
import type { JobAction } from '../../../common/constants/job_actions';
import { JOB_STATE, DATAFEED_STATE } from '../../../common/constants/states';
import {
  getSingleMetricViewerJobErrorMessage,
  parseTimeIntervalForJob,
  isJobWithGeoData,
  createDatafeedId,
} from '../../../common/util/job_utils';
import { GLOBAL_CALENDAR } from '../../../common/constants/calendars';
import { datafeedsProvider } from './datafeeds';
import { jobAuditMessagesProvider } from '../job_audit_messages';
import { resultsServiceProvider } from '../results_service';
import { CalendarManager } from '../calendar';
import { fillResultsWithTimeouts, isRequestTimeout } from './error_utils';
import {
  getEarliestDatafeedStartTime,
  getLatestDataOrBucketTimestamp,
} from '../../../common/util/job_utils';
import { groupsProvider } from './groups';
import type { MlClient } from '../../lib/ml_client';
import { ML_ALERT_TYPES } from '../../../common/constants/alerts';
import type { MlAnomalyDetectionAlertParams } from '../../routes/schemas/alerting_schema';
import type { ServerlessInfo } from '../../types';

interface Results {
  [id: string]: {
    [status: string]: boolean;
    error?: any;
  };
}

export function jobsProvider(
  client: IScopedClusterClient,
  mlClient: MlClient,
  serverless: ServerlessInfo,
  rulesClient?: RulesClient
) {
  const { asInternalUser } = client;

  const { forceDeleteDatafeed, getDatafeedIdsByJobId, getDatafeedByJobId } = datafeedsProvider(
    client,
    mlClient
  );
  const { getAuditMessagesSummary } = jobAuditMessagesProvider(client, mlClient, serverless);
  const { getLatestBucketTimestampByJob } = resultsServiceProvider(mlClient);
  const calMngr = new CalendarManager(mlClient);

  async function forceDeleteJob(jobId: string, deleteUserAnnotations = false) {
    await mlClient.deleteJob({
      job_id: jobId,
      force: true,
      wait_for_completion: false,
      delete_user_annotations: deleteUserAnnotations,
    });
  }

  async function deleteJobs(
    jobIds: string[],
    deleteUserAnnotations = false,
    deleteAlertingRules = false
  ) {
    const results: Results = Object.create(null);
    const datafeedIds = await getDatafeedIdsByJobId();

    if (deleteAlertingRules && rulesClient) {
      // Check what jobs have associated alerting rules
      const anomalyDetectionAlertingRules = await rulesClient.find<MlAnomalyDetectionAlertParams>({
        options: {
          filter: `alert.attributes.alertTypeId:${ML_ALERT_TYPES.ANOMALY_DETECTION}`,
          perPage: 10000,
        },
      });

      const jobIdsSet = new Set(jobIds);
      const ruleIds: string[] = anomalyDetectionAlertingRules.data
        .filter((rule) => {
          return jobIdsSet.has(rule.params.jobSelection.jobIds[0]);
        })
        .map((rule) => rule.id);

      if (ruleIds.length > 0) {
        await rulesClient.bulkDeleteRules({
          ids: ruleIds,
        });
      }
    }

    for (const jobId of jobIds) {
      try {
        const datafeedResp =
          datafeedIds[jobId] === undefined
            ? { acknowledged: true }
            : await forceDeleteDatafeed(datafeedIds[jobId]);

        if (datafeedResp.acknowledged) {
          try {
            await forceDeleteJob(jobId, deleteUserAnnotations);
            results[jobId] = { deleted: true };
          } catch (error) {
            if (isRequestTimeout(error)) {
              return fillResultsWithTimeouts(results, jobId, jobIds, DATAFEED_STATE.DELETED);
            }
            results[jobId] = { deleted: false, error: error.body };
          }
        }
      } catch (error) {
        if (isRequestTimeout(error)) {
          return fillResultsWithTimeouts(
            results,
            datafeedIds[jobId],
            jobIds,
            DATAFEED_STATE.DELETED
          );
        }
        results[jobId] = { deleted: false, error: error.body };
      }
    }
    return results;
  }

  async function closeJobs(jobIds: string[]) {
    const results: Results = Object.create(null);
    for (const jobId of jobIds) {
      try {
        await mlClient.closeJob({ job_id: jobId });
        results[jobId] = { closed: true };
      } catch (error) {
        if (isRequestTimeout(error)) {
          return fillResultsWithTimeouts(results, jobId, jobIds, JOB_STATE.CLOSED);
        }

        if (
          error.statusCode === 409 &&
          error.body.error?.reason &&
          error.body.error.reason.includes('datafeed') === false
        ) {
          // the close job request may fail (409) if the job has failed or if the datafeed hasn't been stopped.
          // if the job has failed we want to attempt a force close.
          // however, if we received a 409 due to the datafeed being started we should not attempt a force close.
          try {
            await mlClient.closeJob({ job_id: jobId, force: true });
            results[jobId] = { closed: true };
          } catch (error2) {
            if (isRequestTimeout(error2)) {
              return fillResultsWithTimeouts(results, jobId, jobIds, JOB_STATE.CLOSED);
            }
            results[jobId] = { closed: false, error: error2.body };
          }
        } else {
          results[jobId] = { closed: false, error: error.body };
        }
      }
    }
    return results;
  }

  async function resetJobs(jobIds: string[], deleteUserAnnotations = false) {
    const results: ResetJobsResponse = Object.create(null);
    for (const jobId of jobIds) {
      try {
        // @ts-expect-error @elastic-elasticsearch resetJob response incorrect, missing task
        const { task } = await mlClient.resetJob({
          job_id: jobId,
          wait_for_completion: false,
          delete_user_annotations: deleteUserAnnotations,
        });
        results[jobId] = { reset: true, task };
      } catch (error) {
        if (isRequestTimeout(error)) {
          return fillResultsWithTimeouts(results, jobId, jobIds, JOB_ACTION.RESET);
        } else {
          results[jobId] = { reset: false, error: error.body };
        }
      }
    }
    return results;
  }

  async function forceStopAndCloseJob(jobId: string) {
    const datafeedIds = await getDatafeedIdsByJobId();
    const datafeedId = datafeedIds[jobId];
    if (datafeedId === undefined) {
      throw Boom.notFound(`Cannot find datafeed for job ${jobId}`);
    }

    const body = await mlClient.stopDatafeed({
      datafeed_id: datafeedId,
      force: true,
    });
    if (body.stopped !== true) {
      return { success: false };
    }

    await mlClient.closeJob({ job_id: jobId, force: true });

    return { success: true };
  }

  async function jobsSummary(jobIds: string[] = []) {
    const fullJobsList: CombinedJobWithStats[] = await createFullJobsList();
    const fullJobsIds = fullJobsList.map((job) => job.job_id);
    let auditMessagesByJob: { [id: string]: AuditMessage } = Object.create(null);

    // even if there are errors getting the audit messages, we still want to show the full list
    try {
      const auditMessages: AuditMessage[] = await getAuditMessagesSummary(fullJobsIds);
      auditMessagesByJob = auditMessages.reduce((acc, cur) => {
        acc[cur.job_id] = cur;
        return acc;
      }, auditMessagesByJob);
    } catch (e) {
      // fail silently
    }

    const jobs = fullJobsList.map((job) => {
      const hasDatafeed = isPopulatedObject(job.datafeed_config);
      const dataCounts = job.data_counts;
      const errorMessage = getSingleMetricViewerJobErrorMessage(job);

      const tempJob: MlSummaryJob = {
        id: job.job_id,
        description: job.description || '',
        customSettings: job.custom_settings,
        groups: Array.isArray(job.groups) ? job.groups.sort() : [],
        processed_record_count: job.data_counts?.processed_record_count,
        earliestStartTimestampMs: getEarliestDatafeedStartTime(
          dataCounts?.latest_record_timestamp,
          dataCounts?.latest_bucket_timestamp,
          parseTimeIntervalForJob(job.analysis_config?.bucket_span)
        ),
        memory_status: job.model_size_stats ? job.model_size_stats.memory_status : '',
        jobState: job.blocked === undefined ? job.state : getJobActionString(job.blocked.reason),
        hasDatafeed,
        datafeedId:
          hasDatafeed && job.datafeed_config.datafeed_id ? job.datafeed_config.datafeed_id : '',
        datafeedIndices:
          hasDatafeed && job.datafeed_config.indices ? job.datafeed_config.indices : [],
        datafeedState: hasDatafeed && job.datafeed_config.state ? job.datafeed_config.state : '',
        latestTimestampMs: dataCounts?.latest_record_timestamp,
        earliestTimestampMs: dataCounts?.earliest_record_timestamp,
        latestResultsTimestampMs: getLatestDataOrBucketTimestamp(
          dataCounts?.latest_record_timestamp,
          dataCounts?.latest_bucket_timestamp
        ),
        isSingleMetricViewerJob: errorMessage === undefined,
        isNotSingleMetricViewerJobMessage: errorMessage,
        nodeName: job.node ? job.node.name : undefined,
        blocked: job.blocked ?? undefined,
        awaitingNodeAssignment: isJobAwaitingNodeAssignment(job),
        alertingRules: job.alerting_rules,
        jobTags: job.custom_settings?.job_tags ?? {},
        bucketSpanSeconds: parseInterval(job.analysis_config.bucket_span!)!.asSeconds(),
      };

      if (serverless.cpsEnabled && hasDatafeed) {
        tempJob.projectRouting = job.datafeed_config.project_routing ?? null;
      }

      if (jobIds.find((j) => j === tempJob.id)) {
        tempJob.fullJob = job;
      }
      const auditMessage = auditMessagesByJob[tempJob.id];
      if (
        auditMessage !== undefined &&
        job.create_time !== undefined &&
        Number(job.create_time) <= auditMessage.msgTime
      ) {
        tempJob.auditMessage = {
          level: auditMessage.highestLevel,
          text: auditMessage.highestLevelText,
        };
      }
      return tempJob;
    });

    return jobs;
  }

  async function getJobIdsWithGeo(): Promise<string[]> {
    const body = await mlClient.getJobs();
    return body.jobs.filter(isJobWithGeoData).map((job) => job.job_id);
  }

  async function jobsWithTimerange() {
    const fullJobsList = await createFullJobsList();
    const jobsMap: { [id: string]: string[] } = Object.create(null);

    const jobs = fullJobsList.map((job) => {
      jobsMap[job.job_id] = job.groups || [];
      const hasDatafeed = isPopulatedObject(job.datafeed_config);
      const timeRange: { to?: number; from?: number } = Object.create(null);

      const dataCounts = job.data_counts;
      if (dataCounts !== undefined) {
        timeRange.to = getLatestDataOrBucketTimestamp(
          dataCounts.latest_record_timestamp as number,
          dataCounts.latest_bucket_timestamp as number
        );
        timeRange.from = dataCounts.earliest_record_timestamp;
      }
      const errorMessage = getSingleMetricViewerJobErrorMessage(job);

      const tempJob = {
        id: job.job_id,
        job_id: job.job_id,
        groups: Array.isArray(job.groups) ? job.groups.sort() : [],
        isRunning: hasDatafeed && job.datafeed_config.state === 'started',
        isSingleMetricViewerJob: errorMessage === undefined,
        isNotSingleMetricViewerJobMessage: errorMessage,
        timeRange,
      };

      return tempJob;
    });

    return { jobs, jobsMap };
  }

  async function getJobForCloning(jobId: string, retainCreatedBy = false) {
    const [jobResults, datafeedResult, fullJobResults] = await Promise.all([
      mlClient.getJobs({ job_id: jobId, exclude_generated: true }),
      getDatafeedByJobId(jobId, true),
      ...(retainCreatedBy ? [mlClient.getJobs({ job_id: jobId })] : []),
    ]);
    const result: { datafeed?: Datafeed; job?: Job } = { job: undefined, datafeed: undefined };
    if (datafeedResult && datafeedResult.job_id === jobId) {
      result.datafeed = datafeedResult;
      if (result.datafeed.indices_options?.ignore_throttled !== undefined) {
        // ignore_throttled is a deprecated setting, remove it from the response
        delete result.datafeed.indices_options.ignore_throttled;
      }
    }

    if (jobResults?.jobs?.length > 0) {
      const job = jobResults.jobs[0];
      removeUnClonableCustomSettings(job);

      // to retain the created by property we need to add it back in
      // from the job which hasn't been loaded with exclude_generated: true
      if (retainCreatedBy && fullJobResults?.jobs?.length > 0) {
        const fullJob = fullJobResults.jobs[0];
        if (fullJob.custom_settings?.created_by) {
          job.custom_settings.created_by = fullJob.custom_settings.created_by;
        }
      }
      result.job = job;
    }
    return result;
  }

  function removeUnClonableCustomSettings(job: Job) {
    if (isPopulatedObject(job.custom_settings)) {
      delete job.custom_settings.managed;
    }
  }

  async function createFullJobsList(jobIds: string[] = []) {
    const jobs: CombinedJobWithStats[] = [];
    const groups: { [jobId: string]: string[] } = Object.create(null);
    const datafeeds: { [id: string]: DatafeedWithStats } = Object.create(null);
    const calendarsByJobId: { [jobId: string]: string[] } = Object.create(null);
    const globalCalendars: string[] = [];

    const jobIdsString = jobIds.join();

    const [
      jobResults,
      jobStatsResults,
      datafeedResults,
      datafeedStatsResults,
      calendarResults,
      latestBucketTimestampByJob,
    ] = await Promise.all([
      mlClient.getJobs(jobIds.length > 0 ? { job_id: jobIdsString } : undefined),
      mlClient.getJobStats(jobIds.length > 0 ? { job_id: jobIdsString } : undefined),
      mlClient.getDatafeeds(),
      mlClient.getDatafeedStats(),
      calMngr.getAllCalendars(),
      getLatestBucketTimestampByJob(),
    ]);

    if (datafeedResults && datafeedResults.datafeeds) {
      datafeedResults.datafeeds.forEach((datafeed) => {
        if (datafeedStatsResults && datafeedStatsResults.datafeeds) {
          const datafeedStats = datafeedStatsResults.datafeeds.find(
            (ds) => ds.datafeed_id === datafeed.datafeed_id
          );
          if (datafeedStats) {
            datafeeds[datafeed.job_id] = { ...datafeed, ...datafeedStats };
          }
        }
      });
    }

    // create list of jobs per group.
    // used for assigning calendars to jobs when a calendar has
    // only been attached to a group
    if (jobResults && jobResults.jobs) {
      jobResults.jobs.forEach((job) => {
        calendarsByJobId[job.job_id] = [];

        if (job.groups !== undefined) {
          job.groups.forEach((gId) => {
            if (groups[gId] === undefined) {
              groups[gId] = [];
            }
            groups[gId].push(job.job_id);
          });
        }
      });
    }

    // assign calendars to jobs
    if (calendarResults) {
      calendarResults.forEach((cal) => {
        cal.job_ids.forEach((id) => {
          if (id === GLOBAL_CALENDAR) {
            globalCalendars.push(cal.calendar_id);
          } else if (groups[id]) {
            groups[id].forEach((jId) => {
              if (calendarsByJobId[jId] !== undefined) {
                calendarsByJobId[jId].push(cal.calendar_id);
              }
            });
          } else {
            if (calendarsByJobId[id] !== undefined) {
              calendarsByJobId[id].push(cal.calendar_id);
            }
          }
        });
      });

      // de-duplicate calendars
      for (const cal in calendarsByJobId) {
        if (Object.hasOwn(calendarsByJobId, cal)) {
          calendarsByJobId[cal] = uniq(calendarsByJobId[cal]);
        }
      }
    }

    // create jobs objects containing job stats, datafeeds, datafeed stats and calendars
    if (jobResults && jobResults.jobs) {
      jobResults.jobs.forEach((job) => {
        let tempJob = job as CombinedJobWithStats;

        const calendars: string[] = [
          ...(calendarsByJobId[tempJob.job_id] || []),
          ...(globalCalendars || []),
        ];
        if (calendars.length) {
          tempJob.calendars = calendars;
        }

        if (jobStatsResults && jobStatsResults.jobs) {
          const jobStats = jobStatsResults.jobs.find((js) => js.job_id === tempJob.job_id);
          if (jobStats !== undefined) {
            tempJob = { ...tempJob, ...jobStats };
            if (jobStats.node) {
              tempJob.node = jobStats.node;
            }
            if (jobStats.open_time) {
              tempJob.open_time = jobStats.open_time;
            }

            // Add in the timestamp of the last bucket processed for each job if available.
            const latestBucketTimestamp =
              latestBucketTimestampByJob && latestBucketTimestampByJob[tempJob.job_id];
            if (latestBucketTimestamp) {
              tempJob.data_counts.latest_bucket_timestamp = latestBucketTimestamp;
            }
          }
        }

        const datafeed = datafeeds[tempJob.job_id];
        if (datafeed !== undefined) {
          tempJob.datafeed_config = datafeed;
        }

        jobs.push(tempJob);
      });

      if (rulesClient) {
        const mlAlertingRules = await rulesClient.find<MlAnomalyDetectionAlertParams>({
          options: {
            filter: `alert.attributes.alertTypeId:${ML_ALERT_TYPES.ANOMALY_DETECTION}`,
            perPage: 1000,
          },
        });

        mlAlertingRules.data.forEach((curr) => {
          const {
            params: {
              jobSelection: { jobIds: ruleJobIds, groupIds: ruleGroupIds },
            },
          } = curr;

          jobs.forEach((j) => {
            const isIncluded =
              (Array.isArray(ruleJobIds) && ruleJobIds.includes(j.job_id)) ||
              (Array.isArray(ruleGroupIds) &&
                Array.isArray(j.groups) &&
                j.groups.some((g) => ruleGroupIds.includes(g)));

            if (isIncluded) {
              if (Array.isArray(j.alerting_rules)) {
                j.alerting_rules.push(curr);
              } else {
                j.alerting_rules = [curr];
              }
            }
          });
        });
      }
    }
    return jobs;
  }

  async function blockingJobTasks() {
    const jobs: Array<Record<string, JobAction>> = [];
    try {
      const body = await asInternalUser.tasks.list(
        {
          actions: JOB_ACTION_TASKS,
          detailed: true,
        },
        { maxRetries: 0 }
      );

      if (body.nodes !== undefined) {
        Object.values(body.nodes).forEach(({ tasks }) => {
          Object.values(tasks).forEach(({ action, description }) => {
            if (description === undefined) {
              return;
            }
            if (JOB_ACTION_TASK[action] === JOB_ACTION.DELETE) {
              jobs.push({ [description.replace(/^delete-job-/, '')]: JOB_ACTION.DELETE });
            } else {
              jobs.push({ [description]: JOB_ACTION_TASK[action] });
            }
          });
        });
      }
    } catch (e) {
      // if the user doesn't have permission to load the task list,
      // use the jobs list to get the ids of deleting jobs
      const { jobs: tempJobs } = await mlClient.getJobs();

      jobs.push(
        ...tempJobs
          .filter((j) => j.blocked !== undefined)
          .map((j) => ({ [j.job_id]: j.blocked!.reason }))
      );
    }
    return { jobs };
  }

  // Checks if each of the jobs in the specified list of IDs exist.
  // Job IDs in supplied array may contain wildcard '*' characters
  // e.g. *_low_request_rate_ecs
  async function jobsExist(
    jobIds: string[] = [],
    allSpaces: boolean = false
  ): Promise<JobsExistResponse> {
    const results: JobsExistResponse = Object.create(null);
    for (const jobId of jobIds) {
      try {
        if (jobId === '') {
          results[jobId] = { exists: false, isGroup: false };
          continue;
        }

        const body = allSpaces
          ? await client.asInternalUser.ml.getJobs({
              job_id: jobId,
            })
          : await mlClient.getJobs({
              job_id: jobId,
            });

        const isGroup = body.jobs.some((j) => j.groups !== undefined && j.groups.includes(jobId));
        results[jobId] = { exists: body.count > 0, isGroup };
      } catch (e) {
        // if a non-wildcarded job id is supplied, the get jobs endpoint will 404
        if (e.statusCode !== 404) {
          throw e;
        }
        results[jobId] = { exists: false, isGroup: false };
      }
    }
    return results;
  }

  async function getAllJobAndGroupIds() {
    const { getAllGroups } = groupsProvider(mlClient);
    const body = await mlClient.getJobs();
    const jobIds = body.jobs.map((job) => job.job_id);
    const groups = await getAllGroups();
    const groupIds = groups.map((group) => group.id);

    return {
      jobIds,
      groupIds,
    };
  }

  async function getLookBackProgress(jobId: string, start: number, end: number) {
    const datafeedId = createDatafeedId(jobId);
    const [body, isRunning] = await Promise.all([
      mlClient.getJobStats({ job_id: jobId }),
      isDatafeedRunning(datafeedId),
    ]);

    if (body.jobs.length) {
      const statsForJob = body.jobs[0];
      const time = statsForJob.data_counts.latest_record_timestamp!;
      const progress = (time - start) / (end - start);
      const isJobClosed = statsForJob.state === JOB_STATE.CLOSED;
      return {
        progress: progress > 0 ? Math.round(progress * 100) : 0,
        isRunning,
        isJobClosed,
      };
    }
    return { progress: 0, isRunning: false, isJobClosed: true };
  }

  async function isDatafeedRunning(datafeedId: string) {
    const body = await mlClient.getDatafeedStats({
      datafeed_id: datafeedId,
    });
    if (body.datafeeds.length) {
      const state = body.datafeeds[0].state;
      return (
        state === DATAFEED_STATE.STARTED ||
        state === DATAFEED_STATE.STARTING ||
        state === DATAFEED_STATE.STOPPING
      );
    }
    return false;
  }

  function isJobAwaitingNodeAssignment(job: CombinedJobWithStats) {
    return job.node === undefined && job.state === JOB_STATE.OPENING;
  }

  async function bulkCreate(jobs: Array<{ job: Job; datafeed: Datafeed }>) {
    const results: BulkCreateResults = Object.create(null);
    await Promise.all(
      jobs.map(async ({ job, datafeed }) => {
        results[job.job_id] = { job: { success: false }, datafeed: { success: false } };

        try {
          await mlClient.putJob(job);
          results[job.job_id].job = { success: true };
        } catch (error) {
          results[job.job_id].job = { success: false, error: error.body ?? error };
        }

        try {
          await mlClient.putDatafeed(datafeed);
          results[job.job_id].datafeed = { success: true };
        } catch (error) {
          results[job.job_id].datafeed = { success: false, error: error.body ?? error };
        }
      })
    );

    return results;
  }

  return {
    forceDeleteJob,
    deleteJobs,
    closeJobs,
    resetJobs,
    forceStopAndCloseJob,
    jobsSummary,
    jobsWithTimerange,
    getJobForCloning,
    createFullJobsList,
    blockingJobTasks,
    jobsExist,
    getAllJobAndGroupIds,
    getLookBackProgress,
    bulkCreate,
    getJobIdsWithGeo,
  };
}
