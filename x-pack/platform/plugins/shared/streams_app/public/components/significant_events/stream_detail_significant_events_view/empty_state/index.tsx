/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonIcon,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiImage,
  EuiLink,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
  SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
} from '@kbn/significant-events-schema';
import { useInferenceFeatureConnectors } from '../../../../hooks/significant_events/use_inference_feature_connectors';
import { useModelSettingsUrl } from '../../../../hooks/use_model_settings_url';
import noSigEventsImage from './no_sig_events.svg';

export function EmptyState({
  isGenerating,
  isCanceling,
  isGenerateDisabled,
  onCancelGenerationClick,
  onGenerateSuggestionsClick,
}: {
  isGenerating: boolean;
  isCanceling: boolean;
  isGenerateDisabled: boolean;
  onCancelGenerationClick: () => void;
  onGenerateSuggestionsClick: () => void;
}) {
  const featuresConnectors = useInferenceFeatureConnectors(
    SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID
  );
  const queriesConnectors = useInferenceFeatureConnectors(
    SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID
  );

  const isConnectorLoading = featuresConnectors.loading || queriesConnectors.loading;
  const isConnectorMissing =
    !isConnectorLoading &&
    (!featuresConnectors.resolvedConnectorId || !queriesConnectors.resolvedConnectorId);

  const modelSettingsUrl = useModelSettingsUrl();

  return (
    <EuiEmptyPrompt
      titleSize="xs"
      title={
        <h2>
          {i18n.translate('xpack.streams.significantEvents.emptyState.title', {
            defaultMessage: "This stream's knowledge indicators have not been extracted yet",
          })}
        </h2>
      }
      icon={
        <EuiImage
          src={noSigEventsImage}
          alt={NO_SIGNIFICANT_EVENTS_IMAGE_ALT}
          size={240}
          hasShadow={false}
        />
      }
      body={
        <EuiFlexGroup direction="column" gutterSize="l">
          <EuiFlexItem>
            <EuiText size="s" textAlign="center" color="subdued">
              {i18n.translate('xpack.streams.significantEvents.emptyState.description', {
                defaultMessage:
                  'Generate knowledge indicators to teach the system about this stream. These indicators are the foundation for detecting significant events.',
              })}
            </EuiText>
          </EuiFlexItem>
          {isConnectorMissing ? (
            <EuiFlexItem>
              <EuiCallOut
                announceOnMount
                title={NO_CONNECTOR_CALLOUT_TITLE}
                color="warning"
                iconType="warning"
              >
                <p>
                  {NO_CONNECTOR_CALLOUT_DESCRIPTION}{' '}
                  {modelSettingsUrl && (
                    <EuiLink href={modelSettingsUrl} external>
                      {NO_CONNECTOR_CALLOUT_LINK_LABEL}
                    </EuiLink>
                  )}
                </p>
              </EuiCallOut>
            </EuiFlexItem>
          ) : (
            <EuiFlexItem>
              <EuiFlexGroup justifyContent="center" alignItems="center" responsive={false}>
                {isGenerating ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      content={CANCEL_GENERATION_BUTTON_ARIA_LABEL}
                      disableScreenReaderOutput
                    >
                      <EuiButtonIcon
                        aria-label={CANCEL_GENERATION_BUTTON_ARIA_LABEL}
                        iconType="stop"
                        onClick={onCancelGenerationClick}
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null}
                <EuiFlexItem grow={false}>
                  <EuiButton
                    size="m"
                    color="primary"
                    isLoading={isGenerating}
                    isDisabled={isGenerateDisabled || isGenerating || isConnectorLoading}
                    onClick={onGenerateSuggestionsClick}
                  >
                    {isGenerating
                      ? isCanceling
                        ? CANCELING_BUTTON_LABEL
                        : GENERATING_BUTTON_LABEL
                      : ONBOARD_STREAM_BUTTON_LABEL}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      }
    />
  );
}

const NO_SIGNIFICANT_EVENTS_IMAGE_ALT = i18n.translate(
  'xpack.streams.significantEvents.emptyState.imageAlt',
  {
    defaultMessage: 'No significant events illustration',
  }
);

const ONBOARD_STREAM_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEvents.emptyState.onboardStreamButtonLabel',
  {
    defaultMessage: 'Generate knowledge indicators',
  }
);

const GENERATING_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEvents.emptyState.generatingButtonLabel',
  {
    defaultMessage: 'Generating',
  }
);

const CANCELING_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEvents.emptyState.cancelingButtonLabel',
  {
    defaultMessage: 'Canceling',
  }
);

const CANCEL_GENERATION_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEvents.emptyState.cancelGenerationButtonAriaLabel',
  {
    defaultMessage: 'Cancel generation',
  }
);

const NO_CONNECTOR_CALLOUT_TITLE = i18n.translate(
  'xpack.streams.significantEvents.emptyState.noConnectorCalloutTitle',
  {
    defaultMessage: 'No connector configured',
  }
);

const NO_CONNECTOR_CALLOUT_DESCRIPTION = i18n.translate(
  'xpack.streams.significantEvents.emptyState.noConnectorCalloutDescription',
  {
    defaultMessage:
      'Generating knowledge indicators requires an AI connector. Open Model Settings to configure one.',
  }
);

const NO_CONNECTOR_CALLOUT_LINK_LABEL = i18n.translate(
  'xpack.streams.significantEvents.emptyState.noConnectorCalloutLinkLabel',
  {
    defaultMessage: 'Open Model Settings',
  }
);
