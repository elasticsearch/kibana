/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useTimeRange } from '../../../../hooks/use_time_range';
import type { Environment } from '../../../../../common/environment_rt';
import { getAlertingCapabilities } from '../../../alerting/utils/get_alerting_capabilities';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { FETCH_STATUS, useFetcher } from '../../../../hooks/use_fetcher';

interface ServiceBadgesDataParams {
  serviceName: string;
  environment: Environment;
  rangeFrom: string;
  rangeTo: string;
}

interface ServiceBadgesData {
  alertsCount?: number;
  anomalyScore?: number;
}

export function useServiceBadgesData({
  serviceName,
  environment,
  rangeFrom,
  rangeTo,
}: ServiceBadgesDataParams): ServiceBadgesData {
  const { core, plugins } = useApmPluginContext();
  const { capabilities } = core.application;
  const { isAlertingAvailable, canReadAlerts } = getAlertingCapabilities(plugins, capabilities);
  const { start = '', end = '' } = useTimeRange({ rangeFrom, rangeTo });
  const canReadMlJobs = !!capabilities.ml?.canGetJobs;

  const { data: alertsData, status: alertsStatus } = useFetcher(
    (callApmApi) => {
      if (!(isAlertingAvailable && canReadAlerts)) return;

      return callApmApi('GET /internal/apm/services/{serviceName}/alerts_count', {
        params: {
          path: { serviceName },
          query: { start, end, environment },
        },
      })
        .then((res) => ({ alertsCount: res.alertsCount }))
        .catch((): { alertsCount?: number } => ({}));
    },
    [serviceName, start, end, environment, isAlertingAvailable, canReadAlerts],
    { showToastOnError: false }
  );

  const { data: anomalyData, status: anomalyStatus } = useFetcher(
    (callApmApi) => {
      if (!canReadMlJobs) return;

      return callApmApi('GET /internal/apm/services/{serviceName}/anomaly_score', {
        params: {
          path: { serviceName },
          query: { start, end, environment },
        },
      })
        .then((res) => ({ anomalyScore: res.anomalyScore }))
        .catch((): { anomalyScore?: number } => ({}));
    },
    [serviceName, start, end, environment, canReadMlJobs],
    { showToastOnError: false }
  );

  const alertsResolved = alertsStatus === FETCH_STATUS.SUCCESS;
  const alertsCount = alertsResolved ? alertsData?.alertsCount ?? 0 : 0;
  const canShowAlerts = isAlertingAvailable && canReadAlerts && alertsResolved && alertsCount > 0;

  const anomalyResolved = anomalyStatus === FETCH_STATUS.SUCCESS;
  const anomalyScore = anomalyResolved ? anomalyData?.anomalyScore : undefined;
  const canShowAnomaly = canReadMlJobs && anomalyResolved && anomalyScore !== undefined;

  return {
    alertsCount: canShowAlerts ? alertsCount : undefined,
    anomalyScore: canShowAnomaly ? anomalyScore : undefined,
  };
}
