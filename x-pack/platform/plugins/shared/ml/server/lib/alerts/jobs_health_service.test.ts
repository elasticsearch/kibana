/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { JobsHealthService } from './jobs_health_service';
import {
  DELAYED_DATA_BUCKETS_PAGE_SIZE,
  jobsHealthServiceProvider,
  MAX_DELAYED_DATA_BUCKET_PAGES,
} from './jobs_health_service';
import type { DatafeedsService } from '../../models/job_service/datafeeds';
import type { Logger } from '@kbn/core/server';
import type { DeepPartial } from '@kbn/utility-types';
import type { MlClient } from '../ml_client';
import type { MlJob, MlJobStats } from '@elastic/elasticsearch/lib/api/types';
import type { AnnotationService } from '../../models/annotation_service/annotation';
import type { MlGetBucketsResponse } from '@elastic/elasticsearch/lib/api/types';
import type {
  AnomalyDetectionJobHealthAlertPayload,
  DelayedDataPayloadResponse,
  JobsHealthExecutorOptions,
} from './register_jobs_monitoring_rule_type';
import { ALERT_DELAYED_DATA_RESULTS } from '../../../common/constants/alerts';
import type { JobAuditMessagesService } from '../../models/job_audit_messages/job_audit_messages';
import type { FieldFormatsRegistryProvider } from '@kbn/ml-common-types/kibana';
import { DELAYED_DATA_THRESHOLD_TYPE } from '@kbn/ml-common-types/alerts';
import { ANNOTATION_TYPE, type Annotation } from '@kbn/ml-common-types/annotations';

const MOCK_DATE_NOW = 1487076708000;

function getDefaultExecutorOptions(
  overrides: DeepPartial<JobsHealthExecutorOptions> = {}
): JobsHealthExecutorOptions {
  return {
    state: {},
    startedAt: new Date('2021-08-12T13:13:39.396Z'),
    previousStartedAt: new Date('2021-08-12T13:13:27.396Z'),
    spaceId: 'default',
    namespace: undefined,
    name: 'ml-health-check',
    tags: [],
    createdBy: 'elastic',
    updatedBy: 'elastic',
    rule: {
      name: 'ml-health-check',
      tags: [],
      consumer: 'alerts',
      producer: 'ml',
      ruleTypeId: 'xpack.ml.anomaly_detection_jobs_health',
      ruleTypeName: 'Anomaly detection jobs health',
      enabled: true,
      schedule: { interval: '10s' },
    },
    ...overrides,
  } as unknown as JobsHealthExecutorOptions;
}

const createDelayedDataAnnotation = (jobId: string, annotation: string): Annotation => ({
  job_id: jobId,
  annotation,
  modified_time: 1627660295141,
  timestamp: 1627653000000,
  end_timestamp: 1627653300000,
  type: ANNOTATION_TYPE.ANNOTATION,
});

const createBucketsResponse = (jobId: string, eventCount: number): MlGetBucketsResponse => ({
  count: 1,
  buckets: [
    {
      anomaly_score: 0,
      bucket_influencers: [],
      bucket_span: 3600,
      event_count: eventCount,
      initial_anomaly_score: 0,
      is_interim: false,
      job_id: jobId,
      processing_time_ms: 0,
      result_type: 'bucket',
      timestamp: 0,
    },
  ],
});

const createMultiBucketResponse = (
  jobId: string,
  bucketCount: number,
  eventCountPerBucket: number
): MlGetBucketsResponse => ({
  count: bucketCount,
  buckets: Array.from({ length: bucketCount }, (_, index) => ({
    anomaly_score: 0,
    bucket_influencers: [],
    bucket_span: 3600,
    event_count: eventCountPerBucket,
    initial_anomaly_score: 0,
    is_interim: false,
    job_id: jobId,
    processing_time_ms: 0,
    result_type: 'bucket',
    timestamp: index,
  })),
});

