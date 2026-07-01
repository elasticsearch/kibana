/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useLocation } from 'react-router-dom';
import { getIsAnomalyDetectionConfigured } from '../../common/anomaly_detection/get_anomaly_detection_setup_state';
import { useAnomalyDetectionJobsContext } from '../context/anomaly_detection_jobs/use_anomaly_detection_jobs_context';
import { useApmRouter } from './use_apm_router';

export function useShouldShowAnomalyUi() {
  const { anomalyDetectionSetupState } = useAnomalyDetectionJobsContext();
  const isConfigured = getIsAnomalyDetectionConfigured(anomalyDetectionSetupState);

  const location = useLocation();
  const apmRouter = useApmRouter();

  const matchingRoutes = apmRouter.getRoutesToMatch(location.pathname);
  const isProperTab =
    !matchingRoutes.some(
      (d) =>
        d.path === '/services/{serviceName}/transactions/view' ||
        d.path === '/mobile-services/{serviceName}/transactions/view'
    ) &&
    matchingRoutes.some(
      (d) =>
        d.path === '/services/{serviceName}/overview' ||
        d.path === '/services/{serviceName}/transactions' ||
        d.path === '/mobile-services/{serviceName}/overview' ||
        d.path === '/mobile-services/{serviceName}/transactions'
    );

  return isConfigured && isProperTab;
}
