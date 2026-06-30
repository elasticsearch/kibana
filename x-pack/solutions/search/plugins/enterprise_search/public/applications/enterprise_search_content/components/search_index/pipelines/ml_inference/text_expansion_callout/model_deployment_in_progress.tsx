/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiText, EuiIcon } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type { TextExpansionCallOutState } from './text_expansion_callout';
import { TextExpansionDismissButton } from './text_expansion_callout';

export const ModelDeploymentInProgress = ({
  dismiss,
  isDismissable,
}: Pick<TextExpansionCallOutState, 'dismiss' | 'isDismissable'>) => (
  <EuiCallOut color="success">
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem grow>
        <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiIcon color="success" type="clock" aria-hidden />
          </EuiFlexItem>
          <EuiFlexItem grow>
            <EuiText color="success" size="xs">
              <h3>
                {i18n.translate(
                  'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.deployingTitle',
                  { defaultMessage: 'Your ELSER model is deploying.' }
                )}
              </h3>
            </EuiText>
          </EuiFlexItem>
          {isDismissable && (
            <EuiFlexItem grow={false}>
              <TextExpansionDismissButton dismiss={dismiss} />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow>
        <EuiText size="s">
          <p>
            {i18n.translate(
              'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.deployingBody',
              {
                defaultMessage:
                  'You can continue creating your pipeline with other uploaded models in the meantime.',
              }
            )}
          </p>
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiCallOut>
);
