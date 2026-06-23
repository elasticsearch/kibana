/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiCode,
  EuiLink,
  EuiSpacer,
  EuiTabbedContent,
  EuiText,
  EuiTitle,
  type EuiTabbedContentTab,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { OBSERVABILITY_ONBOARDING_FLOW_PROGRESS_TELEMETRY_EVENT } from '../../../../common/telemetry_events';
import type { ObservabilityOnboardingAppServices } from '../../..';
import {
  OtelKubernetesAddRepositoryStep,
  OtelKubernetesInstallStep,
} from '../../quickstart_flows/otel_kubernetes/steps';
import { MaskedCodeBlock } from '../../quickstart_flows/shared/masked_code_block';

export type CollectorMethod = 'edot' | 'existing_collector';
type CollectorTabId = 'edot' | 'existing_collector';

const KUBE_STACK_DEFAULT_CONFIG_DOC_URL =
  'https://www.elastic.co/docs/reference/edot-collector/config/default-config-k8s';
const ELASTICSEARCH_OTLP_ENDPOINT_DOC_URL =
  'https://www.elastic.co/docs/manage-data/ingest/otlp-endpoint';

const buildManagedOtlpExporterYaml = ({
  onboardingId,
  managedOtlpEndpointUrl,
  apiKeyEncoded,
}: {
  onboardingId: string;
  managedOtlpEndpointUrl: string;
  apiKeyEncoded: string;
}) => `processors:
  resource/onboarding_id:
    attributes:
      - key: onboarding.id
        value: "${onboardingId}"
        action: upsert

exporters:
  otlp/elastic:
    endpoint: "${managedOtlpEndpointUrl}"
    headers:
      Authorization: "ApiKey ${apiKeyEncoded}"
    sending_queue:
      enabled: true
      sizer: bytes
      queue_size: 50000000
      block_on_overflow: true
      batch:
        flush_timeout: 1s
        min_size: 1000000
        max_size: 4000000

service:
  pipelines:
    logs:
      processors: [resource/onboarding_id]
      exporters: [otlp/elastic]
    metrics:
      processors: [resource/onboarding_id]
      exporters: [otlp/elastic]
    traces:
      processors: [resource/onboarding_id]
      exporters: [otlp/elastic]`;

const ManagedExistingCollectorContent: React.FC<{
  onboardingId?: string;
  managedOtlpEndpointUrl?: string;
  apiKeyEncoded?: string;
}> = ({ onboardingId, managedOtlpEndpointUrl, apiKeyEncoded }) => {
  const managedSnippet =
    onboardingId && managedOtlpEndpointUrl && apiKeyEncoded
      ? {
          value: buildManagedOtlpExporterYaml({
            onboardingId,
            managedOtlpEndpointUrl,
            apiKeyEncoded,
          }),
          secrets: [managedOtlpEndpointUrl, apiKeyEncoded],
        }
      : undefined;

  return (
    <>
      <EuiSpacer size="l" />
      <EuiTitle size="xs">
        <h3>
          {i18n.translate(
            'xpack.observability_onboarding.kubernetes.collectorSetup.managedExistingCollectorTitle',
            { defaultMessage: 'Add a managed OTLP exporter' }
          )}
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s">
        <p>
          <FormattedMessage
            id="xpack.observability_onboarding.kubernetes.collectorSetup.managedExistingCollectorDescription"
            defaultMessage="Add the following OTLP exporter and resource processor to your collector config. Ensure your receivers include {k8sCluster}, {kubeletstats}, {hostmetrics}, {fileLog}, and OTLP where applicable for full Kubernetes observability."
            values={{
              k8sCluster: <EuiCode>k8s_cluster</EuiCode>,
              kubeletstats: <EuiCode>kubeletstats</EuiCode>,
              hostmetrics: <EuiCode>hostmetrics</EuiCode>,
              fileLog: <EuiCode>file_log</EuiCode>,
            }}
          />
        </p>
        <p>
          <FormattedMessage
            id="xpack.observability_onboarding.kubernetes.collectorSetup.managedExistingCollectorOnboardingIdDescription"
            defaultMessage="Add the processor to each active logs, metrics, and traces pipeline. The {processor} processor sets {onboardingId} so Kibana can confirm data from this onboarding flow."
            values={{
              processor: <EuiCode>resource/onboarding_id</EuiCode>,
              onboardingId: <EuiCode>onboarding.id</EuiCode>,
            }}
          />
        </p>
      </EuiText>
      <EuiSpacer />
      {managedSnippet ? (
        <MaskedCodeBlock
          value={managedSnippet.value}
          secrets={managedSnippet.secrets}
          language="yaml"
          dataTestSubj="observabilityOnboardingKubernetesExistingCollectorManagedSnippet"
        />
      ) : (
        <EuiText size="s">
          <p>
            <FormattedMessage
              id="xpack.observability_onboarding.kubernetes.collectorSetup.managedExistingCollectorPreparingMessage"
              defaultMessage="Preparing your collector configuration. The snippet will appear when the onboarding flow is ready."
            />
          </p>
        </EuiText>
      )}
    </>
  );
};

