/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { groupBy, keyBy, memoize, partition } from 'lodash';

import type { KibanaRequest, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import type { MlJob } from '@elastic/elasticsearch/lib/api/types';
import { isDefined } from '@kbn/ml-is-defined';
import { ALERT_REASON } from '@kbn/rule-data-utils';
import { parseInterval } from '@kbn/ml-parse-interval';

import type { DatafeedStats } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed_stats';
import type { FieldFormatsRegistryProvider } from '@kbn/ml-common-types/kibana';
import type { MlClient } from '../ml_client';
import type { JobSelection } from '../../routes/schemas/alerting_schema';
import { datafeedsProvider, type DatafeedsService } from '../../models/job_service/datafeeds';
import {
  ALERT_DATAFEED_RESULTS,
  ALERT_DELAYED_DATA_RESULTS,
  ALERT_JOB_ERRORS_RESULTS,
  ALERT_MML_RESULTS,
  ALL_JOBS_SELECTION,
  HEALTH_CHECK_NAMES,
} from '../../../common/constants/alerts';
import type { GetGuards } from '../../shared_services/shared_services';
import type {
  AnomalyDetectionJobHealthAlertPayload,
  AnomalyDetectionJobsHealthAlertContext,
  DelayedDataPayloadResponse,
  JobsErrorsResponse,
  JobsHealthExecutorOptions,
  MmlTestPayloadResponse,
  NotStartedDatafeedResponse,
} from './register_jobs_monitoring_rule_type';
import {
  getResultJobsHealthRuleConfig,
  resolveLookbackInterval,
} from '../../../common/util/alerts';
import type { AnnotationService } from '../../models/annotation_service/annotation';
import { annotationServiceProvider } from '../../models/annotation_service';
import {
  jobAuditMessagesProvider,
  type JobAuditMessagesService,
} from '../../models/job_audit_messages/job_audit_messages';
import type { ServerlessInfo } from '../../types';

export interface TestResult {
  name: string;
  context: AnomalyDetectionJobsHealthAlertContext;
  payload: AnomalyDetectionJobHealthAlertPayload;
  /**
   * Indicates if the health check is successful.
   */
  isHealthy: boolean;
}

type TestsResults = TestResult[];

export function jobsHealthServiceProvider(
  mlClient: MlClient,
  datafeedsService: DatafeedsService,
  annotationService: AnnotationService,
  jobAuditMessagesService: JobAuditMessagesService,
  getFieldsFormatRegistry: FieldFormatsRegistryProvider,
  logger: Logger
) {
  /**
   * Provides a callback for date formatting based on the Kibana settings.
   */
  const getFormatters = memoize(async () => {
    const fieldFormatsRegistry = await getFieldsFormatRegistry();
    const dateFormat = fieldFormatsRegistry.deserialize({ id: 'date' });
    const bytesFormat = fieldFormatsRegistry.deserialize({ id: 'bytes' });

    const dateFormatter = (v: unknown) => dateFormat.convertToText(v);
    const bytesFormatter = (v: unknown) => bytesFormat.convertToText(v);

    return {
      dateFormatter,
      bytesFormatter,
      mmlResultsFormatter: (payload: MmlTestPayloadResponse) => {
        return {
          job_id: payload.job_id,
          memory_status: payload.memory_status,
          log_time: dateFormatter(payload.log_time),
          model_bytes: bytesFormatter(payload.model_bytes),
          model_bytes_memory_limit: bytesFormatter(payload.model_bytes_memory_limit),
          peak_model_bytes: bytesFormatter(payload.peak_model_bytes),
          model_bytes_exceeded: bytesFormatter(payload.model_bytes_exceeded),
        };
      },
      delayedDataFormatter: (payload: DelayedDataPayloadResponse) => {
        return {
          job_id: payload.job_id,
          annotation: payload.annotation,
          missed_docs_count: payload.missed_docs_count,
          end_timestamp: dateFormatter(payload.end_timestamp),
        };
      },
    };
  });

  /**
   * Extracts result list of jobs based on included and excluded selection of jobs and groups.
   * @param includeJobs
   * @param excludeJobs
   */
  const getResultJobs = async (
    includeJobs: JobSelection,
    excludeJobs?: JobSelection | null
  ): Promise<MlJob[]> => {
    const jobAndGroupIds = [...(includeJobs.jobIds ?? []), ...(includeJobs.groupIds ?? [])];

    const includeAllJobs = jobAndGroupIds.some((id) => id === ALL_JOBS_SELECTION);

    // Extract jobs from group ids and make sure provided jobs assigned to a current space
    const jobsResponse = (
      await mlClient.getJobs({
        ...(includeAllJobs ? {} : { job_id: jobAndGroupIds }),
      })
    ).jobs;

    let resultJobs = jobsResponse;

    if (excludeJobs && (!!excludeJobs.jobIds.length || !!excludeJobs?.groupIds.length)) {
      const excludedJobAndGroupIds = [
        ...(excludeJobs?.jobIds ?? []),
        ...(excludeJobs?.groupIds ?? []),
      ];
      const excludedJobsResponse = (
        await mlClient.getJobs({
          job_id: excludedJobAndGroupIds,
        })
      ).jobs;

      const excludedJobsIds: Set<string> = new Set(excludedJobsResponse.map((v) => v.job_id));

      resultJobs = resultJobs.filter((v) => !excludedJobsIds.has(v.job_id));
    }

    return resultJobs;
  };

  /**
   * Resolves the timestamp for delayed data check.
   *
   * @param timeInterval - Custom time interval provided by the user.
   * @param defaultLookbackInterval - Interval derived from the jobs and datefeeds configs.
   */
  const getDelayedDataLookbackTimestamp = (
    timeInterval: string | null,
    defaultLookbackInterval: string
  ): number => {
    const currentTimestamp = Date.now();

    const defaultLookbackTimestamp =
      currentTimestamp - parseInterval(defaultLookbackInterval)!.asMilliseconds();

    const customIntervalOffsetTimestamp = timeInterval
      ? currentTimestamp - parseInterval(timeInterval)!.asMilliseconds()
      : null;

    return Math.min(...[defaultLookbackTimestamp, customIntervalOffsetTimestamp].filter(isDefined));
  };

  const getJobIds = memoize((jobs: MlJob[]) => jobs.map((j) => j.job_id));

  const getDatafeeds = memoize(datafeedsService.getDatafeedByJobId);

  const getJobStats = memoize(
    async (jobIds: string[]) => (await mlClient.getJobStats({ job_id: jobIds.join(',') })).jobs
  );

  /** Gets values for translation string */
  const getJobsAlertingMessageValues = <T extends Array<{ job_id: string } | undefined>>(
    results: T
  ) => {
    const jobIds = (results || []).filter(isDefined).map((v) => v.job_id);
    return {
      count: jobIds.length,
      jobsString: jobIds.join(', '),
    };
  };

  return {
    /**
     * Gets not started datafeeds for opened jobs.
     * @param jobIds
     */
    async getDatafeedsReport(jobIds: string[]): Promise<NotStartedDatafeedResponse[] | void> {
      const datafeeds = await getDatafeeds(jobIds);

      if (datafeeds) {
        const jobsStats = await getJobStats(jobIds);

        const { datafeeds: datafeedsStats } = await mlClient.getDatafeedStats({
          datafeed_id: datafeeds.map((d) => d.datafeed_id).join(','),
        });

        // match datafeed stats with the job ids
        return (datafeedsStats as DatafeedStats[])
          .map((datafeedStats) => {
            const jobId = datafeedStats.timing_stats!.job_id;
            const jobState =
              jobsStats.find((jobStats) => jobStats.job_id === jobId)?.state ?? 'failed';
            return {
              datafeed_id: datafeedStats.datafeed_id,
              datafeed_state: datafeedStats.state,
              job_id: jobId,
              job_state: jobState,
            };
          })
          .filter((datafeedStat) => {
            // Find opened jobs
            return datafeedStat.job_state === 'opened';
          });
      }
    },
    /**
     * Gets the model memory report for opened jobs.
     * @param jobIds
     */
    async getMmlReport(jobIds: string[]): Promise<MmlTestPayloadResponse[]> {
      const jobsStats = await getJobStats(jobIds);

      return jobsStats
        .filter((j) => j.state === 'opened')
        .map(({ job_id: jobId, model_size_stats: modelSizeStats }) => {
          return {
            job_id: jobId,
            memory_status: modelSizeStats.memory_status,
            log_time: modelSizeStats.log_time,
            model_bytes: modelSizeStats.model_bytes,
            model_bytes_memory_limit: modelSizeStats.model_bytes_memory_limit!,
            peak_model_bytes: modelSizeStats.peak_model_bytes!,
            model_bytes_exceeded: modelSizeStats.model_bytes_exceeded!,
          };
        });
    },
    /**
     * Returns annotations about delayed data.
     *
     * @param jobs
     * @param timeInterval - Custom time interval provided by the user.
     * @param docsCount - The threshold for a number of missing documents to alert upon.
     *
     * @return {Promise<[DelayedDataResponse[], DelayedDataResponse[]]>} - Collections of annotations exceeded and not exceeded the docs threshold.
     */
    async getDelayedDataReport(
      jobs: MlJob[],
      timeInterval: string | null,
      docsCount: number | null
    ): Promise<[DelayedDataPayloadResponse[], DelayedDataPayloadResponse[]]> {
      const jobIds = getJobIds(jobs);
      const datafeeds = await getDatafeeds(jobIds);

      const datafeedsMap = keyBy(datafeeds, 'job_id');

      // We shouldn't check jobs that don't have associated datafeeds
      const resultJobs = jobs.filter((j) => datafeedsMap[j.job_id] !== undefined);
      const resultJobIds = getJobIds(resultJobs);
      const jobsMap = keyBy(resultJobs, 'job_id');

      const defaultLookbackInterval = resolveLookbackInterval(resultJobs, datafeeds!);
      const earliestMs = getDelayedDataLookbackTimestamp(timeInterval, defaultLookbackInterval);

      const annotationsData = (
        await annotationService.getDelayedDataAnnotations({
          jobIds: resultJobIds,
          earliestMs,
        })
      )
        .map((v) => {
          // TODO Update when https://github.com/elastic/elasticsearch/issues/76088 is resolved.
          const match = v.annotation.match(/Datafeed has missed (\d+)\s/);
          const missedDocsCount = match ? parseInt(match[1], 10) : 0;
          return {
            annotation: v.annotation,
            // end_timestamp is always defined for delayed_data annotation
            end_timestamp: v.end_timestamp!,
            missed_docs_count: missedDocsCount,
            job_id: v.job_id,
          };
        })
        .filter((v) => {
          // As we retrieved annotations based on the longest bucket span and query delay,
          // we need to check end_timestamp against appropriate job configuration.

          const job = jobsMap[v.job_id];
          const datafeed = datafeedsMap[v.job_id];

          const jobLookbackInterval = resolveLookbackInterval([job], [datafeed]);

          const isEndTimestampWithinRange =
            v.end_timestamp > getDelayedDataLookbackTimestamp(timeInterval, jobLookbackInterval);

          return isEndTimestampWithinRange;
        });

      return partition(annotationsData, (v) => {
        const isDocCountExceededThreshold = docsCount ? v.missed_docs_count >= docsCount : true;
        return isDocCountExceededThreshold;
      });
    },
    /**
     * Retrieves a list of the latest errors per jobs.
     * @param jobIds List of job IDs.
     * @param previousStartedAt Time of the previous rule execution. As we intend to notify
     *                          about an error only once, limit the scope of the errors search.
     */
    async getErrorsReport(
      jobIds: string[],
      previousStartedAt: Date
    ): Promise<JobsErrorsResponse[]> {
      const { dateFormatter } = await getFormatters();

      return (
        await jobAuditMessagesService.getJobsErrorMessages(jobIds, previousStartedAt.getTime())
      ).map((v) => {
        return {
          ...v,
          errors: v.errors.map((e) => {
            return {
              ...e,
              timestamp: dateFormatter(e.timestamp),
            };
          }),
        };
      });
    },
    /**
     * Retrieves report grouped by test.
     */
    async getTestsResults(executorOptions: JobsHealthExecutorOptions): Promise<TestsResults> {
      const {
        rule,
        previousStartedAt,
        params: { testsConfig, includeJobs, excludeJobs },
      } = executorOptions;

      const config = getResultJobsHealthRuleConfig(testsConfig);

      const results: TestsResults = [];

      const jobs = await getResultJobs(includeJobs, excludeJobs);
      const jobIds = getJobIds(jobs);

      if (jobIds.length === 0) {
        logger.warn(`Rule "${rule.name}" does not have associated jobs.`);
        return results;
      }

      logger.debug(`Performing health checks for job IDs: ${jobIds.join(', ')}`);

      if (config.datafeed.enabled) {
        const response = await this.getDatafeedsReport(jobIds);
        if (response && response.length > 0) {
          const [startedDatafeeds, notStartedDatafeeds] = partition(
            response,
            (datafeedStat) => datafeedStat.datafeed_state === 'started'
          );

          const isHealthy = notStartedDatafeeds.length === 0;
          const datafeedResults = isHealthy ? startedDatafeeds : notStartedDatafeeds;
          const { count, jobsString } = getJobsAlertingMessageValues(datafeedResults);

          const message = isHealthy
            ? i18n.translate('xpack.ml.alertTypes.jobsHealthAlertingRule.datafeedRecoveryMessage', {
                defaultMessage:
                  'Datafeed is started for {count, plural, one {job} other {jobs}} {jobsString}',
                values: { count, jobsString },
              })
            : i18n.translate('xpack.ml.alertTypes.jobsHealthAlertingRule.datafeedStateMessage', {
                defaultMessage:
                  'Datafeed is not started for {count, plural, one {job} other {jobs}} {jobsString}',
                values: { count, jobsString },
              });

          results.push({
            isHealthy,
            name: HEALTH_CHECK_NAMES.datafeed.name,
            payload: {
              [ALERT_REASON]: message,
              [ALERT_DATAFEED_RESULTS]: datafeedResults,
            },
            context: {
              results: datafeedResults,
              message,
            },
          });
        }
      }

      if (config.mml.enabled) {
        const response = await this.getMmlReport(jobIds);
        if (response && response.length > 0) {
          const {
            hard_limit: hardLimitJobs,
            soft_limit: softLimitJobs,
            ok: okJobs,
          } = groupBy(response, 'memory_status');

          const isHealthy = !hardLimitJobs?.length && !softLimitJobs?.length;

          let message = '';

          if (isHealthy) {
            message = i18n.translate(
              'xpack.ml.alertTypes.jobsHealthAlertingRule.mmlRecoveredMessage',
              {
                defaultMessage: `All jobs are running within configured model memory limits.`,
              }
            );
          } else {
            const { count: hardLimitCount, jobsString: hardLimitJobsString } =
              getJobsAlertingMessageValues(hardLimitJobs);
            const { count: softLimitCount, jobsString: softLimitJobsString } =
              getJobsAlertingMessageValues(softLimitJobs);

            if (hardLimitCount > 0) {
              message = i18n.translate('xpack.ml.alertTypes.jobsHealthAlertingRule.mmlMessage', {
                defaultMessage: `{count, plural, one {Job} other {Jobs}} {jobsString} reached the hard model memory limit. Assign more memory to the job and restore it from a snapshot taken prior to reaching the hard limit.`,
                values: {
                  count: hardLimitCount,
                  jobsString: hardLimitJobsString,
                },
              });
            }

            if (softLimitCount > 0) {
              if (message.length > 0) {
                message += '\n';
              }
              message += i18n.translate(
                'xpack.ml.alertTypes.jobsHealthAlertingRule.mmlSoftLimitMessage',
                {
                  defaultMessage:
                    '{count, plural, one {Job} other {Jobs}} {jobsString} reached the soft model memory limit. Assign more memory to the job or edit the datafeed filter to limit the scope of analysis.',
                  values: {
                    count: softLimitCount,
                    jobsString: softLimitJobsString,
                  },
                }
              );
            }
          }

          const mmlResults = isHealthy
            ? okJobs
            : [...(hardLimitJobs ?? []), ...(softLimitJobs ?? [])];

          const { mmlResultsFormatter } = await getFormatters();

          results.push({
            isHealthy,
            name: HEALTH_CHECK_NAMES.mml.name,
            context: {
              results: mmlResults.map(mmlResultsFormatter),
              message,
            },
            payload: {
              [ALERT_REASON]: message,
              [ALERT_MML_RESULTS]: mmlResults,
            },
          });
        }
      }

      if (config.delayedData.enabled) {
        const [exceededThresholdAnnotations, withinThresholdAnnotations] =
          await this.getDelayedDataReport(
            jobs,
            config.delayedData.timeInterval,
            config.delayedData.docsCount
          );

        const isHealthy = exceededThresholdAnnotations.length === 0;
        const { count, jobsString } = getJobsAlertingMessageValues(exceededThresholdAnnotations);

        const message = isHealthy
          ? i18n.translate(
              'xpack.ml.alertTypes.jobsHealthAlertingRule.delayedDataRecoveryMessage',
              {
                defaultMessage: 'No data delay has occurred.',
              }
            )
          : i18n.translate('xpack.ml.alertTypes.jobsHealthAlertingRule.delayedDataMessage', {
              defaultMessage:
                '{count, plural, one {Job} other {Jobs}} {jobsString} {count, plural, one {is} other {are}} suffering from delayed data.',
              values: { count, jobsString },
            });

        const delayedDataResults = isHealthy
          ? withinThresholdAnnotations
          : exceededThresholdAnnotations;

        results.push({
          isHealthy,
          name: HEALTH_CHECK_NAMES.delayedData.name,
          context: {
            results: delayedDataResults.map((await getFormatters()).delayedDataFormatter),
            message,
          },
          payload: {
            [ALERT_REASON]: message,
            [ALERT_DELAYED_DATA_RESULTS]: delayedDataResults,
          },
        });
      }

      if (config.errorMessages.enabled && previousStartedAt) {
        const response = await this.getErrorsReport(jobIds, previousStartedAt);
        const { count, jobsString } = getJobsAlertingMessageValues(response);
        const isHealthy = response.length === 0;

        const message = isHealthy
          ? i18n.translate(
              'xpack.ml.alertTypes.jobsHealthAlertingRule.errorMessagesRecoveredMessage',
              {
                defaultMessage:
                  'No errors in the {count, plural, one {job} other {jobs}} messages.',
                values: { count },
              }
            )
          : i18n.translate('xpack.ml.alertTypes.jobsHealthAlertingRule.errorMessagesMessage', {
              defaultMessage:
                '{count, plural, one {Job} other {Jobs}} {jobsString} {count, plural, one {contains} other {contain}} errors in the messages.',
              values: { count, jobsString },
            });

        results.push({
          isHealthy,
          name: HEALTH_CHECK_NAMES.errorMessages.name,
          context: {
            results: response,
            message,
          },
          payload: {
            [ALERT_REASON]: message,
            [ALERT_JOB_ERRORS_RESULTS]: response,
          },
        });
      }

      return results;
    },
  };
}

export type JobsHealthService = ReturnType<typeof jobsHealthServiceProvider>;

export function getJobsHealthServiceProvider(getGuards: GetGuards, serverless: ServerlessInfo) {
  return {
    jobsHealthServiceProvider(
      savedObjectsClient: SavedObjectsClientContract,
      request: KibanaRequest,
      logger: Logger
    ) {
      return {
        getTestsResults: async (
          ...args: Parameters<JobsHealthService['getTestsResults']>
        ): ReturnType<JobsHealthService['getTestsResults']> => {
          return await getGuards(request, savedObjectsClient)
            .isFullLicense()
            .hasMlCapabilities(['canGetJobs'])
            .ok(({ mlClient, scopedClient, getFieldsFormatRegistry }) =>
              jobsHealthServiceProvider(
                mlClient,
                datafeedsProvider(scopedClient, mlClient),
                annotationServiceProvider(scopedClient, serverless),
                jobAuditMessagesProvider(scopedClient, mlClient, serverless),
                getFieldsFormatRegistry,
                logger
              ).getTestsResults(...args)
            );
        },
      };
    },
  };
}

export type JobsHealthServiceProvider = ReturnType<typeof getJobsHealthServiceProvider>;