const getDelayedDataOnlyExecutorOptions = (
  overrides: DeepPartial<JobsHealthExecutorOptions> = {}
): JobsHealthExecutorOptions => {
  const { params: paramsOverrides, ...restOverrides } = overrides;

  return getDefaultExecutorOptions({
    ...restOverrides,
    params: {
      testsConfig: {
        delayedData: {
          enabled: true,
          thresholdType: DELAYED_DATA_THRESHOLD_TYPE.PERCENTAGE,
          docsCountPercentage: 10,
          docsCount: null,
          timeInterval: '4h',
        },
        behindRealtime: { enabled: false, timeInterval: null },
        mml: { enabled: false },
        datafeed: { enabled: false },
        errorMessages: { enabled: false },
      },
      includeJobs: { jobIds: ['test_job_01'], groupIds: [] },
      excludeJobs: null,
      ...paramsOverrides,
    },
  });
};

const getDelayedDataPayloadResults = (
  payload: AnomalyDetectionJobHealthAlertPayload
): DelayedDataPayloadResponse[] => {
  if (!(ALERT_DELAYED_DATA_RESULTS in payload)) {
    throw new Error('Expected delayed data alert payload');
  }

  return payload[ALERT_DELAYED_DATA_RESULTS];
};

describe('JobsHealthService', () => {
  const mlClient = {
    getBuckets: jest.fn().mockResolvedValue({ count: 0, buckets: [] }),
    getJobs: jest.fn().mockImplementation(({ job_id: jobIds = [] }) => {
      let jobs: MlJob[] = [];

      if (jobIds.some((v: string) => v === 'test_group')) {
        jobs = [
          {
            job_id: 'test_job_01',
            analysis_config: { bucket_span: '1h' },
          } as unknown as MlJob,
          {
            job_id: 'test_job_02',
            analysis_config: { bucket_span: '15m' },
          } as unknown as MlJob,
          {
            job_id: 'test_job_03',
            analysis_config: { bucket_span: '8m' },
          } as unknown as MlJob,
        ];
      }

      if (jobIds[0]?.startsWith('test_job_')) {
        jobs = [
          {
            job_id: jobIds[0],
            analysis_config: { bucket_span: '1h' },
          } as unknown as MlJob,
        ];
      }

      return Promise.resolve({ jobs });
    }),
    getJobStats: jest.fn().mockImplementation(({ job_id: jobIdsStr }) => {
      const jobsIds = jobIdsStr.split(',');
      return Promise.resolve({
        jobs: jobsIds.map((j: string) => {
          return {
            job_id: j,
            state: j === 'test_job_02' || 'test_job_01' ? 'opened' : 'closed',
            model_size_stats: {
              memory_status: j === 'test_job_01' ? 'hard_limit' : 'ok',
              log_time: 1626935914540,
              model_bytes: 1000000,
              model_bytes_memory_limit: 800000,
              peak_model_bytes: 1000000,
              model_bytes_exceeded: 200000,
            },
          };
        }) as MlJobStats,
      });
    }),
    getDatafeedStats: jest.fn().mockImplementation(({ datafeed_id: datafeedIdsStr }) => {
      const datafeedIds = datafeedIdsStr.split(',');
      return Promise.resolve({
        datafeeds: datafeedIds.map((d: string) => {
          return {
            datafeed_id: d,
            state: d === 'test_datafeed_02' ? 'stopped' : 'started',
            timing_stats: {
              job_id: d.replace('datafeed', 'job'),
            },
          };
        }) as MlJobStats,
      });
    }),
  } as unknown as jest.Mocked<MlClient>;

  const datafeedsService = {
    getDatafeedByJobId: jest.fn().mockImplementation((jobIds: string[]) => {
      return Promise.resolve(
        jobIds.map((j) => {
          return {
            job_id: j,
            datafeed_id: j.replace('job', 'datafeed'),
            query_delay: '3m',
          };
        })
      );
    }),
  } as unknown as jest.Mocked<DatafeedsService>;

  const annotationService = {
    getDelayedDataAnnotations: jest.fn().mockImplementation(({ jobIds }: { jobIds: string[] }) => {
      return Promise.resolve(
        jobIds.map((jobId) =>
          createDelayedDataAnnotation(
            jobId,
            `Datafeed has missed ${
              jobId === 'test_job_01' ? 11 : 8
            } documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay`
          )
        )
      );
    }),
  } as unknown as jest.Mocked<AnnotationService>;

  const jobAuditMessagesService = {
    getJobsErrorMessages: jest.fn().mockImplementation((jobIds: string) => {
      return Promise.resolve([]);
    }),
  } as unknown as jest.Mocked<JobAuditMessagesService>;

  const logger = {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<Logger>;

  const getFieldsFormatRegistry = jest.fn().mockImplementation(() => {
    return Promise.resolve({
      deserialize: jest.fn().mockImplementation(({ id }: { id: string }) => {
        if (id === 'date') {
          return {
            convertToText: jest.fn().mockImplementation((v) => {
              return new Date(v).toUTCString();
            }),
          };
        }
        if (id === 'bytes') {
          return {
            convertToText: jest.fn().mockImplementation((v) => {
              return `${Math.round(v / 1000)}KB`;
            }),
          };
        }
      }),
    });
  }) as jest.Mocked<FieldFormatsRegistryProvider>;

  const jobHealthService: JobsHealthService = jobsHealthServiceProvider(
    mlClient,
    datafeedsService,
    annotationService,
    jobAuditMessagesService,
    getFieldsFormatRegistry,
    logger
  );

  let dateNowSpy: jest.SpyInstance;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => MOCK_DATE_NOW);

    annotationService.getDelayedDataAnnotations.mockImplementation(
      ({ jobIds }: { jobIds: string[] }) =>
        Promise.resolve(
          jobIds.map((jobId) =>
            createDelayedDataAnnotation(
              jobId,
              `Datafeed has missed ${
                jobId === 'test_job_01' ? 11 : 8
              } documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay`
            )
          )
        )
    );

    mlClient.getBuckets.mockResolvedValue({ count: 0, buckets: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
    dateNowSpy.mockRestore();
  });

  test('returns empty results when no jobs provided', async () => {
    // act
    const executionResult = await jobHealthService.getTestsResults(
      getDefaultExecutorOptions({
        rule: { name: 'testRule' },
        params: {
          testsConfig: null,
          includeJobs: {
            jobIds: ['*'],
            groupIds: [],
          },
          excludeJobs: null,
        },
      })
    );
    expect(logger.warn).toHaveBeenCalledWith('Rule "testRule" does not have associated jobs.');
    expect(datafeedsService.getDatafeedByJobId).not.toHaveBeenCalled();
    expect(executionResult).toEqual([]);
  });

  test('returns empty results and does not perform datafeed check when test is disabled', async () => {
    const executionResult = await jobHealthService.getTestsResults(
      getDefaultExecutorOptions({
        rule: { name: 'testRule' },
        params: {
          testsConfig: {
            datafeed: {
              enabled: false,
            },
            behindRealtime: null,
            delayedData: {
              enabled: false,
              docsCount: null,
              timeInterval: null,
            },
            errorMessages: null,
            mml: {
              enabled: false,
            },
          },
          includeJobs: {
            jobIds: ['test_job_01'],
            groupIds: [],
          },
          excludeJobs: null,
        },
      })
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(`Performing health checks for job IDs: test_job_01`);
    expect(datafeedsService.getDatafeedByJobId).not.toHaveBeenCalled();
    expect(executionResult).toEqual([
      {
        context: {
          message: 'No errors in the jobs messages.',
          results: [],
        },
        payload: {
          'kibana.alert.job_errors_results': [],
          'kibana.alert.reason': 'No errors in the jobs messages.',
        },
        isHealthy: true,
        name: 'Errors in job messages',
      },
    ]);
  });

  test('count mode: alerts without calling getBuckets', async () => {
    const executionResult = await jobHealthService.getTestsResults(
      getDefaultExecutorOptions({
        rule: { name: 'testRule_count' },
        params: {
          testsConfig: {
            delayedData: {
              enabled: true,
              thresholdType: DELAYED_DATA_THRESHOLD_TYPE.COUNT,
              docsCount: 10,
              timeInterval: '4h',
            },
            behindRealtime: { enabled: false, timeInterval: null },
            mml: { enabled: false },
            datafeed: { enabled: false },
            errorMessages: { enabled: false },
          },
          includeJobs: { jobIds: [], groupIds: ['test_group'] },
          excludeJobs: { jobIds: ['test_job_03'], groupIds: [] },
        },
      })
    );

    expect(mlClient.getBuckets).not.toHaveBeenCalled();
    expect(executionResult).toHaveLength(1);
    expect(executionResult[0].isHealthy).toBe(false);
    expect(executionResult[0].name).toBe('Data delay has occurred');
  });

  test('takes into account delayed data params', async () => {
    const executionResult = await jobHealthService.getTestsResults(
      getDefaultExecutorOptions({
        rule: { name: 'testRule_04' },
        params: {
          testsConfig: {
            delayedData: {
              enabled: true,
              docsCount: 10,
              timeInterval: '4h',
            },
            behindRealtime: { enabled: false, timeInterval: null },
            mml: { enabled: false },
            datafeed: { enabled: false },
            errorMessages: { enabled: false },
          },
          includeJobs: {
            jobIds: [],
            groupIds: ['test_group'],
          },
          excludeJobs: {
            jobIds: ['test_job_03'],
            groupIds: [],
          },
        },
      })
    );

    expect(annotationService.getDelayedDataAnnotations).toHaveBeenCalledWith({
      jobIds: ['test_job_01', 'test_job_02'],
      // 1487076708000 - 4h
      earliestMs: 1487062308000,
    });

    expect(executionResult).toEqual([
      {
        isHealthy: false,
        name: 'Data delay has occurred',
        context: {
          results: [
            {
              job_id: 'test_job_01',
              annotation:
                'Datafeed has missed 11 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay',
              end_timestamp: 'Fri, 30 Jul 2021 13:55:00 GMT',
              missed_docs_count: 11,
            },
          ],
          message: 'Job test_job_01 is suffering from delayed data.',
        },
        payload: {
          'kibana.alert.delayed_data_results': [
            {
              annotation:
                'Datafeed has missed 11 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay',
              end_timestamp: 1627653300000,
              job_id: 'test_job_01',
              missed_docs_count: 11,
            },
          ],
          'kibana.alert.reason': 'Job test_job_01 is suffering from delayed data.',
        },
      },
    ]);
  });

  test('percentage mode: alerts when missed docs exceed the percentage threshold', async () => {
    // test_job_01 exceeds the 10% threshold, test_job_02 does not
    mlClient.getBuckets.mockImplementation(async ({ job_id: jobId }) => {
      const eventCount = jobId === 'test_job_01' ? 89 : 92;
      return createBucketsResponse(jobId, eventCount);
    });

    const executionResult = await jobHealthService.getTestsResults(
      getDefaultExecutorOptions({
        rule: { name: 'testRule_pct' },
        params: {
          testsConfig: {
            delayedData: {
              enabled: true,
              thresholdType: DELAYED_DATA_THRESHOLD_TYPE.PERCENTAGE,
              docsCountPercentage: 10,
              docsCount: null,
              timeInterval: '4h',
            },
            behindRealtime: { enabled: false, timeInterval: null },
            mml: { enabled: false },
            datafeed: { enabled: false },
            errorMessages: { enabled: false },
          },
          includeJobs: { jobIds: [], groupIds: ['test_group'] },
          excludeJobs: { jobIds: ['test_job_03'], groupIds: [] },
        },
      })
    );

    expect(executionResult).toHaveLength(1);
    const [delayedResult] = executionResult;

    expect(delayedResult.isHealthy).toBe(false);
    expect(delayedResult.name).toBe('Data delay has occurred');

    const payloadResults = getDelayedDataPayloadResults(delayedResult.payload);
    expect(payloadResults).toHaveLength(1);
    expect(payloadResults[0].job_id).toBe('test_job_01');
    expect(payloadResults[0].missed_docs_percentage).toBeCloseTo(11, 1);

    const contextResults = delayedResult.context.results as Array<{
      job_id: string;
      missed_docs_percentage?: number;
    }>;
    expect(contextResults).toHaveLength(1);
    expect(contextResults[0].job_id).toBe('test_job_01');
    expect(contextResults[0].missed_docs_percentage).toBeCloseTo(11, 1);
  });

  test('percentage mode: healthy when all jobs are below the threshold', async () => {
    // Both jobs miss fewer docs than the 20% threshold.
    mlClient.getBuckets.mockImplementation(async ({ job_id: jobId }) => {
      const eventCount = jobId === 'test_job_01' ? 89 : 92;
      return createBucketsResponse(jobId, eventCount);
    });

    const executionResult = await jobHealthService.getTestsResults(
      getDefaultExecutorOptions({
        rule: { name: 'testRule_pct_healthy' },
        params: {
          testsConfig: {
            delayedData: {
              enabled: true,
              thresholdType: DELAYED_DATA_THRESHOLD_TYPE.PERCENTAGE,
              docsCountPercentage: 20,
              docsCount: null,
              timeInterval: '4h',
            },
            behindRealtime: { enabled: false, timeInterval: null },
            mml: { enabled: false },
            datafeed: { enabled: false },
            errorMessages: { enabled: false },
          },
          includeJobs: { jobIds: [], groupIds: ['test_group'] },
          excludeJobs: { jobIds: ['test_job_03'], groupIds: [] },
        },
      })
    );

    expect(executionResult).toHaveLength(1);
    expect(executionResult[0].isHealthy).toBe(true);
    expect(executionResult[0].name).toBe('Data delay has occurred');

    const payloadResults = getDelayedDataPayloadResults(executionResult[0].payload);
    expect(payloadResults).toHaveLength(2);
    expect(
      payloadResults.find((r) => r.job_id === 'test_job_01')?.missed_docs_percentage
    ).toBeCloseTo(11, 1);
    expect(
      payloadResults.find((r) => r.job_id === 'test_job_02')?.missed_docs_percentage
    ).toBeCloseTo(8, 1);
  });

  test('percentage mode: paginates getBuckets across multiple pages', async () => {
    annotationService.getDelayedDataAnnotations.mockImplementation(
      ({ jobIds }: { jobIds: string[] }) =>
        Promise.resolve(
          jobIds.map((jobId) =>
            createDelayedDataAnnotation(
              jobId,
              'Datafeed has missed 100 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay'
            )
          )
        )
    );

    mlClient.getBuckets.mockImplementation(async ({ page }) => {
      const pageFrom = page?.from ?? 0;

      if (pageFrom === 0) {
        return {
          count: DELAYED_DATA_BUCKETS_PAGE_SIZE,
          buckets: Array.from({ length: DELAYED_DATA_BUCKETS_PAGE_SIZE }, (_, index) => ({
            anomaly_score: 0,
            bucket_influencers: [],
            bucket_span: 3600,
            event_count: index < 900 ? 1 : 0,
            initial_anomaly_score: 0,
            is_interim: false,
            job_id: 'test_job_01',
            processing_time_ms: 0,
            result_type: 'bucket',
            timestamp: index,
          })),
        };
      }

      if (pageFrom === DELAYED_DATA_BUCKETS_PAGE_SIZE) {
        return createMultiBucketResponse('test_job_01', 500, 2);
      }

      return { count: 0, buckets: [] };
    });

    const executionResult = await jobHealthService.getTestsResults(
      getDelayedDataOnlyExecutorOptions({
        rule: { name: 'testRule_pct_pagination' },
      })
    );

    expect(mlClient.getBuckets).toHaveBeenCalledTimes(2);
    expect(mlClient.getBuckets).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        page: { from: 0, size: DELAYED_DATA_BUCKETS_PAGE_SIZE },
      })
    );
    expect(mlClient.getBuckets).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        page: { from: DELAYED_DATA_BUCKETS_PAGE_SIZE, size: DELAYED_DATA_BUCKETS_PAGE_SIZE },
      })
    );

    expect(executionResult).toHaveLength(1);
    expect(executionResult[0].isHealthy).toBe(true);
  });

  test('percentage mode: fires alert conservatively when bucket page limit is reached', async () => {
    mlClient.getBuckets.mockImplementation(async () =>
      createMultiBucketResponse('test_job_01', DELAYED_DATA_BUCKETS_PAGE_SIZE, 1)
    );

    const executionResult = await jobHealthService.getTestsResults(
      getDelayedDataOnlyExecutorOptions({
        rule: { name: 'testRule_pct_max_pages' },
      })
    );

    expect(mlClient.getBuckets).toHaveBeenCalledTimes(MAX_DELAYED_DATA_BUCKET_PAGES);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`${MAX_DELAYED_DATA_BUCKET_PAGES}-page bucket limit`)
    );
    expect(executionResult).toHaveLength(1);
    expect(executionResult[0].isHealthy).toBe(false);
  });

  test('percentage mode: skips alert when getBuckets fails', async () => {
    mlClient.getBuckets.mockRejectedValueOnce(new Error('ML API unavailable'));

    const executionResult = await jobHealthService.getTestsResults(
      getDelayedDataOnlyExecutorOptions({
        rule: { name: 'testRule_pct_error' },
      })
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch buckets for job test_job_01')
    );
    expect(executionResult).toHaveLength(1);
    expect(executionResult[0].isHealthy).toBe(true);
  });

  test('percentage mode: skips alert when total document count is zero', async () => {
    annotationService.getDelayedDataAnnotations.mockImplementation(
      ({ jobIds }: { jobIds: string[] }) =>
        Promise.resolve(
          jobIds.map((jobId) =>
            createDelayedDataAnnotation(
              jobId,
              'Datafeed has missed 0 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay'
            )
          )
        )
    );

    mlClient.getBuckets.mockResolvedValueOnce({ count: 0, buckets: [] });

    const executionResult = await jobHealthService.getTestsResults(
      getDelayedDataOnlyExecutorOptions({
        rule: { name: 'testRule_pct_zero_total' },
      })
    );

    expect(executionResult).toHaveLength(1);
    expect(executionResult[0].isHealthy).toBe(true);
  });

  test('percentage mode: alerts when missed docs are exactly at the threshold', async () => {
    annotationService.getDelayedDataAnnotations.mockImplementation(
      ({ jobIds }: { jobIds: string[] }) =>
        Promise.resolve(
          jobIds.map((jobId) =>
            createDelayedDataAnnotation(
              jobId,
              'Datafeed has missed 3 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay'
            )
          )
        )
    );

    mlClient.getBuckets.mockImplementation(async ({ job_id: jobId }) =>
      createBucketsResponse(jobId, 27)
    );

    const executionResult = await jobHealthService.getTestsResults(
      getDelayedDataOnlyExecutorOptions({
        rule: { name: 'testRule_pct_boundary' },
      })
    );

    expect(executionResult).toHaveLength(1);
    expect(executionResult[0].isHealthy).toBe(false);

    const payloadResults = getDelayedDataPayloadResults(executionResult[0].payload);
    expect(payloadResults[0].missed_docs_percentage).toBe(10);
  });

  test('returns results based on provided selection', async () => {
    const executionResult = await jobHealthService.getTestsResults(
      getDefaultExecutorOptions({
        rule: { name: 'testRule_03' },
        params: {
          testsConfig: null,
          includeJobs: {
            jobIds: [],
            groupIds: ['test_group'],
          },
          excludeJobs: {
            jobIds: ['test_job_03'],
            groupIds: [],
          },
        },
      })
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      `Performing health checks for job IDs: test_job_01, test_job_02`
    );
    expect(datafeedsService.getDatafeedByJobId).toHaveBeenCalledWith([
      'test_job_01',
      'test_job_02',
    ]);
    expect(datafeedsService.getDatafeedByJobId).toHaveBeenCalledTimes(1);
    expect(mlClient.getJobStats).toHaveBeenCalledWith({ job_id: 'test_job_01,test_job_02' });
    expect(mlClient.getDatafeedStats).toHaveBeenCalledWith({
      datafeed_id: 'test_datafeed_01,test_datafeed_02',
    });
    expect(mlClient.getJobStats).toHaveBeenCalledTimes(1);
    expect(annotationService.getDelayedDataAnnotations).toHaveBeenCalledWith({
      jobIds: ['test_job_01', 'test_job_02'],
      earliestMs: 1487069268000,
    });

    expect(executionResult).toEqual([
      {
        isHealthy: false,
        name: 'Datafeed is not started',
        context: {
          results: [
            {
              job_id: 'test_job_02',
              job_state: 'opened',
              datafeed_id: 'test_datafeed_02',
              datafeed_state: 'stopped',
            },
          ],
          message: 'Datafeed is not started for job test_job_02',
        },
        payload: {
          'kibana.alert.datafeed_results': [
            {
              datafeed_id: 'test_datafeed_02',
              datafeed_state: 'stopped',
              job_id: 'test_job_02',
              job_state: 'opened',
            },
          ],
          'kibana.alert.reason': 'Datafeed is not started for job test_job_02',
        },
      },
      {
        isHealthy: false,
        name: 'Model memory limit reached',
        context: {
          results: [
            {
              job_id: 'test_job_01',
              log_time: 'Thu, 22 Jul 2021 06:38:34 GMT',
              memory_status: 'hard_limit',
              model_bytes: '1000KB',
              model_bytes_exceeded: '200KB',
              model_bytes_memory_limit: '800KB',
              peak_model_bytes: '1000KB',
            },
          ],
          message:
            'Job test_job_01 reached the hard model memory limit. Assign more memory to the job and restore it from a snapshot taken prior to reaching the hard limit.',
        },
        payload: {
          'kibana.alert.mml_results': [
            {
              job_id: 'test_job_01',
              log_time: 1626935914540,
              memory_status: 'hard_limit',
              model_bytes: 1000000,
              model_bytes_exceeded: 200000,
              model_bytes_memory_limit: 800000,
              peak_model_bytes: 1000000,
            },
          ],
          'kibana.alert.reason':
            'Job test_job_01 reached the hard model memory limit. Assign more memory to the job and restore it from a snapshot taken prior to reaching the hard limit.',
        },
      },
      {
        isHealthy: false,
        name: 'Data delay has occurred',
        context: {
          results: [
            {
              job_id: 'test_job_01',
              annotation:
                'Datafeed has missed 11 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay',
              end_timestamp: 'Fri, 30 Jul 2021 13:55:00 GMT',
              missed_docs_count: 11,
            },
            {
              job_id: 'test_job_02',
              annotation:
                'Datafeed has missed 8 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay',
              end_timestamp: 'Fri, 30 Jul 2021 13:55:00 GMT',
              missed_docs_count: 8,
            },
          ],
          message: 'Jobs test_job_01, test_job_02 are suffering from delayed data.',
        },
        payload: {
          'kibana.alert.delayed_data_results': [
            {
              annotation:
                'Datafeed has missed 11 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay',
              end_timestamp: 1627653300000,
              job_id: 'test_job_01',
              missed_docs_count: 11,
            },
            {
              annotation:
                'Datafeed has missed 8 documents due to ingest latency, latest bucket with missing data is [2021-07-30T13:50:00.000Z]. Consider increasing query_delay',
              end_timestamp: 1627653300000,
              job_id: 'test_job_02',
              missed_docs_count: 8,
            },
          ],
          'kibana.alert.reason': 'Jobs test_job_01, test_job_02 are suffering from delayed data.',
        },
      },
      {
        isHealthy: true,
        name: 'Errors in job messages',
        context: {
          message: 'No errors in the jobs messages.',
          results: [],
        },
        payload: {
          'kibana.alert.job_errors_results': [],
          'kibana.alert.reason': 'No errors in the jobs messages.',
        },
      },
    ]);
  });
});
