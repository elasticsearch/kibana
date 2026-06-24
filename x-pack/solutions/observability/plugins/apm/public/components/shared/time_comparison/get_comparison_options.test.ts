/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Environment } from '../../../../common/environment_rt';
import { ENVIRONMENT_ALL } from '../../../../common/environment_filter_values';
import { FETCH_STATUS } from '../../../hooks/use_fetcher';
import type { AnomalyDetectionJobsContextValue } from '../../../context/anomaly_detection_jobs/anomaly_detection_jobs_context';
import {
  EXPECTED_BOUNDS_TEST_SUBJ,
  getComparisonOptions,
  TimeRangeComparisonEnum,
} from './get_comparison_options';

const PROD = 'production' as Environment;

// 1 hour range so we get the day/week before options as base comparison types
const start = '2021-01-28T14:00:00.000Z';
const end = '2021-01-28T15:00:00.000Z';

function getJobsData(
  environments: string[]
): AnomalyDetectionJobsContextValue['anomalyDetectionJobsData'] {
  return {
    jobs: environments.map((environment) => ({ jobId: 'job', environment })),
    hasLegacyJobs: false,
  } as AnomalyDetectionJobsContextValue['anomalyDetectionJobsData'];
}

describe('getComparisonOptions - expected bounds', () => {
  it('does not offer the expected bounds option when no ML jobs exist', () => {
    const options = getComparisonOptions({
      start,
      end,
      showSelectedBoundsOption: true,
      anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
      anomalyDetectionJobsData: getJobsData([]),
      preferredEnvironment: PROD,
    });

    expect(
      options.find((option) => option.value === TimeRangeComparisonEnum.ExpectedBounds)
    ).toBeUndefined();
  });

  it('disables the option in the all environments view', () => {
    const options = getComparisonOptions({
      start,
      end,
      showSelectedBoundsOption: true,
      anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
      anomalyDetectionJobsData: getJobsData([PROD]),
      preferredEnvironment: ENVIRONMENT_ALL.value,
    });

    const expectedBoundsOption = options.find(
      (option) => option.value === TimeRangeComparisonEnum.ExpectedBounds
    );

    expect(expectedBoundsOption?.disabled).toBe(true);
    expect(expectedBoundsOption?.['data-test-subj']).toBe(
      EXPECTED_BOUNDS_TEST_SUBJ.allEnvironmentsDisabled
    );
  });

  it('enables the option when a specific environment with an ML job is selected', () => {
    const options = getComparisonOptions({
      start,
      end,
      showSelectedBoundsOption: true,
      anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
      anomalyDetectionJobsData: getJobsData([PROD]),
      preferredEnvironment: PROD,
    });

    const expectedBoundsOption = options.find(
      (option) => option.value === TimeRangeComparisonEnum.ExpectedBounds
    );

    expect(expectedBoundsOption?.disabled).toBe(false);
    expect(expectedBoundsOption?.['data-test-subj']).toBe(EXPECTED_BOUNDS_TEST_SUBJ.enabled);
  });

  it('disables the option when a specific environment without an ML job is selected', () => {
    const options = getComparisonOptions({
      start,
      end,
      showSelectedBoundsOption: true,
      anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
      anomalyDetectionJobsData: getJobsData(['staging']),
      preferredEnvironment: PROD,
    });

    const expectedBoundsOption = options.find(
      (option) => option.value === TimeRangeComparisonEnum.ExpectedBounds
    );

    expect(expectedBoundsOption?.disabled).toBe(true);
    expect(expectedBoundsOption?.['data-test-subj']).toBe(EXPECTED_BOUNDS_TEST_SUBJ.disabled);
  });
});
