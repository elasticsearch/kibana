/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
  EuiButtonEmpty,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import { KibanaLogic } from '../../../../../../shared/kibana';

import { TRAINED_MODELS_PATH } from '../utils';

import type { TextExpansionCallOutState } from './text_expansion_callout';
import { TextExpansionDismissButton, FineTuneModelsButton } from './text_expansion_callout';

export const ModelStarted = ({
  dismiss,
  isCompact,
  isDismissable,
  isSingleThreaded,
}: Pick<
  TextExpansionCallOutState,
  'dismiss' | 'isCompact' | 'isDismissable' | 'isSingleThreaded'
>) => (
  <EuiCallOut color="success">
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexItem grow>
        <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiIcon type="checkCircleFill" color="success" aria-hidden />
          </EuiFlexItem>
          <EuiFlexItem grow>
            <EuiText color="success" size="xs">
              <h3>
                {isSingleThreaded
                  ? isCompact
                    ? i18n.translate(
                        'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.startedSingleThreadedTitleCompact',
                        { defaultMessage: 'Your ELSER model is running single-threaded.' }
                      )
                    : i18n.translate(
                        'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.startedSingleThreadedTitle',
                        { defaultMessage: 'Your ELSER model has started single-threaded.' }
                      )
                  : isCompact
                  ? i18n.translate(
                      'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.startedTitleCompact',
                      { defaultMessage: 'Your ELSER model is running.' }
                    )
                  : i18n.translate(
                      'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.startedTitle',
                      { defaultMessage: 'Your ELSER model has started.' }
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
      {!isCompact && (
        <>
          <EuiFlexItem grow>
            <EuiText size="s">
              <p>
                {isSingleThreaded
                  ? i18n.translate(
                      'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.startedSingleThreadedBody',
                      {
                        defaultMessage:
                          'This single-threaded configuration is great for testing your custom inference pipelines, however performance should be fine-tuned for production.',
                      }
                    )
                  : i18n.translate(
                      'xpack.enterpriseSearch.content.index.pipelines.textExpansionCallOut.startedBody',
                      {
                        defaultMessage:
                          'Enjoy the power of ELSER in your custom Inference pipeline.',
                      }
                    )}
              </p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup
              direction="row"
              gutterSize="m"
              alignItems="center"
              justifyContent="flexStart"
            >
              <EuiFlexItem grow={false}>
                {isSingleThreaded ? (
                  <FineTuneModelsButton />
                ) : (
                  <EuiButtonEmpty
                    iconSide="left"
                    iconType="wrench"
                    onClick={() =>
                      KibanaLogic.values.navigateToUrl(TRAINED_MODELS_PATH, {
                        shouldNotCreateHref: true,
                      })
                    }
                  >
                    {i18n.translate(
                      'xpack.enterpriseSearch.content.indices.pipelines.textExpansionCallOut.viewModelsButton',
                      {
                        defaultMessage: 'View details',
                      }
                    )}
                  </EuiButtonEmpty>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </>
      )}
    </EuiFlexGroup>
  </EuiCallOut>
);
