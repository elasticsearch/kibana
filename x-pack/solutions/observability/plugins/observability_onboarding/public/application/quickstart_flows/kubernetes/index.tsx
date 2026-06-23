/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import type { EuiStepStatus } from '@elastic/eui';
import { EuiPanel, EuiSteps } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { usePerformanceContext } from '@kbn/ebt-tools';
import { DASHBOARD_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import { type LogsLocatorParams, LOGS_LOCATOR_ID } from '@kbn/logs-shared-plugin/common';
import { FETCH_STATUS } from '../../../hooks/use_fetcher';
import { EmptyPrompt } from '../shared/empty_prompt';
import { FeedbackButtons } from '../shared/feedback_buttons';
import { useKubernetesFlow } from './use_kubernetes_flow';
import { usePreExistingDataCheck } from '../shared/use_pre_existing_data_check';
import { useWindowBlurDataMonitoringTrigger } from '../shared/use_window_blur_data_monitoring_trigger';
import { type IngestionMode } from '../shared/wired_streams_ingestion_selector';
import { usePricingFeature } from '../shared/use_pricing_feature';
import { ObservabilityOnboardingPricingFeature } from '../../../../common/pricing_features';
import { WIRED_ECS_DATA_VIEW_SPEC } from '../shared/wired_streams_data_view';
import type { ObservabilityOnboardingContextValue } from '../../../plugin';
import type { ActionLink } from './data_ingest_status';
import { KubernetesElasticAgentInstallStep, KubernetesElasticAgentVisualizeStep } from './steps';

const CLUSTER_OVERVIEW_DASHBOARD_ID = 'kubernetes-f4dc26db-1b53-4ea2-a78b-1bfab8ea267c';

export const KubernetesPanel: React.FC = () => {
  const { data, status, error, refetch } = useKubernetesFlow();
  const { onPageReady } = usePerformanceContext();
  const [ingestionMode, setIngestionMode] = useState<IngestionMode>('classic');
  const metricsOnboardingEnabled = usePricingFeature(
    ObservabilityOnboardingPricingFeature.METRICS_ONBOARDING
  );
  const {
    services: { share },
  } = useKibana<ObservabilityOnboardingContextValue>();
  const dashboardLocator = share.url.locators.get(DASHBOARD_APP_LOCATOR);
  const logsLocator = share.url.locators.get<LogsLocatorParams>(LOGS_LOCATOR_ID);
  const useWiredStreams = ingestionMode === 'wired';
  const logsLocatorParams = useWiredStreams ? { dataViewSpec: WIRED_ECS_DATA_VIEW_SPEC } : {};

  const [dataReceived, setDataReceived] = useState(false);

  const hasPreExistingDataEarly = usePreExistingDataCheck({
    flow: 'kubernetes',
    onboardingId: data?.onboardingId,
  });

  const windowBlurred = useWindowBlurDataMonitoringTrigger({
    isActive: status === FETCH_STATUS.SUCCESS,
    onboardingFlowType: 'kubernetes',
    onboardingId: data?.onboardingId,
  });

  const isMonitoringStepActive = windowBlurred || hasPreExistingDataEarly;

  useEffect(() => {
    if (data) {
      onPageReady({
        meta: {
          description: `[ttfmp_onboarding] Request to create the onboarding flow succeeded and the flow's UI has rendered`,
        },
      });
    }
  }, [data, onPageReady]);

  if (error !== undefined) {
    return <EmptyPrompt onboardingFlowType="kubernetes" error={error} onRetryClick={refetch} />;
  }

  const kubernetesActionLinks: ActionLink[] = [
    ...(metricsOnboardingEnabled
      ? [
          {
            id: CLUSTER_OVERVIEW_DASHBOARD_ID,
            label: i18n.translate(
              'xpack.observability_onboarding.kubernetesPanel.exploreDashboard',
              { defaultMessage: 'Explore Kubernetes cluster' }
            ),
            title: i18n.translate(
              'xpack.observability_onboarding.kubernetesPanel.monitoringCluster',
              {
                defaultMessage: 'Overview your Kubernetes cluster with this pre-made dashboard',
              }
            ),
            requires: 'metrics' as const,
            href:
              dashboardLocator?.getRedirectUrl({
                dashboardId: CLUSTER_OVERVIEW_DASHBOARD_ID,
              }) ?? '',
          },
        ]
      : []),
    {
      id: 'logs',
      title: i18n.translate('xpack.observability_onboarding.kubernetesPanel.logsTitle', {
        defaultMessage: 'View and analyze your logs:',
      }),
      label: i18n.translate('xpack.observability_onboarding.kubernetesPanel.logsLabel', {
        defaultMessage: 'Explore logs',
      }),
      requires: 'logs' as const,
      href: logsLocator?.getRedirectUrl(logsLocatorParams) ?? '',
    },
  ];

  const steps = [
    {
      title: i18n.translate(
        'xpack.observability_onboarding.experimentalOnboardingFlow.kubernetes.installStepTitle',
        {
          defaultMessage: 'Install standalone Elastic Agent on your Kubernetes cluster',
        }
      ),
      children: (
        <KubernetesElasticAgentInstallStep
          status={status}
          data={data}
          isMonitoringStepActive={isMonitoringStepActive}
          ingestionMode={ingestionMode}
          onIngestionModeChange={setIngestionMode}
        />
      ),
    },
    {
      title: i18n.translate(
        'xpack.observability_onboarding.experimentalOnboardingFlow.kubernetes.monitorStepTitle',
        {
          defaultMessage: 'Monitor your Kubernetes cluster',
        }
      ),
      status: (dataReceived || hasPreExistingDataEarly
        ? 'complete'
        : isMonitoringStepActive
        ? 'current'
        : 'incomplete') as EuiStepStatus,
      children: (
        <KubernetesElasticAgentVisualizeStep
          isMonitoringStepActive={isMonitoringStepActive}
          data={data}
          actionLinks={kubernetesActionLinks}
          onDataReceived={() => setDataReceived(true)}
        />
      ),
    },
  ];

  return (
    <EuiPanel hasBorder paddingSize="xl">
      <EuiSteps steps={steps} />
      <FeedbackButtons flow="kubernetes" />
    </EuiPanel>
  );
};
