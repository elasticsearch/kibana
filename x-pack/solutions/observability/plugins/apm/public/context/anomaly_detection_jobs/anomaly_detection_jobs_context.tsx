/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext } from 'react';
import type { AnomalyDetectionSetupState } from '../../../common/anomaly_detection/get_anomaly_detection_setup_state';
import { getAnomalyDetectionSetupState } from '../../../common/anomaly_detection/get_anomaly_detection_setup_state';
import type { FETCH_STATUS } from '../../hooks/use_fetcher';
import { useFetcher } from '../../hooks/use_fetcher';
import type { APIReturnType } from '../../services/rest/create_call_apm_api';
import { useApmPluginContext } from '../apm_plugin/use_apm_plugin_context';
import { useLicenseContext } from '../license/use_license_context';
import { useEnvironmentsContext } from '../environments_context/use_environments_context';

export interface AnomalyDetectionJobsContextValue {
  anomalyDetectionJobsData?: APIReturnType<'GET /internal/apm/settings/anomaly-detection/jobs'>;
  anomalyDetectionJobsStatus: FETCH_STATUS;
  anomalyDetectionJobsRefetch: () => void;
  anomalyDetectionSetupState: AnomalyDetectionSetupState;
}

export const AnomalyDetectionJobsContext = createContext({} as AnomalyDetectionJobsContextValue);

export function AnomalyDetectionJobsContextProvider({ children }: React.PropsWithChildren) {
  const { core } = useApmPluginContext();
  const canGetJobs = !!core.application.capabilities.ml?.canGetJobs;
  const license = useLicenseContext();
  const hasValidLicense = license?.isActive && license?.hasAtLeast('platinum');

  const isAuthorized = !!(canGetJobs && hasValidLicense);

  const { data, status, refetch } = useFetcher(
    (callApmApi) => {
      if (!isAuthorized) {
        return;
      }
      return callApmApi(`GET /internal/apm/settings/anomaly-detection/jobs`);
    },
    [isAuthorized],
    { showToastOnError: false }
  );

  const { preferredEnvironment } = useEnvironmentsContext();

  const anomalyDetectionSetupState = getAnomalyDetectionSetupState({
    environment: preferredEnvironment,
    fetchStatus: status,
    jobs: data?.jobs ?? [],
    isAuthorized,
  });

  return (
    <AnomalyDetectionJobsContext.Provider
      value={{
        anomalyDetectionJobsData: data,
        anomalyDetectionJobsStatus: status,
        anomalyDetectionJobsRefetch: refetch,
        anomalyDetectionSetupState,
      }}
    >
      {children}
    </AnomalyDetectionJobsContext.Provider>
  );
}
