/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCopy,
  EuiFieldPassword,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormAppend,
  EuiFormRow,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';

interface Props {
  encodedApiKey?: string;
  isCreating: boolean;
  canCreate: boolean;
  onCreate: () => void;
}

export const ApiKeyField = ({ encodedApiKey, isCreating, canCreate, onCreate }: Props) => {
  const hasApiKey = Boolean(encodedApiKey);

  const apiKeyLabel = i18n.translate('xpack.observability_onboarding.apiEndpoints.apiKeyLabel', {
    defaultMessage: 'API key',
  });
  const noPermissionMessage = i18n.translate(
    'xpack.observability_onboarding.apiEndpoints.noPermissionMessage',
    {
      defaultMessage: "You don't have permission to create API keys. Contact your administrator.",
    }
  );

  return (
    <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
      <EuiFlexItem>
        <EuiFormRow
          fullWidth
          label={apiKeyLabel}
          helpText={!canCreate ? noPermissionMessage : undefined}
        >
          <EuiFieldPassword
            fullWidth
            type="dual"
            value={encodedApiKey ?? ''}
            placeholder={i18n.translate(
              'xpack.observability_onboarding.apiEndpoints.apiKeyPlaceholder',
              {
                defaultMessage: 'No API key yet',
              }
            )}
            data-test-subj="observabilityOnboardingApiEndpointApiKeyValue"
            aria-label={apiKeyLabel}
            append={
              hasApiKey ? (
                <EuiCopy textToCopy={encodedApiKey ?? ''}>
                  {(copy) => (
                    <EuiFormAppend
                      element="button"
                      iconLeft="copy"
                      onClick={copy}
                      data-test-subj="observabilityOnboardingApiEndpointApiKeyCopyButton"
                      aria-label={i18n.translate(
                        'xpack.observability_onboarding.apiEndpoints.copyButton',
                        {
                          defaultMessage: 'Copy to clipboard',
                        }
                      )}
                    />
                  )}
                </EuiCopy>
              ) : undefined
            }
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFormRow hasEmptyLabelSpace>
          <EuiToolTip content={!canCreate ? noPermissionMessage : undefined}>
            <EuiButton
              iconType="plusInCircle"
              onClick={onCreate}
              isLoading={isCreating}
              isDisabled={!canCreate}
              data-test-subj="observabilityOnboardingApiEndpointCreateApiKeyButton"
            >
              {i18n.translate('xpack.observability_onboarding.apiEndpoints.createKey', {
                defaultMessage: 'Create key',
              })}
            </EuiButton>
          </EuiToolTip>
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
