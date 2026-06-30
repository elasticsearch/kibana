/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiImage,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useKibana } from '../../../../common/lib/kibana';
import { useAttacksTour } from './attacks_tour_provider';
import {
  ATTACKS_TOUR_CALLOUT_DISMISS_TEST_ID,
  ATTACKS_TOUR_CALLOUT_DOCS_TEST_ID,
  ATTACKS_TOUR_CALLOUT_START_TEST_ID,
  ATTACKS_TOUR_CALLOUT_TEST_ID,
} from './constants';
import welcomeCalloutImage from './images/welcome_callout.svg';
import * as i18n from './translations';

const CALLOUT_IMAGE_SIZE = 80;

/**
 * The "What's new in Attacks" welcome callout. Renders above the page header and
 * lets the user start the guided tour, open the docs, or dismiss the promotion.
 */
const WelcomeTourCalloutComponent: React.FC = () => {
  const { euiTheme } = useEuiTheme();
  const {
    services: { docLinks },
  } = useKibana();
  const {
    isTourEnabled,
    isCalloutDismissed,
    tourState,
    startTour,
    dismissCallout,
    reportCalloutAction,
  } = useAttacksTour();

  const isVisible =
    isTourEnabled && !isCalloutDismissed && !tourState.isTourActive && !tourState.isTourComplete;

  const hasReportedView = useRef(false);
  useEffect(() => {
    if (isVisible && !hasReportedView.current) {
      hasReportedView.current = true;
      reportCalloutAction('view');
    }
  }, [isVisible, reportCalloutAction]);

  const onViewDocs = useCallback(() => {
    reportCalloutAction('view_docs');
  }, [reportCalloutAction]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <EuiPanel
        hasBorder
        hasShadow={false}
        paddingSize="m"
        color="plain"
        grow={false}
        borderRadius="m"
        data-test-subj={ATTACKS_TOUR_CALLOUT_TEST_ID}
        css={css`
          position: relative;
          background-color: ${euiTheme.colors.backgroundBaseHighlighted};
        `}
      >
        <EuiToolTip content={i18n.CALLOUT_DISMISS_ARIA_LABEL} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="cross"
            color="text"
            onClick={dismissCallout}
            aria-label={i18n.CALLOUT_DISMISS_ARIA_LABEL}
            data-test-subj={ATTACKS_TOUR_CALLOUT_DISMISS_TEST_ID}
            css={css`
              position: absolute;
              top: 8px;
              right: 8px;
            `}
          />
        </EuiToolTip>
        <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiImage
              size={CALLOUT_IMAGE_SIZE}
              alt=""
              src={welcomeCalloutImage}
              css={css`
                width: ${CALLOUT_IMAGE_SIZE}px;
                height: ${CALLOUT_IMAGE_SIZE}px;
              `}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h4>{i18n.CALLOUT_TITLE}</h4>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              {i18n.CALLOUT_DESCRIPTION}
            </EuiText>
            <EuiSpacer size="m" />
            <EuiFlexGroup direction="row" gutterSize="s" responsive={false} alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiButton
                  color="primary"
                  size="s"
                  onClick={startTour}
                  data-test-subj={ATTACKS_TOUR_CALLOUT_START_TEST_ID}
                >
                  {i18n.CALLOUT_START_TOUR}
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="s"
                  iconType="external"
                  iconSide="right"
                  href={docLinks.links.siem.attacksPage}
                  target="_blank"
                  rel="noopener"
                  onClick={onViewDocs}
                  data-test-subj={ATTACKS_TOUR_CALLOUT_DOCS_TEST_ID}
                >
                  {i18n.CALLOUT_VIEW_DOCS}
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
      <EuiSpacer size="l" />
    </>
  );
};

export const WelcomeTourCallout = React.memo(WelcomeTourCalloutComponent);
WelcomeTourCallout.displayName = 'WelcomeTourCallout';
