/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React from 'react';
import { ObservabilityOnboardingPricingFeature } from '../../../common/pricing_features';
import { KubernetesPanel } from '../quickstart_flows/kubernetes';
import { PageTemplate } from './template';
import { CustomHeader } from '../header';
import { usePricingFeature } from '../quickstart_flows/shared/use_pricing_feature';
import { useFlowBreadcrumb } from '../shared/use_flow_breadcrumbs';

export const KubernetesPage = () => {
  useFlowBreadcrumb(
    i18n.translate('xpack.observability_onboarding.autoDetectPanel.breadcrumbs.k8s', {
      defaultMessage: 'Kubernetes: Logs & Metrics',
    })
  );
  const metricsOnboardingEnabled = usePricingFeature(
    ObservabilityOnboardingPricingFeature.METRICS_ONBOARDING
  );

  return (
    <PageTemplate
      customHeader={
        <CustomHeader
          logo="kubernetes"
          headlineCopy={i18n.translate(
            'xpack.observability_onboarding.experimentalOnboardingFlow.customHeader.kubernetes.text',
            {
              defaultMessage: 'Monitor your Kubernetes Cluster with standalone Elastic Agent',
            }
          )}
          captionCopy={
            metricsOnboardingEnabled
              ? i18n.translate(
                  'xpack.observability_onboarding.experimentalOnboardingFlow.customHeader.kubernetes.caption.description',
                  {
                    defaultMessage:
                      'This installation is tailored for configuring and collecting metrics and logs by deploying a new Elastic Agent within your Kubernetes cluster.',
                  }
                )
              : i18n.translate(
                  'xpack.observability_onboarding.logsEssential.experimentalOnboardingFlow.customHeader.kubernetes.caption.description',
                  {
                    defaultMessage:
                      'This installation is tailored for configuring and collecting logs by deploying a new Elastic Agent within your Kubernetes cluster.',
                  }
                )
          }
        />
      }
    >
      <KubernetesPanel />
    </PageTemplate>
  );
};
