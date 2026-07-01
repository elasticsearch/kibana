/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCallOut } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { getEnvironmentLabel } from '@kbn/apm-types';
import { isEmpty } from 'lodash';
import { useAnyOfApmParams } from '../../../hooks/use_apm_params';
import { useShouldShowAnomalyUi } from '../../../hooks/use_should_show_anomaly_ui';
import { useEnvironmentsContext } from '../../../context/environments_context/use_environments_context';
import { useLocalStorage } from '../../../hooks/use_local_storage';

export function AnomaliesAutomaticEnvironmentSelectionCallout() {
  const { environment, preferredEnvironment } = useEnvironmentsContext();
  const shouldShowAnomalyUi = useShouldShowAnomalyUi();

  const [calloutDismissed, setCalloutDismissed] = useLocalStorage(
    'apm.anomaliesAutomaticEnvironmentSelectionCallout.dismissed',
    false
  );

  const {
    query: { kuery },
  } = useAnyOfApmParams('/services/{serviceName}', '/mobile-services/{serviceName}');

  const shouldRender =
    environment !== preferredEnvironment &&
    shouldShowAnomalyUi &&
    !calloutDismissed &&
    isEmpty(kuery);

  if (!shouldRender) {
    return null;
  }

  const dismissCallout = () => {
    setCalloutDismissed(true);
  };

  return (
    <EuiCallOut
      data-test-subj="apmAnomaliesAutomaticEnvironmentSelectionCallout"
      onDismiss={dismissCallout}
      title={i18n.translate('xpack.apm.anomaliesAutomaticEnvironmentSelectionCallout.title', {
        defaultMessage: 'Automatic environment selection for anomaly detection data',
      })}
      iconType="info"
    >
      {i18n.translate('xpack.apm.anomaliesAutomaticEnvironmentSelectionCallout.body', {
        defaultMessage:
          'In single-environment setups, anomaly detection data is automatically sourced from the only environment available ("{environment}"). For multi-environment setups, you will have to manually select an environment before anomaly detection data can be displayed.',
        values: {
          environment: getEnvironmentLabel(preferredEnvironment),
        },
      })}
    </EuiCallOut>
  );
}
