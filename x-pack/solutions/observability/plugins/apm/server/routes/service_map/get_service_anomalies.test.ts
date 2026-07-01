/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AnomalyDetectorType } from '../../../common/anomaly_detection/apm_ml_detectors';
import { ENVIRONMENT_ALL_VALUE } from '../../../common/environment_filter_values';
import { getAnomalyDetectorIndex } from '../../../common/anomaly_detection/apm_ml_detectors';
import { anomalySearch } from '../../lib/anomaly_detection/anomaly_search';
import { getMlJobsWithAPMGroup } from '../../lib/anomaly_detection/get_ml_jobs_with_apm_group';
import type { MlClient } from '../../lib/helpers/get_ml_client';
import { getServiceAnomalies } from './get_service_anomalies';

jest.mock('../../lib/anomaly_detection/anomaly_search', () => {
  const actual = jest.requireActual('../../lib/anomaly_detection/anomaly_search');
  return {
    ...actual,
    anomalySearch: jest.fn(),
  };
});

jest.mock('../../lib/anomaly_detection/get_ml_jobs_with_apm_group', () => ({
  getMlJobsWithAPMGroup: jest.fn(),
}));

const anomalySearchMock = anomalySearch as jest.MockedFunction<typeof anomalySearch>;
const getMlJobsWithAPMGroupMock = getMlJobsWithAPMGroup as jest.MockedFunction<
  typeof getMlJobsWithAPMGroup
>;

function createBucket({
  serviceName,
  jobId,
  recordScore,
  detectorType,
  transactionType = 'request',
  actual = 100,
}: {
  serviceName: string;
  jobId: string;
  recordScore?: number;
  detectorType?: AnomalyDetectorType;
  transactionType?: string;
  actual?: number;
}) {
  const recordTop =
    recordScore === undefined
      ? []
      : [
          {
            metrics: {
              actual,
              by_field_value: transactionType,
              record_score: recordScore,
              detector_index:
                detectorType !== undefined ? getAnomalyDetectorIndex(detectorType) : undefined,
            },
          },
        ];

  return {
    key: { serviceName, jobId },
    record_results: { metrics: { top: recordTop } },
    model_plot_results: { metrics: { top: [] } },
  };
}

function mockAnomalyResponse(buckets: unknown[]) {
  anomalySearchMock.mockResolvedValue({
    aggregations: { services: { buckets } },
  } as unknown as Awaited<ReturnType<typeof anomalySearch>>);
}

function mockJobs(jobs: Array<{ jobId: string; environment: string }>) {
  getMlJobsWithAPMGroupMock.mockResolvedValue(
    jobs.map((job) => ({ ...job, version: 3 })) as unknown as Awaited<
      ReturnType<typeof getMlJobsWithAPMGroup>
    >
  );
}

const mlClient = {
  mlSystem: { mlAnomalySearch: jest.fn() },
  anomalyDetectors: {},
} as unknown as MlClient;

const defaultArgs = {
  mlClient,
  environment: ENVIRONMENT_ALL_VALUE,
  start: Date.now() - 1000,
  end: Date.now(),
};

describe('getServiceAnomalies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the detector type that produced the surfaced score', async () => {
    mockJobs([{ jobId: 'job-prod', environment: 'production' }]);
    mockAnomalyResponse([
      createBucket({
        serviceName: 'svc',
        jobId: 'job-prod',
        recordScore: 90,
        detectorType: AnomalyDetectorType.txFailureRate,
      }),
    ]);

    const { serviceAnomalies } = await getServiceAnomalies(defaultArgs);

    expect(serviceAnomalies).toEqual([
      {
        serviceName: 'svc',
        jobId: 'job-prod',
        transactionType: 'request',
        actualValue: 100,
        anomalyScore: 90,
        detectorType: AnomalyDetectorType.txFailureRate,
      },
    ]);
  });

  it('surfaces the highest score across environments when no environment is selected', async () => {
    mockJobs([
      { jobId: 'job-dev', environment: 'development' },
      { jobId: 'job-prod', environment: 'production' },
    ]);
    // job-dev sorts alphabetically before job-prod but has a lower score; the
    // higher-scoring production anomaly must win regardless of job id ordering.
    mockAnomalyResponse([
      createBucket({
        serviceName: 'svc',
        jobId: 'job-dev',
        recordScore: 3,
        detectorType: AnomalyDetectorType.txLatency,
      }),
      createBucket({
        serviceName: 'svc',
        jobId: 'job-prod',
        recordScore: 90,
        detectorType: AnomalyDetectorType.txFailureRate,
      }),
    ]);

    const { serviceAnomalies } = await getServiceAnomalies(defaultArgs);

    expect(serviceAnomalies).toEqual([
      {
        serviceName: 'svc',
        jobId: 'job-prod',
        transactionType: 'request',
        actualValue: 100,
        anomalyScore: 90,
        detectorType: AnomalyDetectorType.txFailureRate,
      },
    ]);
  });

  it('ignores buckets for jobs not available in the space', async () => {
    mockJobs([{ jobId: 'job-prod', environment: 'production' }]);
    mockAnomalyResponse([
      createBucket({
        serviceName: 'svc',
        jobId: 'job-unknown',
        recordScore: 99,
        detectorType: AnomalyDetectorType.txLatency,
      }),
      createBucket({
        serviceName: 'svc',
        jobId: 'job-prod',
        recordScore: 20,
        detectorType: AnomalyDetectorType.txThroughput,
      }),
    ]);

    const { serviceAnomalies } = await getServiceAnomalies(defaultArgs);

    expect(serviceAnomalies).toEqual([
      {
        serviceName: 'svc',
        jobId: 'job-prod',
        transactionType: 'request',
        actualValue: 100,
        anomalyScore: 20,
        detectorType: AnomalyDetectorType.txThroughput,
      },
    ]);
  });

  it('defaults the score to 0 when there are no record results', async () => {
    mockJobs([{ jobId: 'job-prod', environment: 'production' }]);
    mockAnomalyResponse([createBucket({ serviceName: 'svc', jobId: 'job-prod' })]);

    const { serviceAnomalies } = await getServiceAnomalies(defaultArgs);

    expect(serviceAnomalies).toHaveLength(1);
    expect(serviceAnomalies[0].anomalyScore).toEqual(0);
  });
});
