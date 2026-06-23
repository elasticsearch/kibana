/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiIcon, EuiText, EuiButtonEmpty, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { getAbbreviatedNumber } from '@kbn/cloud-security-posture-common';
import { RoundedBadge } from '../styles';
import type { DocumentAnalysisOutput } from './analyze_documents';

export const TEST_SUBJ_ALERT_ICON = 'label-node-alert-icon';
export const TEST_SUBJ_ALERT_COUNT = 'label-node-alert-count';
export const TEST_SUBJ_ALERT_COUNT_BUTTON = 'label-node-alert-count-button';
export const TEST_SUBJ_EVENT_COUNT = 'label-node-event-count';
export const TEST_SUBJ_EVENT_COUNT_BUTTON = 'label-node-event-count-button';

const POPOVER_EVENT_ARIA_LABEL = i18n.translate(
  'securitySolutionPackages.csp.graph.labelBadges.eventAriaLabel',
  {
    defaultMessage: 'Show event details',
  }
);

const POPOVER_ALERT_ARIA_LABEL = i18n.translate(
  'securitySolutionPackages.csp.graph.labelBadges.alertAriaLabel',
  {
    defaultMessage: 'Show alert details',
  }
);

interface LabelNodeBadgesProps {
  analysis: DocumentAnalysisOutput;
  onEventClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const CountText: React.FC<{ testSubj: string; color: string; children: React.ReactNode }> = ({
  testSubj,
  color,
  children,
}) => {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiText
      data-test-subj={testSubj}
      size="xs"
      color={color}
      css={css`
        font-weight: ${euiTheme.font.weight.medium};
      `}
    >
      {children}
    </EuiText>
  );
};

const AlertIcon: React.FC<{ color: string }> = ({ color }) => (
  <EuiIcon data-test-subj={TEST_SUBJ_ALERT_ICON} type="warningFill" color={color} size="s" />
);

const EventBadge: React.FC<{
  count: number;
  onEventClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ count, onEventClick }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <RoundedBadge>
      {onEventClick ? (
        <EuiButtonEmpty
          size="xs"
          data-test-subj={TEST_SUBJ_EVENT_COUNT_BUTTON}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();
            onEventClick?.(e);
          }}
          aria-label={POPOVER_EVENT_ARIA_LABEL}
          flush="both"
          css={css`
            font-weight: ${euiTheme.font.weight.medium};
            color: ${euiTheme.colors.textHeading};
          `}
        >
          {getAbbreviatedNumber(count)}
        </EuiButtonEmpty>
      ) : (
        <CountText testSubj={TEST_SUBJ_EVENT_COUNT} color={euiTheme.colors.textHeading}>
          {getAbbreviatedNumber(count)}
        </CountText>
      )}
    </RoundedBadge>
  );
};

const AlertCountBadge: React.FC<{
  count: number;
  inverted?: boolean;
  onEventClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ count, inverted, onEventClick }) => {
  const { euiTheme } = useEuiTheme();
  const bgColor = inverted ? euiTheme.colors.danger : undefined;
  const iconColor = inverted ? euiTheme.colors.backgroundBasePlain : 'danger';
  const textColor = inverted ? euiTheme.colors.textInverse : euiTheme.colors.textHeading;

  return (
    <RoundedBadge bgColor={bgColor}>
      <AlertIcon color={iconColor} />
      {onEventClick ? (
        <EuiButtonEmpty
          size="xs"
          data-test-subj={TEST_SUBJ_ALERT_COUNT_BUTTON}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();
            onEventClick?.(e);
          }}
          aria-label={POPOVER_ALERT_ARIA_LABEL}
          flush="both"
          css={css`
            font-weight: ${euiTheme.font.weight.medium};
            color: ${textColor};
          `}
        >
          {getAbbreviatedNumber(count)}
        </EuiButtonEmpty>
      ) : (
        <CountText testSubj={TEST_SUBJ_ALERT_COUNT} color={textColor}>
          {getAbbreviatedNumber(count)}
        </CountText>
      )}
    </RoundedBadge>
  );
};

const AlertIconBadge: React.FC = () => (
  <RoundedBadge>
    <AlertIcon color="danger" />
  </RoundedBadge>
);
export const LabelNodeBadges = ({ analysis, onEventClick }: LabelNodeBadgesProps) => {
  const { euiTheme } = useEuiTheme();

  if (analysis.isSingleEvent) {
    return null;
  }

  return (
    <div
      css={css`
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: ${euiTheme.size.xs};
      `}
    >
      {analysis.isSingleAlert && <AlertIconBadge />}
      {analysis.isGroupOfEvents && (
        <EventBadge count={analysis.uniqueEventsCount} onEventClick={onEventClick} />
      )}
      {analysis.isGroupOfAlerts && (
        <AlertCountBadge count={analysis.uniqueAlertsCount} onEventClick={onEventClick} />
      )}
      {analysis.isGroupOfEventsAndAlerts && (
        <>
          <EventBadge count={analysis.uniqueEventsCount} onEventClick={onEventClick} />
          <AlertCountBadge
            count={analysis.uniqueAlertsCount}
            inverted
            onEventClick={onEventClick}
          />
        </>
      )}
    </div>
  );
};
