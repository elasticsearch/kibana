/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCodeBlock, EuiLink, EuiSpacer, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { CopyToClipboardButton } from '../../shared/copy_to_clipboard_button';

export interface OtelKubernetesAddRepositoryStepProps {
  addRepoCommand: string;
  showTitle?: boolean;
  useInlineCopyOnly?: boolean;
}

export const OtelKubernetesAddRepositoryStep: React.FC<OtelKubernetesAddRepositoryStepProps> = ({
  addRepoCommand,
  showTitle = false,
  useInlineCopyOnly = false,
}) => (
  <>
    {showTitle ? (
      <>
        <EuiTitle size="xs">
          <h3>
            {i18n.translate(
              'xpack.observability_onboarding.otelKubernetesPanel.addRepositoryTitle',
              { defaultMessage: 'Add the OpenTelemetry Helm repository' }
            )}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
      </>
    ) : null}
    <p>
      <FormattedMessage
        id="xpack.observability_onboarding.otelKubernetesPanel.addRepositoryDescription"
        defaultMessage="Run this command to add the Helm chart. Refer to the {docsLink} for information on supported Helm versions."
        values={{
          docsLink: (
            <EuiLink
              data-test-subj="observabilityOnboardingOtelKubernetesPanelQuickstartDocsLink"
              href="https://www.elastic.co/docs/solutions/observability/get-started/quickstart-unified-kubernetes-observability-with-elastic-distributions-of-opentelemetry-edot"
              external
              target="_blank"
            >
              {i18n.translate(
                'xpack.observability_onboarding.otelKubernetesPanel.quickstartDocsLinkLabel',
                { defaultMessage: 'quickstart guide' }
              )}
            </EuiLink>
          ),
        }}
      />
    </p>
    <EuiSpacer />
    <EuiCodeBlock
      paddingSize="m"
      language="bash"
      isCopyable={useInlineCopyOnly}
      data-test-subj="observabilityOnboardingOtelKubernetesAddRepositorySnippet"
    >
      {addRepoCommand}
    </EuiCodeBlock>
    {!useInlineCopyOnly ? (
      <>
        <EuiSpacer />
        <CopyToClipboardButton
          textToCopy={addRepoCommand}
          data-test-subj="observabilityOnboardingOtelKubernetesPanelAddRepositoryCopyToClipboard"
        />
      </>
    ) : null}
  </>
);