const NonManagedExistingCollectorContent: React.FC = () => (
  <>
    <EuiSpacer size="l" />
    <EuiTitle size="xs">
      <h3>
        {i18n.translate(
          'xpack.observability_onboarding.kubernetes.collectorSetup.nonManagedExistingCollectorTitle',
          { defaultMessage: 'Use a gateway collector configuration' }
        )}
      </h3>
    </EuiTitle>
    <EuiSpacer size="s" />
    <EuiText size="s">
      <p>
        <FormattedMessage
          id="xpack.observability_onboarding.kubernetes.collectorSetup.nonManagedExistingCollectorDescription"
          defaultMessage="Managed OTLP is not available for this deployment. Use a gateway-style collector configuration based on the maintained EDOT Collector Kubernetes configuration, or configure export through the Elasticsearch OTLP endpoint."
        />
      </p>
      <p>
        <FormattedMessage
          id="xpack.observability_onboarding.kubernetes.collectorSetup.nonManagedExistingCollectorOnboardingIdDescription"
          defaultMessage="Kibana can only confirm data from this onboarding flow when telemetry includes the {onboardingId} resource attribute on logs and metrics."
          values={{ onboardingId: <EuiCode>onboarding.id</EuiCode> }}
        />
      </p>
      <ul>
        <li>
          <EuiLink
            href={KUBE_STACK_DEFAULT_CONFIG_DOC_URL}
            data-test-subj="observabilityOnboardingKubernetesExistingCollectorKubeStackDocsLink"
            target="_blank"
            external
          >
            {i18n.translate(
              'xpack.observability_onboarding.kubernetes.collectorSetup.kubeStackDocsLinkLabel',
              { defaultMessage: 'Default configuration of the EDOT Collector for Kubernetes' }
            )}
          </EuiLink>
        </li>
        <li>
          <EuiLink
            href={ELASTICSEARCH_OTLP_ENDPOINT_DOC_URL}
            data-test-subj="observabilityOnboardingKubernetesExistingCollectorOtlpEndpointDocsLink"
            target="_blank"
            external
          >
            {i18n.translate(
              'xpack.observability_onboarding.kubernetes.collectorSetup.otlpEndpointDocsLinkLabel',
              { defaultMessage: 'Elasticsearch OTLP endpoint' }
            )}
          </EuiLink>
        </li>
      </ul>
    </EuiText>
  </>
);

export interface OtelCollectorSetupStepProps {
  addRepoCommand: string;
  installStackCommand?: string;
  valuesFileUrl?: string;
  isManagedOtlpServiceAvailable: boolean;
  onboardingId?: string;
  managedOtlpEndpointUrl?: string;
  elasticsearchUrl?: string;
  apiKeyEncoded?: string;
  selectedCollectorMethod: CollectorMethod;
  onCollectorMethodChange: (method: CollectorMethod) => void;
}

