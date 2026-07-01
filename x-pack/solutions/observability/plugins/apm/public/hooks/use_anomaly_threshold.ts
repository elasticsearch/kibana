/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ENVIRONMENT_ALL } from '@kbn/apm-types';
import { isEmpty } from 'lodash';
import { getIsAnomalyDetectionConfiguredForEnvironment } from '../../common/anomaly_detection/get_anomaly_detection_setup_state';
import type { AnomalyThreshold } from '../../common/anomaly_detection/anomaly_threshold';
import { getAnomalyThreshold } from '../../common/anomaly_detection/anomaly_threshold';
import { useAnyOfApmParams } from './use_apm_params';
import { useEnvironmentsContext } from '../context/environments_context/use_environments_context';
import { useAnomalyDetectionJobsContext } from '../context/anomaly_detection_jobs/use_anomaly_detection_jobs_context';

export type AnomalyThresholdDisabledReason =
  | 'allEnvironments'
  | 'notConfiguredForEnvironment'
  | 'kuery'
  | undefined;

const getDisabledReason = ({
  isAllEnvironments,
  hasKueryFilter,
  isConfiguredForEnvironment,
}: {
  isAllEnvironments: boolean;
  hasKueryFilter: boolean;
  isConfiguredForEnvironment: boolean;
}): AnomalyThresholdDisabledReason => {
  if (isAllEnvironments) {
    return 'allEnvironments';
  }

  if (!isConfiguredForEnvironment) {
    return 'notConfiguredForEnvironment';
  }

  if (hasKueryFilter) {
    return 'kuery';
  }

  return undefined;
};

export function useAnomalyThreshold(): {
  anomalyThreshold: AnomalyThreshold;
  isDisabled: boolean;
  disabledReason: AnomalyThresholdDisabledReason;
} {
  const {
    query: { kuery, anomalyThreshold: anomalyThresholdRaw },
  } = useAnyOfApmParams('/services/{serviceName}', '/mobile-services/{serviceName}');

  const { preferredEnvironment } = useEnvironmentsContext();
  const { anomalyDetectionSetupState } = useAnomalyDetectionJobsContext();
  const isConfiguredForEnvironment = getIsAnomalyDetectionConfiguredForEnvironment(
    anomalyDetectionSetupState
  );

  const isAllEnvironments = preferredEnvironment === ENVIRONMENT_ALL.value;
  const hasKueryFilter = !isEmpty(kuery);
  const isDisabled = isAllEnvironments || !isConfiguredForEnvironment || hasKueryFilter;

  return {
    anomalyThreshold: isDisabled ? 'none' : getAnomalyThreshold(anomalyThresholdRaw),
    isDisabled,
    disabledReason: getDisabledReason({
      isAllEnvironments,
      hasKueryFilter,
      isConfiguredForEnvironment,
    }),
  };
}
