/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { EuiStepStatus, EuiStepsProps } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { DASHBOARD_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import { usePerformanceContext } from '@kbn/ebt-tools';
import { LOGS_LOCATOR_ID } from '@kbn/logs-shared-plugin/common';
import { ObservabilityOnboardingPricingFeature } from '../../../../common/pricing_features';
import type { ObservabilityOnboardingAppServices } from '../../..';
import { FETCH_STATUS } from '../../../hooks/use_fetcher';
import { OnboardingFlowLayout } from '../../shared/onboarding_flow_layout';
import { useWindowBlurDataMonitoringTrigger } from '../../quickstart_flows/shared/use_window_blur_data_monitoring_trigger';
import { useManagedOtlpServiceAvailability } from '../../shared/use_managed_otlp_service_availability';
import { usePricingFeature } from '../../quickstart_flows/shared/use_pricing_feature';
import { FeedbackButtons } from '../../quickstart_flows/shared/feedback_buttons';
import { ManagedOtlpCallout } from '../../quickstart_flows/shared/managed_otlp_callout';
import { EmptyPrompt } from '../../quickstart_flows/shared/empty_prompt';
import { useFlowBreadcrumb } from '../../shared/use_flow_breadcrumbs';
import { useKubernetesFlow } from '../../quickstart_flows/kubernetes/use_kubernetes_flow';
import { buildInstallStackCommand } from '../../quickstart_flows/otel_kubernetes/build_install_stack_command';
import {
  CLUSTER_OVERVIEW_DASHBOARD_ID,
  OTEL_HELM_CHARTS_REPO,
} from '../../quickstart_flows/otel_kubernetes/constants';
import { buildValuesFileUrl } from '../../quickstart_flows/otel_kubernetes/build_values_file_url';
import { buildOtelKubernetesActionLinks } from '../../quickstart_flows/otel_kubernetes/build_otel_kubernetes_action_links';
import { OtelKubernetesVisualizeStep } from '../../quickstart_flows/otel_kubernetes/steps';
import { type CollectorMethod, OtelCollectorSetupStep } from './otel_collector_setup_step';
import { OtelInstrumentationStep } from './otel_instrumentation_step';

const SET_UP_OTEL_COLLECTOR_TITLE = i18n.translate(
  'xpack.observability_onboarding.kubernetes.otel.collectorSetupStepTitle',
  {
    defaultMessage: 'Set up the OpenTelemetry Collector',
  }
);

const INSTRUMENT_APPLICATION_STEP_TITLE = i18n.translate(
  'xpack.observability_onboarding.kubernetes.otel.instrumentationStepTitle',
  {
    defaultMessage: 'Instrument your application',
  }
);

export const KubernetesOtelPage: React.FC = () => {
  useFlowBreadcrumb(
    i18n.translate('xpack.observability_onboarding.autoDetectPanel.breadcrumbs.k8sOtel', {
      defaultMessage: 'Kubernetes: OpenTelemetry',
    })
  );

  const { data, status, error, refetch } = useKubernetesFlow('kubernetes_otel');
  const {
    services: { share },
  } = useKibana<ObservabilityOnboardingAppServices>();

  const { onPageReady } = usePerformanceContext();
  const isMetricsOnboardingEnabled = usePricingFeature(
    ObservabilityOnboardingPricingFeature.METRICS_ONBOARDING
  );
  const isManagedOtlpServiceAvailable = useManagedOtlpServiceAvailability();

  const [dataReceived, setDataReceived] = useState(false);
  const [selectedCollectorMethod, setSelectedCollectorMethod] = useState<CollectorMethod>('edot');
  const telemetryEventContext = useMemo(
    () => ({
      kubernetes: { selectedCollectorMethod },
    }),
    [selectedCollectorMethod]
  );

  const windowBlurred = useWindowBlurDataMonitoringTrigger({
    isActive: status === FETCH_STATUS.SUCCESS,
    onboardingFlowType: 'kubernetes_otel',
    onboardingId: data?.onboardingId,
    telemetryEventContext,
  });

  const isMonitoringStepActive = windowBlurred;

  useEffect(() => {
    if (data) {
      onPageReady({
        meta: {
          description: `[ttfmp_onboarding] Request to create the onboarding flow succeeded and the flow's UI has rendered`,
        },
      });
    }
  }, [data, onPageReady]);

  const apmLocator = share.url.locators.get('APM_LOCATOR');
  const dashboardLocator = share.url.locators.get(DASHBOARD_APP_LOCATOR);
  const logsLocator = share.url.locators.get(LOGS_LOCATOR_ID);

  const otelKubernetesActionLinks = useMemo(
    () =>
      buildOtelKubernetesActionLinks({
        isMetricsOnboardingEnabled,
        dashboardHref:
          dashboardLocator?.getRedirectUrl({ dashboardId: CLUSTER_OVERVIEW_DASHBOARD_ID }) ?? '',
        servicesHref: apmLocator?.getRedirectUrl({ serviceName: undefined }) ?? '',
        logsHref: logsLocator?.getRedirectUrl({}) ?? '',
      }),
    [isMetricsOnboardingEnabled, dashboardLocator, apmLocator, logsLocator]
  );

  const addRepoCommand = `helm repo add open-telemetry '${OTEL_HELM_CHARTS_REPO}' --force-update`;
  const otelKubeStackValuesFileUrl = data
    ? buildValuesFileUrl({
        isMetricsOnboardingEnabled,
        isManagedOtlpServiceAvailable,
        agentVersion: data.elasticAgentVersionInfo.agentBaseVersion,
      })
    : undefined;
  const installStackCommand = data
    ? buildInstallStackCommand({
        isMetricsOnboardingEnabled,
        isManagedOtlpServiceAvailable,
        managedOtlpEndpointUrl: data.managedOtlpServiceUrl,
        elasticsearchUrl: data.elasticsearchUrl,
        apiKeyEncoded: data.apiKeyEncoded,
        agentVersion: data.elasticAgentVersionInfo.agentBaseVersion,
        onboardingId: data.onboardingId,
      })
    : undefined;

  const steps: EuiStepsProps['steps'] = useMemo(() => {
    const collectorSetupStep = error
      ? {
          title: SET_UP_OTEL_COLLECTOR_TITLE,
          status: 'danger' as const,
          children: (
            <EmptyPrompt
              inline
              onboardingFlowType="kubernetes_otel"
              error={error}
              onRetryClick={refetch}
            />
          ),
        }
      : {
          title: SET_UP_OTEL_COLLECTOR_TITLE,
          children: (
            <OtelCollectorSetupStep
              addRepoCommand={addRepoCommand}
              installStackCommand={installStackCommand}
              valuesFileUrl={otelKubeStackValuesFileUrl}
              isManagedOtlpServiceAvailable={isManagedOtlpServiceAvailable}
              onboardingId={data?.onboardingId}
              managedOtlpEndpointUrl={data?.managedOtlpServiceUrl}
              elasticsearchUrl={data?.elasticsearchUrl}
              apiKeyEncoded={data?.apiKeyEncoded}
              selectedCollectorMethod={selectedCollectorMethod}
              onCollectorMethodChange={setSelectedCollectorMethod}
            />
          ),
        };

    if (error) {
      return [collectorSetupStep];
    }

    const instrumentStep = isMetricsOnboardingEnabled
      ? {
          title: INSTRUMENT_APPLICATION_STEP_TITLE,
          children: <OtelInstrumentationStep />,
        }
      : null;

    const visualizeStep = {
      title: i18n.translate('xpack.observability_onboarding.otelKubernetesPanel.monitorStepTitle', {
        defaultMessage: 'Visualize your data',
      }),
      status: (dataReceived
        ? 'complete'
        : isMonitoringStepActive
        ? 'current'
        : 'incomplete') as EuiStepStatus,
      children: (
        <OtelKubernetesVisualizeStep
          isMonitoringStepActive={isMonitoringStepActive}
          data={data}
          actionLinks={otelKubernetesActionLinks}
          onDataReceived={() => setDataReceived(true)}
        />
      ),
    };

    return [collectorSetupStep, ...(instrumentStep ? [instrumentStep] : []), visualizeStep];
  }, [
    addRepoCommand,
    error,
    refetch,
    installStackCommand,
    otelKubeStackValuesFileUrl,
    isManagedOtlpServiceAvailable,
    selectedCollectorMethod,
    isMetricsOnboardingEnabled,
    dataReceived,
    isMonitoringStepActive,
    data,
    otelKubernetesActionLinks,
  ]);

  return (
    <OnboardingFlowLayout
      title={i18n.translate('xpack.observability_onboarding.kubernetes.otel.title', {
        defaultMessage: 'Monitor your Kubernetes cluster',
      })}
      subtitle={i18n.translate('xpack.observability_onboarding.kubernetes.otel.subtitle', {
        defaultMessage: 'Collect logs, metrics, and traces from your Kubernetes infrastructure.',
      })}
      logo="kubernetes"
      returnTo="/"
      bodyDataTestSubj="observabilityOnboardingKubernetesLayout-otel"
      returnDataTestSubj="observabilityOnboardingKubernetesReturn"
      banners={<ManagedOtlpCallout />}
      steps={steps}
      feedback={<FeedbackButtons flow="otel_kubernetes" />}
    />
  );
};