export const OtelCollectorSetupStep: React.FC<OtelCollectorSetupStepProps> = ({
  addRepoCommand,
  installStackCommand,
  valuesFileUrl,
  isManagedOtlpServiceAvailable,
  onboardingId,
  managedOtlpEndpointUrl,
  elasticsearchUrl,
  apiKeyEncoded,
  selectedCollectorMethod,
  onCollectorMethodChange,
}) => {
  const {
    services: { analytics },
  } = useKibana<ObservabilityOnboardingAppServices>();
  const secretValues = useMemo(
    () =>
      [
        isManagedOtlpServiceAvailable ? managedOtlpEndpointUrl : elasticsearchUrl,
        apiKeyEncoded,
      ].filter((secretValue): secretValue is string => Boolean(secretValue)),
    [apiKeyEncoded, elasticsearchUrl, isManagedOtlpServiceAvailable, managedOtlpEndpointUrl]
  );

  const reportCollectorMethodSelection = useCallback(
    (method: CollectorMethod) => {
      onCollectorMethodChange(method);
      analytics?.reportEvent(OBSERVABILITY_ONBOARDING_FLOW_PROGRESS_TELEMETRY_EVENT.eventType, {
        onboardingFlowType: 'kubernetes_otel',
        onboardingId,
        step: 'collector_method_selected',
        context: {
          kubernetes: { selectedCollectorMethod: method },
        },
      });
    },
    [analytics, onboardingId, onCollectorMethodChange]
  );

  const tabs = useMemo<Array<EuiTabbedContentTab & { id: CollectorTabId }>>(
    () => [
      {
        id: 'edot',
        name: i18n.translate(
          'xpack.observability_onboarding.kubernetes.collectorSetup.edotTabLabel',
          { defaultMessage: 'Elastic Distribution for OTel Collector' }
        ),
        'data-test-subj': 'observabilityOnboardingKubernetesCollectorTab-edot',
        content: (
          <>
            <EuiSpacer size="l" />
            <OtelKubernetesAddRepositoryStep
              addRepoCommand={addRepoCommand}
              showTitle
              useInlineCopyOnly
            />
            <EuiSpacer size="xl" />
            <OtelKubernetesInstallStep
              installStackCommand={installStackCommand}
              valuesFileUrl={valuesFileUrl}
              secretValues={secretValues}
              showTitle
              useInlineCopyOnly
            />
          </>
        ),
      },
      {
        id: 'existing_collector',
        name: i18n.translate(
          'xpack.observability_onboarding.kubernetes.collectorSetup.existingCollectorTabLabel',
          { defaultMessage: 'Use existing collector' }
        ),
        'data-test-subj': 'observabilityOnboardingKubernetesCollectorTab-existing',
        content: isManagedOtlpServiceAvailable ? (
          <ManagedExistingCollectorContent
            onboardingId={onboardingId}
            managedOtlpEndpointUrl={managedOtlpEndpointUrl}
            apiKeyEncoded={apiKeyEncoded}
          />
        ) : (
          <NonManagedExistingCollectorContent />
        ),
      },
    ],
    [
      addRepoCommand,
      installStackCommand,
      valuesFileUrl,
      isManagedOtlpServiceAvailable,
      onboardingId,
      managedOtlpEndpointUrl,
      apiKeyEncoded,
      secretValues,
    ]
  );

  return (
    <div data-test-subj="observabilityOnboardingKubernetesCollectorTabs">
      <EuiTabbedContent
        tabs={tabs}
        selectedTab={tabs.find((tab) => tab.id === selectedCollectorMethod)}
        onTabClick={(tab) => reportCollectorMethodSelection(tab.id as CollectorMethod)}
      />
    </div>
  );
};
