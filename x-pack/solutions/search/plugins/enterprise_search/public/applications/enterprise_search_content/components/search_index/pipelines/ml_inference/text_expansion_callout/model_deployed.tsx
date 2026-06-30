/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { useActions } from 'kea';

import {
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiIcon,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type { TextExpansionCallOutState } from './text_expansion_callout';
import { TextExpansionDismissButton, FineTuneModelsButton } from './text_expansion_callout';
import { TextExpansionCalloutLogic } from './text_expansion_callout_logic';

export const ModelDeployed = ({
  dismiss,
  ingestionMethod,
  isDismissable,
  isStartButtonDisabled,
}: Pick<
  TextExpansionCallOutState,
  'dismiss' | 'ingestionMethod' | 'isDismissable' | 'isStartButtonDisabled'
>) => {
  const { startTextExpansionModel } = useActions(TextExpansionCalloutLogic);

  return (
    <EuiCallOut color="success">
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem grow>
          <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiIcon color="success" type="checkCircleFill" aria-hidden />
            </EuiFlexItem>
            <EuiFlexItem grow>
              <EuiText color="success" size="xs">
                <h3>
                  {i18n.translate(
                    'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.deployedTitle',
                    { defaultMessage: 'Your ELSER model has deployed but not started.' }
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
                'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.deployedBody',
                {
                  defaultMessage:
                    'You may start the model in a single-threaded configuration for testing, or tune the performance for a production environment.',
                }
              )}
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiSpacer size="s" />
        </EuiFlexItem>
        <EuiFlexItem grow>
          <EuiFlexGroup
            direction="row"
            gutterSize="s"
            alignItems="center"
            justifyContent="flexStart"
          >
            <EuiFlexItem grow={false}>
              <EuiButton
                color="success"
                data-telemetry-id={`entSearchContent-${ingestionMethod}-pipelines-textExpansionCallOut-startModel`}
                disabled={isStartButtonDisabled}
                iconType="play"
                onClick={() => startTextExpansionModel()}
              >
                {i18n.translate(
                  'xpack.enterpriseSearch.content.indices.pipelines.textExpansionCallOut.startModelButton.label',
                  {
                    defaultMessage: 'Start single-threaded',
                  }
                )}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <FineTuneModelsButton />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiCallOut>
  );
};
