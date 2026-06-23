/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, euiFontSize, EuiText } from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import type { WorkflowTokenUsage } from '@kbn/workflows';
import { ExecutionStatus, isDangerousStatus } from '@kbn/workflows';
import { formatDuration } from '../../../shared/lib/format_duration';
import { getStatusLabel } from '../../../shared/translations';
import { TokenUsageBadge } from '../../../shared/ui/token_usage_badge/token_usage_badge';

const actionRequiredLabel = i18n.translate(
  'workflowsManagement.stepExecutionTreeItemLabel.actionRequired',
  { defaultMessage: 'Action is required' }
);

export interface StepExecutionTreeItemLabelProps {
  stepId: string;
  status?: ExecutionStatus;
  executionTimeMs: number | null;
  usage?: WorkflowTokenUsage;
  selected: boolean;
  onClick?: React.MouseEventHandler;
}

export function StepExecutionTreeItemLabel({
  stepId,
  status,
  executionTimeMs,
  usage,
  selected,
  onClick,
}: StepExecutionTreeItemLabelProps) {
  const styles = useMemoCss(componentStyles);
  // Trigger pseudo-steps are not real steps, they are used to display the trigger context
  const isTriggerPseudoStep = stepId === 'trigger';
  const isOverviewPseudoStep = stepId === 'Overview';
  const isDangerous = status && isDangerousStatus(status);
  const isInactiveStatus = status === ExecutionStatus.SKIPPED || status === ExecutionStatus.PENDING;

  return (
    <EuiFlexGroup
      alignItems="baseline"
      gutterSize="xs"
      justifyContent="spaceBetween"
      responsive={false}
      css={styles.label}
      onClick={onClick}
    >
      <EuiFlexItem
        css={[
          styles.stepName,
          selected && styles.selectedStepName,
          isDangerous && styles.dangerousStepName,
          isInactiveStatus && styles.inactiveStepName,
        ]}
      >
        <span data-test-subj="workflowStepName">{stepId}</span>
        {status === ExecutionStatus.SKIPPED && (
          <>
            {' '}
            <span>{`(${getStatusLabel(status).toLowerCase()})`}</span>
          </>
        )}
      </EuiFlexItem>
      {status === ExecutionStatus.WAITING_FOR_INPUT && !isOverviewPseudoStep && (
        <EuiFlexItem grow={false}>
          <EuiBadge color="warning" data-test-subj="actionRequiredBadge">
            {actionRequiredLabel}
          </EuiBadge>
        </EuiFlexItem>
      )}
      {usage && !isTriggerPseudoStep && (
        <EuiFlexItem grow={false}>
          <TokenUsageBadge usage={usage} compact data-test-subj="workflowStepTreeTokenUsage" />
        </EuiFlexItem>
      )}
      {executionTimeMs && status !== ExecutionStatus.WAITING_FOR_INPUT && !isTriggerPseudoStep && (
        <EuiFlexItem grow={false} css={[styles.duration, isDangerous && styles.durationDangerous]}>
          <EuiText size="xs" color="subdued">
            {formatDuration(executionTimeMs)}
          </EuiText>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
}

const componentStyles = {
  label: (euiThemeContext: UseEuiTheme) =>
    css({
      ...euiFontSize(euiThemeContext, 's'),
    }),
  stepName: css({
    display: 'block',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textAlign: 'left',
    // The step name owns the flexible space and truncates with an ellipsis,
    // so the compact token-usage badge and the duration stay fully visible.
    minWidth: '3ch',
  }),
  selectedStepName: ({ euiTheme }: UseEuiTheme) =>
    css({
      fontWeight: 'bold',
      color: euiTheme.colors.textPrimary,
    }),
  dangerousStepName: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.danger,
    }),
  inactiveStepName: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textDisabled,
    }),
  duration: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textDisabled,
      paddingRight: euiTheme.size.xs,
    }),
  durationDangerous: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textDanger,
    }),
  executionIndex: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textDisabled,
      display: 'inline-block',
      marginLeft: euiTheme.size.xs,
    }),
};
