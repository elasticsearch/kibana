/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiCopy, EuiFieldText, EuiFormAppend, EuiFormRow } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';

interface Props {
  url?: string;
  isLoading: boolean;
}

export const EndpointField = ({ url, isLoading }: Props) => {
  return (
    <EuiFormRow
      fullWidth
      label={i18n.translate('xpack.observability_onboarding.apiEndpoints.endpointLabel', {
        defaultMessage: 'Endpoint',
      })}
    >
      <EuiFieldText
        fullWidth
        isLoading={isLoading}
        value={url ?? ''}
        data-test-subj="observabilityOnboardingApiEndpointValue"
        aria-label={i18n.translate('xpack.observability_onboarding.apiEndpoints.endpointLabel', {
          defaultMessage: 'Endpoint',
        })}
        append={
          <EuiCopy textToCopy={url ?? ''}>
            {(copy) => (
              <EuiFormAppend
                element="button"
                iconLeft="copy"
                onClick={copy}
                isDisabled={!url}
                data-test-subj="observabilityOnboardingApiEndpointCopyButton"
                aria-label={i18n.translate(
                  'xpack.observability_onboarding.apiEndpoints.copyButton',
                  {
                    defaultMessage: 'Copy to clipboard',
                  }
                )}
              />
            )}
          </EuiCopy>
        }
      />
    </EuiFormRow>
  );
};
