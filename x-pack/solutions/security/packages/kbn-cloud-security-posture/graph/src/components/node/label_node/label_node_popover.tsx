/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText, EuiIcon, EuiHorizontalRule, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { getAbbreviatedNumber } from '@kbn/cloud-security-posture-common';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import { RoundedBadge } from '../styles';
import type { DocumentAnalysisOutput } from './analyze_documents';

export const TEST_SUBJ_TITLE = 'label-node-tooltip-title';

const POPOVER_TITLE_MAX_WIDTH = 320;

const alertedEventsText = i18n.translate(
  'securitySolutionPackages.csp.graph.labelNode.tooltip.alertedEvents',
  {
    defaultMessage: 'Alerted events',
  }
);

const defaultEventsText = i18n.translate(
  'securitySolutionPackages.csp.graph.labelNode.tooltip.defaultEvents',
  {
    defaultMessage: 'Default events',
  }
);

interface LabelNodePopoverProps {
  analysis: DocumentAnalysisOutput;
  text?: string;
}

const CountText: React.FC<{ testSubj: string; children: React.ReactNode }> = ({
  testSubj,
  children,
}) => {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiText
      data-test-subj={testSubj}
      size="m"
      css={css`
        font-weight: ${euiTheme.font.weight.medium};
        color: ${euiTheme.colors.textHeading};
      `}
    >
      {children}
    </EuiText>
  );
};

const Section: React.FC<{ testSubj: string; badge: React.ReactNode; label: string }> = ({
  testSubj,
  badge,
  label,
}) => {
  const { euiTheme } = useEuiTheme();
  const isDarkMode = useKibanaIsDarkMode();

  return (
    <div
      data-test-subj={testSubj}
      css={css`
        display: flex;
        align-items: center;
        gap: ${euiTheme.size.s};
      `}
    >
      {badge}
      <EuiText
        size="s"
        color={isDarkMode ? 'ghost' : 'text'}
        css={css`
          font-weight: ${euiTheme.font.weight.medium};
        `}
      >
        {label}
      </EuiText>
    </div>
  );
};

const AlertBadge: React.FC<{ count: number }> = ({ count }) => (
  <RoundedBadge>
    <EuiIcon
      type="warningFill"
      color="danger"
      size="s"
      data-test-subj="label-node-tooltip-alert-icon"
    />
    <CountText testSubj="label-node-tooltip-alert-count">{getAbbreviatedNumber(count)}</CountText>
  </RoundedBadge>
);

const EventBadge: React.FC<{ count: number }> = ({ count }) => (
  <RoundedBadge>
    <CountText testSubj="label-node-tooltip-event-count">{getAbbreviatedNumber(count)}</CountText>
  </RoundedBadge>
);

export const LabelNodePopoverContent = ({ analysis, text }: LabelNodePopoverProps) => {
  const { euiTheme } = useEuiTheme();
  const hasTitle = Boolean(text);
  const hasCounters = analysis.uniqueAlertsCount > 0 || analysis.uniqueEventsCount > 0;

  return (
    <div
      css={css`
        display: flex;
        flex-direction: column;
        gap: ${euiTheme.size.s};
      `}
    >
      {hasTitle && (
        <EuiText
          data-test-subj={TEST_SUBJ_TITLE}
          size="s"
          css={css`
            font-weight: ${euiTheme.font.weight.bold};
            max-width: ${POPOVER_TITLE_MAX_WIDTH}px;
            word-break: break-word;
            overflow-wrap: anywhere;
          `}
        >
          {text}
        </EuiText>
      )}
      {hasTitle && hasCounters && (
        <EuiHorizontalRule
          margin="none"
          size="full"
          css={css`
            width: calc(100% + ${euiTheme.size.xl});
            margin-left: -${euiTheme.size.base};
          `}
        />
      )}
      {analysis.uniqueAlertsCount > 0 && (
        <Section
          testSubj="label-node-tooltip-alert-section"
          badge={<AlertBadge count={analysis.uniqueAlertsCount} />}
          label={alertedEventsText}
        />
      )}
      {analysis.uniqueEventsCount > 0 && (
        <Section
          testSubj="label-node-tooltip-event-section"
          badge={<EventBadge count={analysis.uniqueEventsCount} />}
          label={defaultEventsText}
        />
      )}
    </div>
  );
};
