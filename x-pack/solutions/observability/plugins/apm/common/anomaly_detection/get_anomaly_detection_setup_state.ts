/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
// eslint-disable-next-line @kbn/imports/no_boundary_crossing
import { FETCH_STATUS } from '../../public/hooks/use_fetcher';
import type { APIReturnType } from '../../public/services/rest/create_call_apm_api';
import { ENVIRONMENT_ALL } from '../environment_filter_values';

export enum AnomalyDetectionSetupState {
  Loading = 'pending',
  Failure = 'failure',
  Unknown = 'unknown',
  NoJobs = 'noJobs',
  NoJobsForEnvironment = 'noJobsForEnvironment',
  LegacyJobs = 'legacyJobs',
  UpgradeableJobs = 'upgradeableJobs',
  UpToDate = 'upToDate',
}

export function getAnomalyDetectionSetupState({
  environment,
  jobs,
  fetchStatus,
  isAuthorized,
}: {
  environment: string;
  jobs: APIReturnType<'GET /internal/apm/settings/anomaly-detection/jobs'>['jobs'];
  fetchStatus: FETCH_STATUS;
  isAuthorized: boolean;
}): AnomalyDetectionSetupState {
  if (!isAuthorized) {
    return AnomalyDetectionSetupState.Unknown;
  }

  if (fetchStatus === FETCH_STATUS.LOADING) {
    return AnomalyDetectionSetupState.Loading;
  }

  if (fetchStatus === FETCH_STATUS.FAILURE) {
    return AnomalyDetectionSetupState.Failure;
  }

  if (fetchStatus !== FETCH_STATUS.SUCCESS) {
    return AnomalyDetectionSetupState.Unknown;
  }

  const jobsForEnvironment =
    environment === ENVIRONMENT_ALL.value
      ? jobs
      : jobs.filter((job) => job.environment === environment);

  const hasV1Jobs = jobs.some((job) => job.version === 1);
  const hasV2Jobs = jobsForEnvironment.some((job) => job.version === 2);
  const hasV3Jobs = jobsForEnvironment.some((job) => job.version === 3);
  const hasAnyJobs = jobs.length > 0;

  if (hasV3Jobs) {
    return AnomalyDetectionSetupState.UpToDate;
  }

  if (hasV2Jobs) {
    return AnomalyDetectionSetupState.UpgradeableJobs;
  }

  if (hasV1Jobs) {
    return AnomalyDetectionSetupState.LegacyJobs;
  }

  if (hasAnyJobs) {
    return AnomalyDetectionSetupState.NoJobsForEnvironment;
  }

  return AnomalyDetectionSetupState.NoJobs;
}

export function getIsAnomalyDetectionConfigured(setupState: AnomalyDetectionSetupState) {
  switch (setupState) {
    case AnomalyDetectionSetupState.UpToDate:
    case AnomalyDetectionSetupState.UpgradeableJobs:
    case AnomalyDetectionSetupState.LegacyJobs:
    case AnomalyDetectionSetupState.NoJobsForEnvironment:
      return true;
    default:
      return false;
  }
}

export function getIsAnomalyDetectionConfiguredForEnvironment(
  setupState: AnomalyDetectionSetupState
) {
  switch (setupState) {
    case AnomalyDetectionSetupState.UpToDate:
    case AnomalyDetectionSetupState.UpgradeableJobs:
    case AnomalyDetectionSetupState.LegacyJobs:
      return true;
    default:
      return false;
  }
}
