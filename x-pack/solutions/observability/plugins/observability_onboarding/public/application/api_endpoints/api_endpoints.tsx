/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
  useIsWithinBreakpoints,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import React, { useEffect, useState } from 'react';
import type { ObservabilityOnboardingAppServices } from '../..';
import { LogoIcon } from '../shared/logo_icon';
import { ApiKeyField } from './api_key_field';
import { EndpointField } from './endpoint_field';
import { useApiEndpoints } from './use_api_endpoints';
import { useApiKeys } from './use_api_keys';

const LEARN_MORE_LINK = 'https://ela.st/connect-deployment-endpoints';

const API_ENDPOINTS_SECTION_ID = 'apiEndpoints';
const TITLE_ID = `${API_ENDPOINTS_SECTION_ID}Title`;

export const ApiEndpoints = () => {
  const {
    services: { share, application },
  } = useKibana<ObservabilityOnboardingAppServices>();
  const isMobile = useIsWithinBreakpoints(['xs', 's', 'm']);

  const { endpoints, isLoading, isError } = useApiEndpoints();
  const { encodedApiKeys, creatingEndpointId, createApiKey } = useApiKeys();
  const canCreateApiKey = Boolean(application.capabilities.api_keys?.save);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | undefined>(undefined);
  const [apiKeysManagementUrl, setApiKeysManagementUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const locator = share.url.locators.get('MANAGEMENT_APP_LOCATOR');
    locator?.getUrl({ sectionId: 'security', appId: 'api_keys' }).then(setApiKeysManagementUrl);
  }, [share.url.locators]);

  if (endpoints.length === 0) {
    return null;
  }

  const selectedEndpoint =
    endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ?? endpoints[0];

  const openInApiKeysLabel = i18n.translate(
    'xpack.observability_onboarding.apiEndpoints.openInApiKeys',
    { defaultMessage: 'Open in API keys' }
  );

  return (
    <>
      <EuiHorizontalRule margin="xl" />
      <section id={API_ENDPOINTS_SECTION_ID} aria-labelledby={TITLE_ID}>
        <EuiTitle size="s">
          <h3 id={TITLE_ID}>
            {i18n.translate('xpack.observability_onboarding.apiEndpoints.title', {
              defaultMessage: 'Connect directly to the endpoint',
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          <p>
            <FormattedMessage
              id="xpack.observability_onboarding.apiEndpoints.subtitle"
              defaultMessage="Access your deployment's endpoints and API keys directly. {learnMoreLink}"
              values={{
                learnMoreLink: (
                  <EuiLink
                    href={LEARN_MORE_LINK}
                    target="_blank"
                    external
                    data-test-subj="observabilityOnboardingApiEndpointsLearnMore"
                  >
                    {i18n.translate('xpack.observability_onboarding.apiEndpoints.learnMore', {
                      defaultMessage: 'Learn more',
                    })}
                  </EuiLink>
                ),
              }}
            />
          </p>
        </EuiText>
        <EuiSpacer size="l" />
        <EuiPanel hasShadow={false} hasBorder paddingSize="l">
          <EuiFlexGroup
            gutterSize="s"
            direction={isMobile ? 'column' : 'row'}
            responsive={false}
            alignItems={isMobile ? undefined : 'center'}
          >
            <EuiFlexItem>
              <EuiTabs bottomBorder={false}>
                {endpoints.map((endpoint) => (
                  <EuiTab
                    key={endpoint.id}
                    isSelected={endpoint.id === selectedEndpoint.id}
                    onClick={() => setSelectedEndpointId(endpoint.id)}
                    prepend={
                      <LogoIcon logo={endpoint.logo} euiIconType={endpoint.euiIconType} size="m" />
                    }
                    data-test-subj={`observabilityOnboardingApiEndpointTab-${endpoint.id}`}
                  >
                    {endpoint.label}
                  </EuiTab>
                ))}
              </EuiTabs>
            </EuiFlexItem>
            {!isMobile && canCreateApiKey && (
              <EuiLink
                href={apiKeysManagementUrl}
                data-test-subj="observabilityOnboardingApiEndpointsOpenInApiKeys"
              >
                {openInApiKeysLabel}
              </EuiLink>
            )}
          </EuiFlexGroup>
          {isError && (
            <>
              <EuiSpacer size="m" />
              <EuiCallOut
                announceOnMount
                color="warning"
                iconType="warning"
                size="s"
                title={i18n.translate(
                  'xpack.observability_onboarding.apiEndpoints.fetchErrorTitle',
                  {
                    defaultMessage:
                      'Could not load endpoint details. Refresh the page to try again.',
                  }
                )}
                data-test-subj="observabilityOnboardingApiEndpointsFetchError"
              />
            </>
          )}
          <EuiSpacer size="m" />
          <EuiFlexGroup direction={isMobile ? 'column' : 'row'} gutterSize="s" responsive={false}>
            <EuiFlexItem>
              <EndpointField url={selectedEndpoint.url} isLoading={isLoading} />
            </EuiFlexItem>
            <EuiFlexItem>
              <ApiKeyField
                encodedApiKey={encodedApiKeys[selectedEndpoint.id]}
                isCreating={creatingEndpointId === selectedEndpoint.id}
                canCreate={canCreateApiKey}
                onCreate={() => createApiKey(selectedEndpoint.id)}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          {isMobile && canCreateApiKey && (
            <>
              <EuiSpacer size="m" />
              <EuiButton
                size="s"
                href={apiKeysManagementUrl}
                fullWidth
                data-test-subj="observabilityOnboardingApiEndpointsOpenInApiKeys"
              >
                {openInApiKeysLabel}
              </EuiButton>
            </>
          )}
        </EuiPanel>
      </section>
    </>
  );
};
