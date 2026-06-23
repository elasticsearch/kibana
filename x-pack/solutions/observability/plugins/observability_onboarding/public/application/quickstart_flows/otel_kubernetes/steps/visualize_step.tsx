/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { DataIngestStatus, type ActionLink } from '../../kubernetes/data_ingest_status';

export interface OtelKubernetesVisualizeStepProps {
  isMonitoringStepActive: boolean;
  data?: { onboardingId: string };
  actionLinks: ActionLink[];
  onDataReceived: () => void;
  respectPreExistingData?: boolean;
}

export const OtelKubernetesVisualizeStep: React.FC<OtelKubernetesVisualizeStepProps> = ({
  isMonitoringStepActive,
  data,
  actionLinks,
  onDataReceived,
  respectPreExistingData = false,
}) => {
  if (!isMonitoringStepActive || !data) {
    return (
      <EuiText color="subdued" size="s">
        <p>
          {i18n.translate(
            'xpack.observability_onboarding.otelKubernetesPanel.visualizeStepInactiveDescription',
            {
              defaultMessage:
                'Run the collector setup command, then return here to confirm data arrives.',
            }
          )}
        </p>
      </EuiText>
    );
  }

  return (
    <DataIngestStatus
      onboardingId={data.onboardingId}
      onboardingFlowType="kubernetes_otel"
      dataset="kubernetes"
      integration="kubernetes_otel"
      actionLinks={actionLinks}
      onDataReceived={onDataReceived}
      respectPreExistingData={respectPreExistingData}
    />
  );
};
