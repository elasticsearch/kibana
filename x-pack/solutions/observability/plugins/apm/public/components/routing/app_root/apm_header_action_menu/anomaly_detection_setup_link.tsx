/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';
import { EuiHeaderLink, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { useEnvironmentsContext } from '../../../../context/environments_context/use_environments_context';
import { AnomalyDetectionSetupState } from '../../../../../common/anomaly_detection/get_anomaly_detection_setup_state';
import { getEnvironmentLabel } from '../../../../../common/environment_filter_values';
import { useAnomalyDetectionJobsContext } from '../../../../context/anomaly_detection_jobs/use_anomaly_detection_jobs_context';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { getLegacyApmHref } from '../../../shared/links/apm/apm_link_hooks';

export function AnomalyDetectionSetupLink() {
  const { preferredEnvironment } = useEnvironmentsContext();

  const { core } = useApmPluginContext();

  const { basePath } = core.http;

  const { anomalyDetectionSetupState } = useAnomalyDetectionJobsContext();

  let tooltipText: string = '';
  let color: 'warning' | 'primary' | 'success' | 'danger' = 'primary';
  let icon: IconType | undefined;

  if (anomalyDetectionSetupState === AnomalyDetectionSetupState.Failure) {
    color = 'warning';
    tooltipText = i18n.translate('xpack.apm.anomalyDetectionSetup.jobFetchFailureText', {
      defaultMessage: 'Could not determine state of anomaly detection setup.',
    });
    icon = 'machineLearningApp';
  } else if (
    anomalyDetectionSetupState === AnomalyDetectionSetupState.NoJobs ||
    anomalyDetectionSetupState === AnomalyDetectionSetupState.NoJobsForEnvironment
  ) {
    color = 'warning';
    tooltipText = getNoJobsMessage(anomalyDetectionSetupState, preferredEnvironment);
    icon = 'machineLearningApp';
  } else if (anomalyDetectionSetupState === AnomalyDetectionSetupState.UpgradeableJobs) {
    color = 'success';
    tooltipText = i18n.translate('xpack.apm.anomalyDetectionSetup.upgradeableJobsText', {
      defaultMessage: 'Updates available for existing anomaly detection jobs.',
    });
    icon = 'wrench';
  }

  const element = (
    <EuiHeaderLink
      color={color}
      iconType={icon}
      isLoading={anomalyDetectionSetupState === AnomalyDetectionSetupState.Loading}
      href={getLegacyApmHref({ basePath, path: '/settings/anomaly-detection' })}
      data-test-subj="apmAnomalyDetectionHeaderLink"
    >
      {ANOMALY_DETECTION_LINK_LABEL}
    </EuiHeaderLink>
  );

  const wrappedElement = tooltipText ? (
    <EuiToolTip position="bottom" content={tooltipText}>
      {element}
    </EuiToolTip>
  ) : (
    element
  );

  return wrappedElement;
}

function getNoJobsMessage(
  state: AnomalyDetectionSetupState.NoJobs | AnomalyDetectionSetupState.NoJobsForEnvironment,
  environment: string
) {
  if (state === AnomalyDetectionSetupState.NoJobs) {
    return i18n.translate('xpack.apm.anomalyDetectionSetup.notEnabledText', {
      defaultMessage: `Anomaly detection is not yet enabled. Click to continue setup.`,
    });
  }

  return i18n.translate('xpack.apm.anomalyDetectionSetup.notEnabledForEnvironmentText', {
    defaultMessage: `Anomaly detection is not yet enabled for the environment "{currentEnvironment}". Click to continue setup.`,
    values: { currentEnvironment: getEnvironmentLabel(environment) },
  });
}

const ANOMALY_DETECTION_LINK_LABEL = i18n.translate('xpack.apm.anomalyDetectionSetup.linkLabel', {
  defaultMessage: `Anomaly detection`,
});
