/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type FC } from 'react';
import {
  EuiButtonIcon,
  EuiCopy,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export const DeploymentDetailsEsInput: FC<{ elasticsearchUrl: string }> = ({
  elasticsearchUrl,
}) => {
  return (
    <EuiFormRow
      label={i18n.translate('cloud.deploymentDetails.elasticEndpointLabel', {
        defaultMessage: 'Elasticsearch endpoint',
      })}
      fullWidth
    >
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem>
          <EuiFieldText
            value={elasticsearchUrl}
            fullWidth
            disabled
            data-test-subj="deploymentDetailsEsEndpoint"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiCopy textToCopy={elasticsearchUrl}>
            {(copy) => (
              <EuiToolTip
                content={i18n.translate('cloud.deploymentDetails.copyEndpointButtonLabel', {
                  defaultMessage: 'Copy Elasticsearch endpoint',
                })}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  onClick={copy}
                  iconType="copy"
                  display="base"
                  size="m"
                  aria-label={i18n.translate('cloud.deploymentDetails.copyEndpointButtonLabel', {
                    defaultMessage: 'Copy Elasticsearch endpoint',
                  })}
                />
              </EuiToolTip>
            )}
          </EuiCopy>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFormRow>
  );
};
