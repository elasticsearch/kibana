/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiPanel, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';

import { i18n } from '@kbn/i18n';
import type { WorkflowStepExecutionDto, WorkflowTokenUsage } from '@kbn/workflows';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { type ApprovalLabels, ResumeExecutionButton } from './resume_execution_button';
import { StepExecutionDataView } from './step_execution_data_view';
import { formatDuration } from '../../../shared/lib/format_duration';
import { getStatusLabel } from '../../../shared/translations/status_translations';
import { FormattedRelativeEnhanced } from '../../../shared/ui/formatted_relative_enhanced/formatted_relative_enhanced';
import { getExecutionStatusIcon } from '../../../shared/ui/status_badge';
import { TokenUsageBadge } from '../../../shared/ui/token_usage_badge/token_usage_badge';

interface WorkflowExecutionOverviewProps {
  stepExecution: WorkflowStepExecutionDto;
  workflowExecutionDuration?: number;
  /** Aggregated token usage across all `ai.*` steps in this execution. */
  workflowExecutionUsage?: WorkflowTokenUsage;
  showResumeUI?: boolean;
  executionId?: string;
  resumeMessage?: string;
  resumeSchema?: JsonModelSchemaType;
  approvalLabels?: ApprovalLabels;
  shouldAutoResume?: boolean;
  waitingStepExecutionId?: string;
}

const formatExecutionDate = (date: string) => {
  const dateObj = new Date(date);

  if (isNaN(dateObj.getTime())) {
    return '-';
  }

  const formatted = dateObj.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const milliseconds = dateObj.getMilliseconds().toString().padStart(3, '0');
  return `${formatted.replace(',', ' @')}.${milliseconds}`;
};

export const WorkflowExecutionOverview = React.memo<WorkflowExecutionOverviewProps>(
  ({
    stepExecution,
    workflowExecutionDuration,
    workflowExecutionUsage,
    showResumeUI = false,
    executionId,
    resumeMessage,
    resumeSchema,
    approvalLabels,
    shouldAutoResume = false,
    waitingStepExecutionId,
  }) => {
    const { euiTheme } = useEuiTheme();

    const context = stepExecution.input as Record<string, unknown> | undefined;
    const executionData = context?.execution as { isTestRun?: boolean } | undefined;
    const isTestRun = executionData?.isTestRun === true;
    const executionStarted = stepExecution.startedAt;
    const executionEnded = context?.now as string | undefined;

    return (
      <EuiPanel
        hasShadow={false}
        paddingSize="m"
        css={{ height: '100%', paddingTop: euiTheme.size.m /* overrides EuiPanel's paddingTop */ }}
        data-test-subj="workflowExecutionOverview"
      >
        <EuiFlexGroup
          direction="column"
          gutterSize="m"
          css={{ height: '100%', overflow: 'hidden' }}
        >
          <EuiFlexItem grow={false}>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup direction="column" gutterSize="xs">
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                      <EuiFlexItem grow={false}>
                        {getExecutionStatusIcon(euiTheme, stepExecution.status)}
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText>
                          <h3 data-test-subj="workflowExecutionStatus">
                            {getStatusLabel(stepExecution.status)}
                          </h3>
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      <FormattedRelativeEnhanced value={executionStarted} />
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  {isTestRun && (
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="flask" size="s" color="subdued" aria-hidden={true} />
                    </EuiFlexItem>
                  )}
                  {workflowExecutionDuration && (
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <EuiIcon type="clock" size="s" color="subdued" aria-hidden={true} />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiText size="xs" color="subdued">
                            {formatDuration(workflowExecutionDuration)}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  )}
                  {workflowExecutionUsage && (
                    <EuiFlexItem grow={false}>
                      <TokenUsageBadge
                        usage={workflowExecutionUsage}
                        data-test-subj="workflowExecutionTokenUsage"
                      />
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <div
              css={css`
                border-top: ${euiTheme.border.width.thin} solid ${euiTheme.colors.lightShade};
                border-bottom: ${euiTheme.border.width.thin} solid ${euiTheme.colors.lightShade};
                padding: ${euiTheme.size.m} 0;
              `}
            >
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem>
                  <EuiFlexGroup direction="column" gutterSize="xs">
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {i18n.translate('workflowsManagement.executionOverview.executionStarted', {
                          defaultMessage: 'Execution started',
                        })}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="s">
                        <strong>
                          {executionStarted ? formatExecutionDate(executionStarted) : '-'}
                        </strong>
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>

                <EuiFlexItem
                  grow={false}
                  css={css`
                    width: ${euiTheme.border.width.thin};
                    background-color: ${euiTheme.colors.lightShade};
                    align-self: stretch;
                    margin-right: ${euiTheme.size.base};
                  `}
                />

                <EuiFlexItem>
                  <EuiFlexGroup direction="column" gutterSize="xs">
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {i18n.translate('workflowsManagement.executionOverview.executionEnded', {
                          defaultMessage: 'Execution ended',
                        })}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiText size="s">
                        <strong>
                          {executionEnded ? formatExecutionDate(executionEnded) : '-'}
                        </strong>
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </div>
          </EuiFlexItem>

          {showResumeUI && executionId && (
            <EuiFlexItem grow={false}>
              <ResumeExecutionButton
                executionId={executionId}
                workflowId={stepExecution.workflowId}
                stepStartedAt={stepExecution.startedAt}
                resumeMessage={resumeMessage}
                resumeSchema={resumeSchema}
                approvalLabels={approvalLabels}
                autoOpen={shouldAutoResume}
                waitingStepExecutionId={waitingStepExecutionId}
              />
            </EuiFlexItem>
          )}
          <EuiFlexItem css={{ overflow: 'hidden', minHeight: 0 }}>
            <StepExecutionDataView stepExecution={stepExecution} mode="input" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }
);

WorkflowExecutionOverview.displayName = 'WorkflowExecutionOverview';
