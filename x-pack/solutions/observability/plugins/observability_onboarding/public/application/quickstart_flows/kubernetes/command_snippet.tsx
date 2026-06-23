/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCodeBlock, EuiLink, EuiSpacer, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { buildHelmCommand } from './build_helm_command';
import { CopyToClipboardButton } from '../shared/copy_to_clipboard_button';
import { usePricingFeature } from '../shared/use_pricing_feature';
import {
  WiredStreamsIngestionSelector,
  type IngestionMode,
} from '../shared/wired_streams_ingestion_selector';
import { ObservabilityOnboardingPricingFeature } from '../../../../common/pricing_features';
import type { ElasticAgentVersionInfo } from '../../../../common/types';
import type { ObservabilityOnboardingAppServices } from '../../..';
import { useWiredStreamsStatus } from '../../../hooks/use_wired_streams_status';

interface Props {
  encodedApiKey: string;
  onboardingId: string;
  elasticsearchUrl: string;
  isCopyPrimaryAction: boolean;
  elasticAgentVersionInfo: ElasticAgentVersionInfo;
  ingestionMode: IngestionMode;
  onIngestionModeChange: (mode: IngestionMode) => void;
  useInlineCopyOnly?: boolean;
  useColoredSyntax?: boolean;
}

export function CommandSnippet({
  encodedApiKey,
  onboardingId,
  elasticsearchUrl,
  isCopyPrimaryAction,
  elasticAgentVersionInfo,
  ingestionMode,
  onIngestionModeChange,
  useInlineCopyOnly = false,
  useColoredSyntax = false,
}: Props) {
  const {
    services: { docLinks },
  } = useKibana<ObservabilityOnboardingAppServices>();

  const metricsEnabled = usePricingFeature(
    ObservabilityOnboardingPricingFeature.METRICS_ONBOARDING
  );

  const {
    isEnabled: isWiredStreamsEnabled,
    isLoading: isWiredStreamsLoading,
    isEnabling,
    enableWiredStreams,
  } = useWiredStreamsStatus();
  const useWiredStreams = ingestionMode === 'wired';

  const command = buildHelmCommand({
    encodedApiKey,
    onboardingId,
    elasticsearchUrl,
    metricsEnabled,
    elasticAgentVersionInfo,
    useWiredStreams,
  });

  return (
    <>
      {!isWiredStreamsLoading && (
        <>
          <WiredStreamsIngestionSelector
            ingestionMode={ingestionMode}
            onChange={onIngestionModeChange}
            streamsDocLink={docLinks?.links.observability.logsStreams}
            isWiredStreamsEnabled={isWiredStreamsEnabled}
            isEnabling={isEnabling}
            flowType="elastic_agent_kubernetes"
            onEnableWiredStreams={enableWiredStreams}
          />
          <EuiSpacer size="xl" />
        </>
      )}

      <EuiText size={useColoredSyntax ? 's' : 'm'}>
        <p>
          <FormattedMessage
            id="xpack.observability_onboarding.kubernetesPanel.installElasticAgentDescription"
            defaultMessage="Copy and run the install command. Note that the following manifest contains resource limits that may not be appropriate for a production environment, review our guide on {scalingLink} before deploying this manifest. Refer to the {docsLink} for information on supported Helm versions."
            values={{
              scalingLink: (
                <EuiLink
                  data-test-subj="observabilityOnboardingKubernetesPanelScalingElasticAgentOnKubernetesLink"
                  href="https://www.elastic.co/guide/en/fleet/current/scaling-on-kubernetes.html"
                  external
                  target="_blank"
                >
                  {i18n.translate(
                    'xpack.observability_onboarding.kubernetesPanel.scalingElasticAgentOnLinkLabel',
                    { defaultMessage: 'Scaling Elastic Agent on Kubernetes' }
                  )}
                </EuiLink>
              ),
              docsLink: (
                <EuiLink
                  data-test-subj="observabilityOnboardingKubernetesPanelQuickstartDocsLink"
                  href="https://www.elastic.co/docs/solutions/observability/get-started/quickstart-monitor-kubernetes-cluster-with-elastic-agent"
                  external
                  target="_blank"
                >
                  {i18n.translate(
                    'xpack.observability_onboarding.kubernetesPanel.quickstartDocsLinkLabel',
                    { defaultMessage: 'quickstart guide' }
                  )}
                </EuiLink>
              ),
            }}
          />
        </p>
      </EuiText>

      <EuiSpacer />

      <EuiCodeBlock
        language={useColoredSyntax ? 'bash' : 'text'}
        paddingSize="m"
        fontSize={useColoredSyntax ? 's' : 'm'}
        isCopyable={useInlineCopyOnly}
        overflowHeight={useInlineCopyOnly ? 300 : undefined}
        data-test-subj="observabilityOnboardingKubernetesPanelCodeSnippet"
      >
        {command}
      </EuiCodeBlock>
      {!useInlineCopyOnly ? (
        <>
          <EuiSpacer />

          <CopyToClipboardButton textToCopy={command} fill={isCopyPrimaryAction} />
        </>
      ) : null}
    </>
  );
}
