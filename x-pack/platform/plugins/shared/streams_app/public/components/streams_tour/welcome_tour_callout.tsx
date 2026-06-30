/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiText,
  EuiButton,
  EuiLink,
  EuiSpacer,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useKibana } from '../../hooks/use_kibana';
import { useStreamsTour } from './streams_tour_provider';
import { AssetImage } from '../asset_image';

interface WelcomeTourCalloutProps {
  hasClassicStreams: boolean;
  firstClassicStreamName?: string;
}

export function WelcomeTourCallout({
  hasClassicStreams,
  firstClassicStreamName,
}: WelcomeTourCalloutProps) {
  const {
    core: { docLinks, notifications },
  } = useKibana();
  const { isCalloutDismissed, dismissCallout, startTour, tourState } = useStreamsTour();

  const isTourEnabled = notifications?.tours?.isEnabled() ?? true;

  if (isCalloutDismissed || !hasClassicStreams || tourState.isTourActive) {
    return null;
  }

  const handleStartTour = () => {
    startTour(firstClassicStreamName);
  };

  return (
    <>
      <EuiPanel hasBorder paddingSize="m" color="subdued" grow={false} borderRadius="m">
        <EuiFlexGroup alignItems="center">
          <EuiFlexItem grow={false}>
            <AssetImage type="yourPreviewWillAppearHere" size={140} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup alignItems="flexStart" direction="column" gutterSize="none">
              <EuiFlexItem
                css={css`
                  flex-grow: 0 !important;
                  margin-bottom: 4px;
                `}
              >
                <EuiTitle size="xs">
                  <h4>
                    {i18n.translate('xpack.streams.welcomeCallout.title', {
                      defaultMessage:
                        'Welcome to Streams, our next-generation model to manage your data in a single place',
                    })}
                  </h4>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  {i18n.translate('xpack.streams.welcomeCallout.description', {
                    defaultMessage:
                      'Existing Elasticsearch data streams appear in this list as classic streams, so you can manage field extraction and retention in one place.',
                  })}
                  <br />
                  {i18n.translate('xpack.streams.welcomeCallout.descriptionSecondLine', {
                    defaultMessage:
                      'To try the full managed hierarchy experience, pick "Wired Streams" in the Ingestion selector when onboarding new data.',
                  })}
                </EuiText>
              </EuiFlexItem>
              <EuiSpacer size="m" />
              <EuiFlexItem>
                <EuiFlexGroup direction="row" gutterSize="s" responsive={false} alignItems="center">
                  {isTourEnabled && (
                    <EuiFlexItem grow={false}>
                      <EuiButton color="primary" size="s" onClick={handleStartTour}>
                        {i18n.translate('xpack.streams.welcomeCallout.startTourButton', {
                          defaultMessage: 'Start tour',
                        })}
                      </EuiButton>
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      color="primary"
                      size="s"
                      href={docLinks.links.observability.logsStreams}
                      target="_blank"
                      rel="noopener"
                      iconType="external"
                      iconSide="right"
                    >
                      {i18n.translate('xpack.streams.welcomeCallout.docsButton', {
                        defaultMessage: 'View docs',
                      })}
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem
                    grow={false}
                    css={css`
                      margin-left: 10px;
                    `}
                  >
                    <EuiLink onClick={dismissCallout}>
                      {i18n.translate('xpack.streams.welcomeCallout.dismissButton', {
                        defaultMessage: "Don't show this again",
                      })}
                    </EuiLink>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
      <EuiSpacer size="l" />
    </>
  );
}
